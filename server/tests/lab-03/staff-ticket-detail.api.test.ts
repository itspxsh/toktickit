import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerStaffTicketDetailRoutes } from "../../src/routes/staff-ticket-detail.js";
import { registerRequesterWorkflowRoutes } from "../../src/routes/requester-workflow.js";

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
  workflowVersion: 3,
  resolvedAt: null,
  requesterResolvedAt: null,
  requester: { id: 12, name: "Example Requester", email: "requester@example.test" },
  assignedStaff: { id: 21, name: "Support One" },
  attachments: [{ id: 8, originalName: "error.png", mimeType: "image/png", sizeBytes: 1234, status: "ACTIVE", removedAt: null, removalReason: null, createdAt: new Date("2026-09-15T07:02:00.000Z") }],
  publicComments: [{ id: 7, body: "It still happens.", createdAt: new Date("2026-09-15T07:10:00.000Z"), author: { id: 12, name: "Example Requester", role: "REQUESTER" } }],
  internalNotes: [{ id: 9, body: "Checked gateway logs.", createdAt: new Date("2026-09-15T07:11:00.000Z"), author: { id: 21, name: "Support One", role: "IT_STAFF" } }],
};

const adminAuth: RequestHandler = (req, _res, next) => {
  staffAuth(req, _res, () => {
    (req as any).auth.user.role = "ADMIN";
    next();
  });
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
  const transaction = {
    ticket: { findFirst: calls.ticketFindFirst, updateMany: calls.ticketUpdateMany },
    user: { findFirst: calls.userFindFirst },
    actionTaken: { findMany: vi.fn(async () => []) },
    ticketStatusEvent: { create: vi.fn(async () => ({ id: 1 })) },
    $queryRaw: vi.fn(async () => []),
  };
  const prisma = {
    ticket: { findFirst: calls.ticketFindFirst, update: calls.ticketUpdate, updateMany: calls.ticketUpdateMany, create: vi.fn() },
    requester: { findUnique: vi.fn() },
    publicComment: { create: calls.commentCreate },
    user: { findFirst: calls.userFindFirst },
    internalNote: { create: calls.noteCreate },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
  };
  const app = express();
  app.use(express.json());
  registerRequesterWorkflowRoutes(app, () => prisma as never, staffAuth, ((_req, _res, next) => next()) as RequestHandler);
  registerStaffTicketDetailRoutes(app, () => prisma as never, overrides.auth ?? staffAuth, ((_req, _res, next) => next()) as RequestHandler);
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

  it("T-DETAIL-03 / AC-14 requires a version and updates priority through the locked Ticket", async () => {
    const { app, calls } = createTestApp();
    const missingVersion = await request(app).patch("/api/staff/tickets/TKT-2026-000004/priority").send({ itPriority: "URGENT" });
    expect(missingVersion.status).toBe(400);
    expect(missingVersion.body.error).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { expectedTicketVersion: expect.any(String) } });
    const response = await request(app).patch("/api/staff/tickets/TKT-2026-000004/priority").send({ expectedTicketVersion: 3, itPriority: "URGENT" });
    expect(response.status).toBe(200);
    expect(calls.ticketFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { ticketNumber: ticket.ticketNumber, requester: { isActive: true } } }));
    expect(calls.ticketUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ticket.id, workflowVersion: 3 }, data: { itPriority: "URGENT", workflowVersion: { increment: 1 } } }));
  });

  it("T-STAFF-03 / AC-06 claims atomically and does not overwrite an existing owner", async () => {
    const { app: available, calls: availableCalls } = createTestApp({ claimCount: 1 });
    const missingVersion = await request(available).post("/api/staff/tickets/TKT-2026-000004/claim").send({});
    expect(missingVersion.status).toBe(400);
    expect(missingVersion.body.error).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { expectedTicketVersion: expect.any(String) } });
    const claimed = await request(available).post("/api/staff/tickets/TKT-2026-000004/claim").send({ expectedTicketVersion: 3 });
    expect(claimed.status).toBe(200);
    expect(availableCalls.ticketFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { ticketNumber: ticket.ticketNumber, requester: { isActive: true } } }));
    expect(availableCalls.ticketUpdateMany).toHaveBeenCalledWith({ where: { id: ticket.id, workflowVersion: 3, assignedStaffId: null }, data: { assignedStaffId: 21, workflowVersion: { increment: 1 } } });

    const occupied = createTestApp({ claimCount: 0 });
    const conflict = await request(occupied.app).post("/api/staff/tickets/TKT-2026-000004/claim").send({ expectedTicketVersion: 3 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("TICKET_ALREADY_ASSIGNED");
  });

  it("T-STAFF-04 / AC-06 validates assignment and protects versioned workflow transitions", async () => {
    const { app, calls } = createTestApp({ staff: null });
    const missingAssignmentVersion = await request(app).patch("/api/staff/tickets/TKT-2026-000004/assignment").send({ assignedStaffId: 99 });
    expect(missingAssignmentVersion.status).toBe(400);
    expect(missingAssignmentVersion.body.error).toMatchObject({ code: "VALIDATION_ERROR", fieldErrors: { expectedTicketVersion: expect.any(String) } });
    const invalidAssignment = await request(app).patch("/api/staff/tickets/TKT-2026-000004/assignment").send({ expectedTicketVersion: 3, assignedStaffId: 99 });
    expect(invalidAssignment.status).toBe(400);
    expect(invalidAssignment.body.error.code).toBe("VALIDATION_ERROR");
    expect(invalidAssignment.body.error.fieldErrors).toHaveProperty("assignedStaffId");
    expect(calls.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 99, role: { in: ["IT_STAFF", "ADMIN"] }, isActive: true } }));

    const transition = await request(app).patch("/api/staff/tickets/TKT-2026-000004/status").send({ expectedTicketVersion: 3, currentStatus: "CLOSED", confirm: false });
    expect(transition.status).toBe(409);
    expect(transition.body.error.code).toBe("CONFIRMATION_REQUIRED");

    const priority = await request(createTestApp().app).patch("/api/staff/tickets/TKT-2026-000004/priority").send({ expectedTicketVersion: 3, itPriority: "URGENT", authorUserId: 999, updatedAt: "forged" });
    expect(priority.status).toBe(400);

    const reopened = createTestApp({ ticket: { ...ticket, currentStatus: "CANCELLED" } });
    const forbiddenReopen = await request(reopened.app).patch("/api/staff/tickets/TKT-2026-000004/status").send({ expectedTicketVersion: 3, currentStatus: "REOPENED" });
    expect(forbiddenReopen.status).toBe(403);
    expect(forbiddenReopen.body.error.code).toBe("FORBIDDEN");

    const adminReopen = createTestApp({ ticket: { ...ticket, currentStatus: "CANCELLED" }, auth: adminAuth });
    const allowedReopen = await request(adminReopen.app).patch("/api/staff/tickets/TKT-2026-000004/status").send({ expectedTicketVersion: 3, currentStatus: "REOPENED" });
    expect(allowedReopen.status).toBe(200);
    expect(adminReopen.calls.ticketUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ticket.id, workflowVersion: 3, currentStatus: "CANCELLED" }, data: expect.objectContaining({ currentStatus: "REOPENED", resolvedAt: null }) }));
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
