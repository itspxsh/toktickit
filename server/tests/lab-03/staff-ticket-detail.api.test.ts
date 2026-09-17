import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerStaffTicketDetailRoutes } from "../../src/routes/staff-ticket-detail.js";

const staffAuth: RequestHandler = (req, _res, next) => {
  (req as any).auth = {
    user: { id: 21, name: "Support One", email: "support@example.test", role: "IT_STAFF", isActive: true, mustChangePassword: false },
    session: { id: 1, userId: 21, tokenHash: "opaque", expiresAt: new Date(Date.now() + 60_000), invalidatedAt: null, user: {} },
    tokenHash: "opaque",
  };
  next();
};

const ticket = {
  id: 4,
  ticketNumber: "TKT-2026-000004",
  summary: "VPN access",
  description: "Cannot connect",
  ticketDate: new Date("2026-09-15T07:00:00.000Z"),
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  requesterResolvedAt: null,
  requester: { id: 12, name: "Example Requester", email: "requester@example.test" },
  assignedStaff: { id: 21, name: "Support One" },
  attachments: [{ id: 8, originalName: "error.png", mimeType: "image/png", sizeBytes: 1234, status: "ACTIVE", removedAt: null, removalReason: null, createdAt: new Date("2026-09-15T07:02:00.000Z") }],
  publicComments: [{ id: 7, body: "It still happens.", createdAt: new Date("2026-09-15T07:10:00.000Z"), author: { id: 12, name: "Example Requester", role: "REQUESTER" } }],
  internalNotes: [{ id: 9, body: "Checked gateway logs.", createdAt: new Date("2026-09-15T07:11:00.000Z"), author: { id: 21, name: "Support One", role: "IT_STAFF" } }],
};

function createTestApp(overrides: Record<string, any> = {}) {
  const calls = {
    ticketFindFirst: vi.fn(async () => overrides.ticket !== undefined ? overrides.ticket : ticket),
    ticketUpdate: vi.fn(async ({ data }: any) => ({ ...ticket, ...data })),
    ticketUpdateMany: vi.fn(async () => ({ count: overrides.claimCount ?? 1 })),
    userFindFirst: vi.fn(async () => overrides.staff !== undefined ? overrides.staff : { id: 21, name: "Support One", role: "IT_STAFF", isActive: true }),
    commentCreate: vi.fn(async ({ data }: any) => ({ id: 14, body: data.body, createdAt: new Date("2026-09-15T08:00:00.000Z"), author: { id: data.authorUserId, name: "Support One", role: "IT_STAFF" } })),
    noteCreate: vi.fn(async ({ data }: any) => ({ id: 15, body: data.body, createdAt: new Date("2026-09-15T08:01:00.000Z"), author: { id: data.authorUserId, name: "Support One", role: "IT_STAFF" } })),
  };
  const app = express();
  app.use(express.json());
  registerStaffTicketDetailRoutes(app, () => ({
    ticket: { findFirst: calls.ticketFindFirst, update: calls.ticketUpdate, updateMany: calls.ticketUpdateMany },
    user: { findFirst: calls.userFindFirst },
    publicComment: { create: calls.commentCreate },
    internalNote: { create: calls.noteCreate },
  }) as never, staffAuth, ((_req, _res, next) => next()) as RequestHandler);
  return { app, calls };
}

describe("staff ticket detail and workflow", () => {
  it("T-DETAIL-01 / AC-07 returns controlled detail with safe comments, notes, and attachment metadata", async () => {
    const { app } = createTestApp();
    const response = await request(app).get("/api/staff/tickets/TKT-2026-000004");
    expect(response.status).toBe(200);
    expect(response.body.ticket).toMatchObject({ ticketNumber: ticket.ticketNumber, itPriority: "HIGH", currentStatus: "IN_PROGRESS", appearsResolved: false });
    expect(response.body.ticket.publicComments[0].author).toEqual({ id: 12, name: "Example Requester", role: "REQUESTER" });
    expect(response.body.ticket.internalNotes[0].body).toBe("Checked gateway logs.");
    expect(JSON.stringify(response.body)).not.toContain("storageKey");
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("T-DETAIL-02 / AC-14 rejects malformed and foreign tickets safely", async () => {
    const { app } = createTestApp({ ticket: null });
    const malformed = await request(app).get("/api/staff/tickets/not-a-ticket");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe("INVALID_TICKET_NUMBER");
    const foreign = await request(app).get("/api/staff/tickets/TKT-2026-000004");
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("TICKET_NOT_FOUND");
  });

  it("T-STAFF-03 / AC-06 claims atomically and does not overwrite an existing owner", async () => {
    const { app: available, calls: availableCalls } = createTestApp({ claimCount: 1 });
    const claimed = await request(available).post("/api/staff/tickets/TKT-2026-000004/claim").send({});
    expect(claimed.status).toBe(200);
    expect(availableCalls.ticketUpdateMany).toHaveBeenCalled();

    const { app: occupied } = createTestApp({ claimCount: 0 });
    const conflict = await request(occupied).post("/api/staff/tickets/TKT-2026-000004/claim").send({});
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("TICKET_ALREADY_ASSIGNED");
  });

  it("T-STAFF-04 / AC-06 accepts active IT Staff only and protects workflow transitions", async () => {
    const { app } = createTestApp({ staff: null });
    const invalidAssignment = await request(app).patch("/api/staff/tickets/TKT-2026-000004/assignment").send({ assignedStaffId: 99 });
    expect(invalidAssignment.status).toBe(400);
    expect(invalidAssignment.body.error.code).toBe("INVALID_ASSIGNMENT");

    const transition = await request(app).patch("/api/staff/tickets/TKT-2026-000004/status").send({ currentStatus: "CLOSED", confirm: false });
    expect(transition.status).toBe(409);
    expect(transition.body.error.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("T-COMMENT-02..05 / AC-08..09 attributes append-only comments and notes on the server", async () => {
    const { app, calls } = createTestApp();
    const comment = await request(app).post("/api/tickets/TKT-2026-000004/comments").send({ body: "  Follow-up  ", authorUserId: 999, createdAt: "forged" });
    expect(comment.status).toBe(400);
    const unsafeComment = await request(app).post("/api/tickets/TKT-2026-000004/comments").send({ body: "<script>alert(1)</script>" });
    expect(unsafeComment.status).toBe(400);
    const validComment = await request(app).post("/api/tickets/TKT-2026-000004/comments").send({ body: "  Follow-up  " });
    expect(validComment.status).toBe(201);
    expect(validComment.body.comment.body).toBe("Follow-up");
    expect(calls.commentCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { ticketId: 4, authorUserId: 21, body: "Follow-up" } }));

    const note = await request(app).post("/api/staff/tickets/TKT-2026-000004/internal-notes").send({ body: "  Internal check  " });
    expect(note.status).toBe(201);
    expect(note.body.note.body).toBe("Internal check");
    expect(calls.noteCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { ticketId: 4, authorUserId: 21, body: "Internal check" } }));
  });
});
