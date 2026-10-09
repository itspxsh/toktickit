import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "../../src/auth.js";

const db = vi.hoisted(() => ({
  session: { findUnique: vi.fn() },
  requester: { findUnique: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  ticket: { findFirst: vi.fn(), $queryRaw: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  actionTaken: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  actionRevision: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
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

  it("T-ACT-03 rejects an invalid action identifier before a database lookup", async () => {
    authenticatedAs("IT_STAFF");
    const response = await request(app)
      .get("/api/staff/tickets/TKT-2026-000001/actions/not-an-id/revisions")
      .set("Cookie", cookie);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_IDENTIFIER");
    expect(db.actionRevision.findMany).not.toHaveBeenCalled();
  });
});
