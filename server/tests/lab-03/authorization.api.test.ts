import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerTicketRoutes } from "../../src/routes/tickets.js";
import { registerAttachmentRoutes } from "../../src/routes/attachments.js";
import { createRequesterAuthMiddleware } from "../../src/authorization.js";

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

function createGuardedApp(options: { session: unknown; requester?: { id: number; isActive: boolean } }) {
  const app = express();
  app.use(express.json());
  const prisma = {
    user: { findUnique: vi.fn() },
    session: { findUnique: vi.fn(async () => options.session) },
    requester: { findUnique: vi.fn(async () => options.requester ?? { id: 1, isActive: true }) },
    category: { findUnique: vi.fn() },
    relatedSystem: { findUnique: vi.fn() },
    ticket: { findUnique: vi.fn(), findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []), count: vi.fn(async () => 0), create: vi.fn() },
    attachment: { findFirst: vi.fn(), findMany: vi.fn(async () => []), count: vi.fn(async () => 0), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const guarded = createRequesterAuthMiddleware(() => prisma as any);
  registerTicketRoutes(app, () => prisma as any, guarded);
  registerAttachmentRoutes(app, () => prisma as any, guarded);
  return { app, prisma };
}

describe("Lab 3 server authorization over Lab 2 requester routes", () => {
  it("T-AUTHZ-01 returns the standard 401 envelope for anonymous protected reads", async () => {
    const { app } = createGuardedApp({ session: null });
    for (const path of [
      "/api/tickets",
      "/api/tickets/TKT-2026-000001",
      "/api/tickets/TKT-2026-000001/attachments",
    ]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    }
  });

  it("T-AUTHZ-04 rejects stale sessions and inactive requester identities", async () => {
    const expired = createGuardedApp({
      session: {
        id: 1,
        userId: 12,
        tokenHash: "hash",
        expiresAt: new Date(Date.now() - 1),
        invalidatedAt: null,
        user: { id: 12, role: "REQUESTER", isActive: true, mustChangePassword: false },
      },
    });
    const stale = await request(expired.app).get("/api/tickets").set("Cookie", "tt_session=opaque-session-token-123456789");
    expect(stale.status).toBe(401);

    const inactive = createGuardedApp({
      session: {
        id: 1,
        userId: 12,
        tokenHash: "hash",
        expiresAt: new Date(Date.now() + 60_000),
        invalidatedAt: null,
        user: { id: 12, role: "REQUESTER", isActive: true, mustChangePassword: false },
      },
      requester: { id: 1, isActive: false },
    });
    const blocked = await request(inactive.app).get("/api/tickets").set("Cookie", "tt_session=opaque-session-token-123456789");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe("FORBIDDEN");
  });

  it("requires CSRF on authenticated Lab 2 ticket creation", async () => {
    const { app } = createTestApp();
    const response = await request(app)
      .post("/api/tickets")
      .set("Origin", "http://localhost:3000")
      .send({ categoryId: 1, relatedSystemId: 1, summary: "A valid summary", requestedPriority: "LOW", description: "A valid description here" });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("requires CSRF before authenticated Lab 2 attachment writes", async () => {
    const app = express();
    app.use(express.json());
    const auth = requesterAuth;
    (registerAttachmentRoutes as any)(app, () => ({
      ticket: { findFirst: vi.fn() },
      attachment: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    }), auth);

    const upload = await request(app)
      .post("/api/tickets/TKT-2026-000001/attachments")
      .set("Origin", "http://localhost:3000")
      .attach("file", Buffer.from("not a valid image"), "evidence.png");
    expect(upload.status).toBe(403);
    expect(upload.body.error.code).toBe("FORBIDDEN");

    const remove = await request(app)
      .delete("/api/tickets/TKT-2026-000001/attachments/1")
      .set("Origin", "http://localhost:3000")
      .send({ reason: "No longer needed" });
    expect(remove.status).toBe(403);
    expect(remove.body.error.code).toBe("FORBIDDEN");
  });

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
