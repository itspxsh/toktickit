import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "../../src/auth.js";
import { actionFingerprint } from "../../src/lab-04/action-rules.js";

const db = vi.hoisted(() => ({
  session: { findUnique: vi.fn() },
  requester: { findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  ticket: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  actionTaken: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  actionRevision: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));

vi.mock("../../src/prisma.js", () => ({ getPrisma: () => db }));

import { app } from "../../src/app.js";

const token = "test-session-token-that-is-long-enough";
const cookie = `tt_session=${token}`;
const actor = {
  id: 41,
  name: "Support Agent",
  email: "staff@example.test",
  passwordHash: "not-returned",
  role: "IT_STAFF",
  isActive: true,
  mustChangePassword: false,
};

function authenticatedAs(role: string) {
  db.session.findUnique.mockResolvedValue({
    id: 9,
    userId: actor.id,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + 60_000),
    invalidatedAt: null,
    user: { ...actor, role },
  });
}

describe("L4-04 Actions Taken API (T-ACT / T-SEC)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.session.findUnique.mockResolvedValue(null);
    db.requester.findUnique.mockResolvedValue(null);
    db.user.findFirst.mockResolvedValue(null);
    db.user.findMany.mockResolvedValue([]);
    db.user.count.mockResolvedValue(0);
    db.ticket.findFirst.mockResolvedValue(null);
    db.ticket.findUnique.mockResolvedValue(null);
    db.ticket.update.mockResolvedValue({ workflowVersion: 2 });
    db.$queryRaw.mockResolvedValue([{ id: 51 }]);
    db.actionTaken.findFirst.mockResolvedValue(null);
    db.actionTaken.findMany.mockResolvedValue([]);
    db.actionTaken.count.mockResolvedValue(0);
    db.actionRevision.findMany.mockResolvedValue([]);
    db.actionRevision.count.mockResolvedValue(0);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  });

  it("T-SEC-01 requires a valid session for the active support assignee lookup", async () => {
    const response = await request(app).get("/api/staff/assignees");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("T-SEC-01 rejects Requester access to support-only Actions and assignee APIs", async () => {
    authenticatedAs("REQUESTER");
    const assignees = await request(app).get("/api/staff/assignees").set("Cookie", cookie);
    const actions = await request(app).get("/api/staff/tickets/TKT-2026-000001/actions").set("Cookie", cookie);
    expect(assignees.status).toBe(403);
    expect(actions.status).toBe(403);
  });

  it("T-ACT-06 validates Ticket Number before querying owned Action data", async () => {
    authenticatedAs("REQUESTER");
    db.requester.findUnique.mockResolvedValue({ id: 7, isActive: true });
    const response = await request(app).get("/api/tickets/not-a-ticket/actions").set("Cookie", cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_TICKET_NUMBER");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an invalid action identifier before a database lookup", async () => {
    authenticatedAs("IT_STAFF");
    const response = await request(app)
      .get("/api/staff/tickets/TKT-2026-000001/actions/not-an-id/revisions")
      .set("Cookie", cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_IDENTIFIER");
    expect(db.actionRevision.findMany).not.toHaveBeenCalled();
  });

  it("T-ACT-01 creates a server-attributed Action, one revision, and advances the parent version", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.ticket.update.mockResolvedValue({ workflowVersion: 4 });
    db.user.findFirst.mockResolvedValue({ id: 77 });
    const action = {
      id: 90,
      ticketId: 51,
      clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
      payloadFingerprint: "a".repeat(64),
      createdById: actor.id,
      assigneeId: 77,
      performedById: null,
      description: "Check the VPN gateway configuration",
      result: "",
      followUpRequired: false,
      followUpNote: "",
      attachmentNotes: "Existing error image",
      state: "PLANNED",
      cancellationReason: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date("2026-10-10T00:00:00Z"),
      updatedAt: new Date("2026-10-10T00:00:00Z"),
      version: 1,
      createdBy: { id: actor.id, name: actor.name, role: actor.role, isActive: true },
      assignee: { id: 77, name: "Second Support Agent", role: "IT_STAFF", isActive: true },
      performedBy: null,
    };
    db.actionTaken.create.mockResolvedValue(action);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: action.clientRequestId,
        expectedTicketVersion: 3,
        assigneeId: 77,
        description: action.description,
        result: "",
        followUpRequired: false,
        followUpNote: "",
        attachmentNotes: action.attachmentNotes,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ticketVersion: 4, action: { id: 90, state: "PLANNED", createdBy: { id: actor.id }, assignee: { id: 77 }, performedBy: null } });
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|payloadFingerprint|clientRequestId|tokenHash/);
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { id: 77, isActive: true, role: { in: ["IT_STAFF", "ADMIN"] } }, select: { id: true } });
    expect(db.actionRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionId: 90, version: 1, actorId: actor.id, kind: "CREATE" }) }));
    expect(db.ticket.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 51 }, data: { workflowVersion: { increment: 1 } } }));
  });

  it("T-ACT-07 replays an authorized matching request before checking stale versions or terminal write state", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 9, currentStatus: "CLOSED", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    const payload = {
      clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
      expectedTicketVersion: 1,
      assigneeId: 77,
      description: "Check the VPN gateway configuration",
      result: "",
      followUpRequired: false,
      followUpNote: "",
      attachmentNotes: "",
    };
    db.actionTaken.findUnique.mockResolvedValue({
      id: 90,
      ticketId: 51,
      clientRequestId: payload.clientRequestId,
      payloadFingerprint: actionFingerprint(payload.assigneeId, {
        description: payload.description,
        result: payload.result,
        followUpRequired: payload.followUpRequired,
        followUpNote: payload.followUpNote,
        attachmentNotes: payload.attachmentNotes,
      }),
      createdById: actor.id,
      assigneeId: 77,
      performedById: null,
      description: "Check the VPN gateway configuration",
      result: "",
      followUpRequired: false,
      followUpNote: "",
      attachmentNotes: "",
      state: "PLANNED",
      cancellationReason: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date("2026-10-10T00:00:00Z"),
      updatedAt: new Date("2026-10-10T00:00:00Z"),
      version: 1,
      createdBy: { id: actor.id, name: actor.name, role: actor.role, isActive: true },
      assignee: { id: 77, name: "Second Support Agent", role: "IT_STAFF", isActive: true },
      performedBy: null,
    });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send(payload);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ticketVersion: 9, action: { id: 90, state: "PLANNED" } });
    expect(db.actionTaken.create).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("T-ACT-06 scopes Requester Actions through the session-derived Requester and returns no revision data", async () => {
    authenticatedAs("REQUESTER");
    db.requester.findUnique.mockResolvedValue({ id: 7, isActive: true });
    db.ticket.findFirst.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 4, currentStatus: "OPEN", assignedStaffId: null });
    db.actionTaken.findMany.mockResolvedValue([]);
    const response = await request(app).get("/api/tickets/TKT-2026-000051/actions?page=1&pageSize=20").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ticketVersion: 4 });
    expect(db.ticket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ticketNumber: "TKT-2026-000051", requesterId: 7, requester: { isActive: true } }) }));
    expect(JSON.stringify(response.body)).not.toMatch(/revision|internalNote|passwordHash|tokenHash/);
  });

  it("T-SEC-02 checks real Origin and CSRF middleware before any Action write", async () => {
    authenticatedAs("IT_STAFF");
    const noToken = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .send({});
    expect(noToken.status).toBe(403);
    expect(db.ticket.findFirst).not.toHaveBeenCalled();

    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const foreignOrigin = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "https://attacker.example")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({});
    expect(foreignOrigin.status).toBe(403);
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
    expect(db.actionTaken.create).not.toHaveBeenCalled();
  });

  it("T-SEC-03 rejects forged creator, performer, state, and parent fields before opening a write transaction", async () => {
    authenticatedAs("IT_STAFF");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
        expectedTicketVersion: 1,
        assigneeId: 77,
        description: "Inspect the gateway configuration",
        followUpRequired: false,
        createdById: 900,
        performedById: 901,
        state: "COMPLETED",
        ticketId: 902,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.actionTaken.create).not.toHaveBeenCalled();
  });

  it("T-ACT-04 forbids the PLANNED-to-COMPLETED shortcut", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValue({
      id: 90, ticketId: 51, clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232", payloadFingerprint: "unused",
      createdById: actor.id, assigneeId: 77, performedById: null, description: "Inspect gateway", result: "",
      followUpRequired: false, followUpNote: "", attachmentNotes: "", state: "PLANNED", cancellationReason: null,
      completedAt: null, cancelledAt: null, createdAt: new Date(), updatedAt: new Date(), version: 1,
      createdBy: { id: actor.id, name: actor.name, role: actor.role, isActive: true },
      assignee: { id: 77, name: "Second Support Agent", role: "IT_STAFF", isActive: true }, performedBy: null,
    });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions/90/transitions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, state: "COMPLETED", confirm: true, result: "Done" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ACTION_TRANSITION_NOT_ALLOWED");
    expect(db.actionTaken.updateMany).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
  });

  it("returns only active support assignees with bounded deterministic paging", async () => {
    authenticatedAs("IT_STAFF");
    db.user.findMany.mockResolvedValue([{ id: 77, name: "Second Support Agent", role: "IT_STAFF", isActive: true }]);
    db.user.count.mockResolvedValue(1);
    const response = await request(app).get("/api/staff/assignees?q=%20Support%20&page=1&pageSize=5").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [{ id: 77, name: "Second Support Agent", role: "IT_STAFF", isActive: true }], page: 1, pageSize: 5, total: 1, totalPages: 1 });
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ isActive: true, role: { in: ["IT_STAFF", "ADMIN"] }, OR: [{ name: { contains: "Support", mode: "insensitive" } }, { email: { contains: "Support", mode: "insensitive" } }] }),
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: { id: true, name: true, role: true, isActive: true },
    }));
    expect(JSON.stringify(response.body)).not.toMatch(/email|passwordHash|tokenHash/);

    const invalid = await request(app).get("/api/staff/assignees?pageSize=101").set("Cookie", cookie);
    expect(invalid.status).toBe(400);
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
  });

  it("T-ACT-09 rejects out-of-range Action and revision pagination before querying data", async () => {
    authenticatedAs("IT_STAFF");
    const actions = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions?page=0").set("Cookie", cookie);
    const revisions = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/1/revisions?pageSize=101").set("Cookie", cookie);
    expect(actions.status).toBe(400);
    expect(revisions.status).toBe(400);
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
    expect(db.actionTaken.findMany).not.toHaveBeenCalled();
    expect(db.actionRevision.findMany).not.toHaveBeenCalled();
  });

  it("T-ACT-05 exposes ordered staff-only revisions without adding Action or credential fields", async () => {
    authenticatedAs("IT_STAFF");
    db.ticket.findFirst.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 4, currentStatus: "OPEN", assignedStaffId: null });
    db.actionTaken.findFirst.mockResolvedValue({ id: 90 });
    db.actionRevision.findMany.mockResolvedValue([{ version: 1, kind: "CREATE", createdAt: new Date("2026-10-10T00:00:00Z"), actor: { id: actor.id, name: actor.name, role: actor.role, isActive: true }, snapshot: { description: "Inspect gateway" } }]);
    db.actionRevision.count.mockResolvedValue(1);
    const response = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/90/revisions").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [{ version: 1, kind: "CREATE", snapshot: { description: "Inspect gateway" } }], page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(response.body).not.toHaveProperty("ticketVersion");
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|tokenHash|email/);

    const invalid = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/90/revisions?focusActionId=90").set("Cookie", cookie);
    expect(invalid.status).toBe(400);
  });
});
