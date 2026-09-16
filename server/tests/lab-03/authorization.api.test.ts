import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerTicketRoutes } from "../../src/routes/tickets.js";

const requester = { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test", isActive: true };
const ticketDate = new Date("2026-09-15T07:00:00.000Z");

const requesterAuth: RequestHandler = (req, _res, next) => {
  (req as any).auth = {
    user: { id: 12, name: requester.name, email: requester.email, passwordHash: "redacted", role: "REQUESTER", isActive: true, mustChangePassword: false },
    session: { id: 1, userId: 12, tokenHash: "session-hash", expiresAt: new Date(Date.now() + 60_000), invalidatedAt: null },
    tokenHash: "session-hash",
  };
  (req as any).requesterId = requester.id;
  next();
};

function createTestApp() {
  const calls = {
    requesterFindUnique: vi.fn(async () => requester),
    ticketFindMany: vi.fn(async () => []),
    ticketCount: vi.fn(async () => 0),
    ticketFindFirst: vi.fn(async () => null),
  };
  const app = express();
  app.use(express.json());
  (registerTicketRoutes as any)(app, () => ({
    requester: { findUnique: calls.requesterFindUnique },
    category: { findUnique: vi.fn() },
    relatedSystem: { findUnique: vi.fn() },
    ticket: {
      findUnique: vi.fn(),
      findFirst: calls.ticketFindFirst,
      findMany: calls.ticketFindMany,
      count: calls.ticketCount,
      create: vi.fn(),
    },
    $queryRaw: vi.fn(),
  }), requesterAuth);
  return { app, calls };
}

describe("Lab 3 server authorization over Lab 2 requester routes", () => {
  it("T-AUTHZ-02 ignores forged Development Requester headers and scopes by session", async () => {
    const { app, calls } = createTestApp();
    const response = await request(app)
      .get("/api/tickets?requesterId=999")
      .set("X-Development-Requester-Id", "999");

    expect(response.status).toBe(200);
    expect(calls.requesterFindUnique).toHaveBeenCalledWith({
      where: { id: requester.id },
      select: { id: true, isActive: true },
    });
    expect(calls.ticketFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ requesterId: requester.id }),
    }));
    expect(((calls.ticketFindMany.mock.calls as any)[0][0] as any).where.requesterId).not.toBe(999);
  });

  it("T-AUTHZ-02 rejects a foreign ticket without disclosing ownership", async () => {
    const { app, calls } = createTestApp();
    calls.ticketFindFirst.mockResolvedValue(null);
    const response = await request(app)
      .get("/api/tickets/TKT-2026-000001")
      .set("X-Development-Requester-Id", "999");
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: "TICKET_NOT_FOUND", message: "Ticket was not found." } });
    expect(((calls.ticketFindFirst.mock.calls as any)[0][0] as any).where.requesterId).toBe(requester.id);
  });
});
