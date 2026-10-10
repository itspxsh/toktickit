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

function actionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 90,
    ticketId: 51,
    clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
    payloadFingerprint: "f".repeat(64),
    createdById: actor.id,
    assigneeId: 77,
    performedById: null,
    description: "Inspect gateway configuration",
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
    ...overrides,
  };
}

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

  it.each([
    ["expired", { expiresAt: new Date(Date.now() - 60_000), invalidatedAt: null, isActive: true }],
    ["inactive", { expiresAt: new Date(Date.now() + 60_000), invalidatedAt: null, isActive: false }],
  ])("T-SEC-01 rejects an %s session before looking up Actions", async (_label, state) => {
    db.session.findUnique.mockResolvedValue({
      id: 9,
      userId: actor.id,
      tokenHash: hashSessionToken(token),
      expiresAt: state.expiresAt,
      invalidatedAt: state.invalidatedAt,
      user: { ...actor, isActive: state.isActive },
    });
    const response = await request(app)
      .get("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
  });

  it("T-SEC-01 blocks Actions for a first-login account until its password changes", async () => {
    authenticatedAs("IT_STAFF");
    db.session.findUnique.mockResolvedValue({
      id: 9,
      userId: actor.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60_000),
      invalidatedAt: null,
      user: { ...actor, mustChangePassword: true },
    });
    const response = await request(app)
      .get("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
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

  it.each(["missing", "inactive", "Requester"])("T-ACT-02 rejects a %s assignee without writing", async () => {
    authenticatedAs("IT_STAFF");
    db.ticket.findFirst.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null });
    db.ticket.findUnique.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null });
    // The filtered query returns no row for absent, inactive, or wrong-role identities.
    db.user.findFirst.mockResolvedValue(null);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
        expectedTicketVersion: 3,
        assigneeId: 77,
        description: "Inspect gateway configuration",
        followUpRequired: false,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { id: 77, isActive: true, role: { in: ["IT_STAFF", "ADMIN"] } }, select: { id: true } });
    expect(db.actionTaken.create).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("T-ACT-03 rejects out-of-bound Action text before querying the Ticket", async () => {
    authenticatedAs("IT_STAFF");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
        expectedTicketVersion: 3,
        assigneeId: 77,
        description: "x".repeat(2_001),
        followUpRequired: false,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toHaveProperty("description");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ["result", "x".repeat(2_001)],
    ["followUpNote", "x".repeat(2_001)],
    ["attachmentNotes", "x".repeat(1_001)],
  ])("T-ACT-03 enforces the %s maximum", async (field, value) => {
    authenticatedAs("IT_STAFF");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
        expectedTicketVersion: 3,
        assigneeId: 77,
        description: "Inspect gateway configuration",
        followUpRequired: false,
        [field]: value,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toHaveProperty(field);
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
  });

  it("T-ACT-03 rejects a non-boolean Follow-up Required value", async () => {
    authenticatedAs("IT_STAFF");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
        expectedTicketVersion: 3,
        assigneeId: 77,
        description: "Inspect gateway configuration",
        followUpRequired: "yes",
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toHaveProperty("followUpRequired");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
  });

  it("T-ACT-03 rejects required follow-up without a valid note on create", async () => {
    authenticatedAs("IT_STAFF");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({
        clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
        expectedTicketVersion: 3,
        assigneeId: 77,
        description: "Inspect gateway configuration",
        followUpRequired: true,
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toHaveProperty("followUpNote");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
    expect(db.actionTaken.create).not.toHaveBeenCalled();
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

  it.each([
    ["different normalized payload", actor.id, "Changed gateway inspection"],
    ["different actor", 42, "Check the VPN gateway configuration"],
  ])("T-ACT-07 rejects same-key replay with a %s", async (_case, currentActorId, description) => {
    authenticatedAs("IT_STAFF");
    if (currentActorId !== actor.id) {
      db.session.findUnique.mockResolvedValue({
        id: 9,
        userId: currentActorId,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 60_000),
        invalidatedAt: null,
        user: { ...actor, id: currentActorId },
      });
    }
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 4, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    const payload = {
      clientRequestId: "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
      expectedTicketVersion: 3,
      assigneeId: 77,
      description,
      followUpRequired: false,
    };
    db.actionTaken.findUnique.mockResolvedValue(actionFixture({
      clientRequestId: payload.clientRequestId,
      payloadFingerprint: actionFingerprint(77, { description: "Check the VPN gateway configuration", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" }),
      createdById: actor.id,
    }));
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send(payload);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(db.actionTaken.create).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("T-ACT-06 scopes Requester Actions through the session-derived Requester and returns no revision data", async () => {
    authenticatedAs("REQUESTER");
    db.requester.findUnique.mockResolvedValue({ id: 7, isActive: true });
    db.ticket.findFirst.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 4, currentStatus: "OPEN", assignedStaffId: null });
    db.actionTaken.findMany.mockResolvedValue([]);
    const response = await request(app).get("/api/tickets/TKT-2026-000051/actions").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ticketVersion: 4 });
    expect(db.ticket.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ticketNumber: "TKT-2026-000051", requesterId: 7, requester: { isActive: true } }) }));
    expect(JSON.stringify(response.body)).not.toMatch(/revision|internalNote|passwordHash|tokenHash/);
  });

  it("T-ACT-06 returns byte-identical safe 404s for missing and foreign-parent Tickets", async () => {
    authenticatedAs("REQUESTER");
    db.requester.findUnique.mockResolvedValue({ id: 7, isActive: true });
    db.ticket.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const missing = await request(app).get("/api/tickets/TKT-2026-000051/actions").set("Cookie", cookie);
    const foreign = await request(app).get("/api/tickets/TKT-2026-000052/actions").set("Cookie", cookie);
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(missing.body)).toBe(JSON.stringify(foreign.body));
    expect(db.ticket.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: expect.objectContaining({ ticketNumber: "TKT-2026-000051", requesterId: 7 }) }));
    expect(db.ticket.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: expect.objectContaining({ ticketNumber: "TKT-2026-000052", requesterId: 7 }) }));
  });

  it("T-ACT-06 denies Requester writes to the staff Action API", async () => {
    authenticatedAs("REQUESTER");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
    expect(db.actionTaken.create).not.toHaveBeenCalled();
  });

  it("T-ACT-06 returns byte-identical 404s for absent and foreign-parent Actions", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const missing = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/90/revisions").set("Cookie", cookie);
    const foreign = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/91/revisions").set("Cookie", cookie);
    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(JSON.stringify(missing.body)).toBe(JSON.stringify(foreign.body));
    expect(db.actionTaken.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { id: 90, ticketId: 51 }, select: { id: true } }));
    expect(db.actionTaken.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { id: 91, ticketId: 51 }, select: { id: true } }));
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
    const wrongToken = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", "not-the-session-token")
      .send({});
    expect(wrongToken.status).toBe(403);
    expect(db.ticket.findFirst).not.toHaveBeenCalled();

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

  it("T-SEC-02 applies session role changes immediately on the next request", async () => {
    const makeSession = (role: string) => ({
      id: 9,
      userId: actor.id,
      tokenHash: hashSessionToken(token),
      expiresAt: new Date(Date.now() + 60_000),
      invalidatedAt: null,
      user: { ...actor, role },
    });
    db.session.findUnique.mockResolvedValueOnce(makeSession("IT_STAFF")).mockResolvedValueOnce(makeSession("REQUESTER"));
    const allowed = await request(app).get("/api/staff/assignees").set("Cookie", cookie);
    const denied = await request(app).get("/api/staff/assignees").set("Cookie", cookie);
    expect(allowed.status).toBe(200);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
    expect(db.user.findMany).toHaveBeenCalledTimes(1);
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

  it("T-ACT-04 rejects edits to terminal Actions", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValue(actionFixture({ state: "COMPLETED", result: "Done", performedById: actor.id }));
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000051/actions/90")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, description: "Revised description" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ACTION_NOT_EDITABLE");
    expect(db.actionTaken.updateMany).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
  });

  it("T-ACT-05 applies an effective edit once and records one immutable revision", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    const before = actionFixture();
    const after = actionFixture({ description: "Updated gateway configuration", version: 2 });
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValueOnce(before).mockResolvedValue(after);
    db.actionTaken.updateMany.mockResolvedValue({ count: 1 });
    db.ticket.update.mockResolvedValue({ workflowVersion: 4 });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000051/actions/90")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, description: "Updated gateway configuration" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ticketVersion: 4, action: { id: 90, description: after.description, version: 2 } });
    expect(db.actionTaken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 90, ticketId: 51, version: 1 }, data: expect.objectContaining({ version: { increment: 1 } }) }));
    expect(db.actionRevision.create).toHaveBeenCalledTimes(1);
    expect(db.actionRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionId: 90, version: 2, actorId: actor.id, kind: "EDIT" }) }));
    expect(db.ticket.update).toHaveBeenCalledTimes(1);
  });

  it("T-ACT-05 returns a no-op without changing either version or appending a revision", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    const current = actionFixture();
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValue(current);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000051/actions/90")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, description: current.description });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ticketVersion: 3, action: { id: 90, version: 1 } });
    expect(db.actionTaken.updateMany).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("T-ACT-05 combines effective content edits and reassignment into one revision", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    const before = actionFixture();
    const after = actionFixture({ description: "Updated gateway configuration", assigneeId: 78, assignee: { id: 78, name: "Another Agent", role: "ADMIN", isActive: true }, version: 2 });
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValueOnce(before).mockResolvedValue(after);
    db.user.findFirst.mockResolvedValue({ id: 78 });
    db.actionTaken.updateMany.mockResolvedValue({ count: 1 });
    db.ticket.update.mockResolvedValue({ workflowVersion: 4 });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000051/actions/90")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, description: after.description, assigneeId: 78 });
    expect(response.status).toBe(200);
    expect(response.body.action).toMatchObject({ description: after.description, assignee: { id: 78 } });
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { id: 78, isActive: true, role: { in: ["IT_STAFF", "ADMIN"] } }, select: { id: true } });
    expect(db.actionRevision.create).toHaveBeenCalledTimes(1);
    expect(db.actionRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionId: 90, version: 2, actorId: actor.id, kind: "EDIT" }) }));
  });

  it("T-ACT-03 validates the merged Action when enabling follow-up without a valid note", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValue(actionFixture());
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000051/actions/90")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, followUpRequired: true });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.fieldErrors).toHaveProperty("followUpNote");
    expect(db.actionTaken.updateMany).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
    expect(db.ticket.update).not.toHaveBeenCalled();
  });

  it("T-ACT-04 completes an in-progress Action with the authenticated performer", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    const inProgress = actionFixture({ state: "IN_PROGRESS" });
    const completedAt = new Date("2026-10-10T01:00:00Z");
    const completed = actionFixture({ state: "COMPLETED", result: "Gateway configuration corrected", performedById: actor.id, performedBy: { id: actor.id, name: actor.name, role: actor.role, isActive: true }, completedAt, version: 2 });
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValueOnce(inProgress).mockResolvedValueOnce(completed);
    db.user.findFirst.mockResolvedValue({ id: 77 });
    db.actionTaken.update.mockResolvedValue(completed);
    db.ticket.update.mockResolvedValue({ workflowVersion: 4 });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions/90/transitions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, state: "COMPLETED", confirm: true, result: completed.result, followUpRequired: false });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ action: { id: 90, state: "COMPLETED", result: completed.result, performedBy: { id: actor.id } }, ticketVersion: 4 });
    expect(db.actionTaken.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 90 }, data: expect.objectContaining({ state: "COMPLETED", performedBy: { connect: { id: actor.id } }, result: completed.result }) }));
    expect(db.actionRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionId: 90, version: 2, actorId: actor.id, kind: "COMPLETE" }) }));
  });

  it("T-ACT-04 cancels an Action only with confirmation and a valid reason", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    const planned = actionFixture();
    const cancelledAt = new Date("2026-10-10T01:00:00Z");
    const cancelled = actionFixture({ state: "CANCELLED", cancellationReason: "Work superseded", cancelledAt, version: 2 });
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValueOnce(planned).mockResolvedValueOnce(cancelled);
    db.actionTaken.updateMany.mockResolvedValue({ count: 1 });
    db.ticket.update.mockResolvedValue({ workflowVersion: 4 });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions/90/transitions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, state: "CANCELLED", confirm: true, reason: "Work superseded" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ action: { id: 90, state: "CANCELLED", cancellationReason: "Work superseded", performedBy: null }, ticketVersion: 4 });
    expect(db.actionTaken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 90, ticketId: 51, version: 1 }, data: expect.objectContaining({ state: "CANCELLED", cancellationReason: "Work superseded", version: { increment: 1 } }) }));
    expect(db.actionRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionId: 90, version: 2, actorId: actor.id, kind: "CANCEL" }) }));
  });

  it("T-ACT-04 starts an Action without confirmation", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    const planned = actionFixture();
    const started = actionFixture({ state: "IN_PROGRESS", version: 2 });
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValueOnce(planned).mockResolvedValueOnce(started);
    db.user.findFirst.mockResolvedValue({ id: 77 });
    db.actionTaken.updateMany.mockResolvedValue({ count: 1 });
    db.ticket.update.mockResolvedValue({ workflowVersion: 4 });
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions/90/transitions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, state: "IN_PROGRESS" });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ action: { id: 90, state: "IN_PROGRESS", version: 2 }, ticketVersion: 4 });
    expect(db.actionRevision.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: "START", version: 2 }) }));
    expect(db.actionTaken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { state: "IN_PROGRESS", version: { increment: 1 } } }));
  });

  it("T-ACT-04 requires confirmation before cancellation", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.ticket.findUnique.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValue(actionFixture());
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/staff/tickets/TKT-2026-000051/actions/90/transitions")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, state: "CANCELLED", reason: "Work superseded" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFIRMATION_REQUIRED");
    expect(db.actionTaken.updateMany).not.toHaveBeenCalled();
    expect(db.actionRevision.create).not.toHaveBeenCalled();
  });

  it("T-ACT-05 rejects state and actor fields in an Action edit", async () => {
    authenticatedAs("IT_STAFF");
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .patch("/api/staff/tickets/TKT-2026-000051/actions/90")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ expectedTicketVersion: 3, expectedVersion: 1, state: "COMPLETED", performedById: 41 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.ticket.findFirst).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
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

  it("T-ACT-09 applies the documented Action list page defaults", async () => {
    authenticatedAs("IT_STAFF");
    db.ticket.findFirst.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null });
    db.actionTaken.findMany.mockResolvedValue([]);
    db.actionTaken.count.mockResolvedValue(0);
    const response = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ticketVersion: 3 });
    expect(db.actionTaken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ticketId: 51 }, skip: 0, take: 20 }));
    expect(db.actionTaken.count).toHaveBeenCalledWith({ where: { ticketId: 51 } });
  });

  it("T-ACT-09 enforces Requester Action pagination bounds and accepts pageSize 100", async () => {
    authenticatedAs("REQUESTER");
    db.requester.findUnique.mockResolvedValue({ id: 7, isActive: true });
    db.ticket.findFirst.mockResolvedValue({ id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null });
    db.actionTaken.findMany.mockResolvedValue([]);
    db.actionTaken.count.mockResolvedValue(0);

    const upper = await request(app)
      .get("/api/tickets/TKT-2026-000051/actions?page=1&pageSize=100")
      .set("Cookie", cookie);
    expect(upper.status).toBe(200);
    expect(upper.body).toMatchObject({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
    expect(db.actionTaken.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ticketId: 51 }, skip: 0, take: 100 }));

    const invalid = await request(app)
      .get("/api/tickets/TKT-2026-000051/actions?pageSize=101")
      .set("Cookie", cookie);
    expect(invalid.status).toBe(400);
    expect(db.ticket.findFirst).toHaveBeenCalledTimes(1);
  });

  it("T-ACT-09 applies staff revision defaults and accepts the pageSize upper bound", async () => {
    authenticatedAs("IT_STAFF");
    const ticket = { id: 51, ticketNumber: "TKT-2026-000051", workflowVersion: 3, currentStatus: "OPEN", assignedStaffId: null };
    db.ticket.findFirst.mockResolvedValue(ticket);
    db.actionTaken.findFirst.mockResolvedValue({ id: 90 });
    db.actionRevision.findMany.mockResolvedValue([]);
    db.actionRevision.count.mockResolvedValue(0);
    const defaults = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/90/revisions").set("Cookie", cookie);
    expect(defaults.status).toBe(200);
    expect(defaults.body).toEqual({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const upper = await request(app).get("/api/staff/tickets/TKT-2026-000051/actions/90/revisions?page=1&pageSize=100").set("Cookie", cookie);
    expect(upper.status).toBe(200);
    expect(upper.body).toEqual({ items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
    expect(db.actionRevision.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { actionId: 90 }, skip: 0, take: 100 }));
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
