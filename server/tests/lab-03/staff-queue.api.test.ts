import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerStaffQueueRoutes } from "../../src/routes/staff-queue.js";

const staffAuth: RequestHandler = (req, _res, next) => {
  (req as any).auth = {
    user: {
      id: 21,
      name: "Support One",
      email: "support.one@example.test",
      passwordHash: "redacted",
      role: "IT_STAFF",
      isActive: true,
      mustChangePassword: false,
    },
    session: { id: 1, userId: 21, tokenHash: "opaque", expiresAt: new Date(Date.now() + 60_000), invalidatedAt: null },
    tokenHash: "opaque",
  };
  next();
};

const queueRows = [
  {
    id: 4,
    ticketNumber: "TKT-2026-000004",
    summary: "VPN access",
    itPriority: "HIGH",
    currentStatus: "IN_PROGRESS",
    updatedAt: new Date("2026-09-15T08:00:00.000Z"),
    requester: { id: 12, name: "Example Requester" },
    assignedStaff: { id: 21, name: "Support One" },
  },
];

function createTestApp(overrides: { rows?: unknown[]; total?: number } = {}) {
  const calls = {
    findMany: vi.fn(async () => overrides.rows ?? queueRows),
    count: vi.fn(async () => overrides.total ?? (overrides.rows ?? queueRows).length),
  };
  const app = express();
  app.use(express.json());
  registerStaffQueueRoutes(app, () => ({ ticket: calls }) as never, staffAuth);
  return { app, calls };
}

describe("GET /api/staff/tickets", () => {
  it("T-STAFF-01 / AC-05 applies defaults, filters, deterministic sort, and pagination", async () => {
    const { app, calls } = createTestApp({ total: 41 });
    const response = await request(app)
      .get("/api/staff/tickets?q= VPN &status=IN_PROGRESS&itPriority=HIGH&assignment=mine&sort=updatedAtDesc&page=2&pageSize=20");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [{
        ticketNumber: "TKT-2026-000004",
        summary: "VPN access",
        requester: { id: 12, name: "Example Requester" },
        itPriority: "HIGH",
        currentStatus: "IN_PROGRESS",
        assignedStaff: { id: 21, name: "Support One" },
        updatedAt: "2026-09-15T08:00:00.000Z",
      }],
      page: 2,
      pageSize: 20,
      total: 41,
      totalPages: 3,
    });
    expect(calls.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { ticketNumber: { contains: "VPN", mode: "insensitive" } },
          { summary: { contains: "VPN", mode: "insensitive" } },
        ],
        currentStatus: "IN_PROGRESS",
        itPriority: "HIGH",
        assignedStaffId: 21,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: 20,
      take: 20,
      select: expect.any(Object),
    });
    expect(calls.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ currentStatus: "IN_PROGRESS", itPriority: "HIGH", assignedStaffId: 21 }),
    });
  });

  it("T-STAFF-01 uses page 1, 20 items, and updatedAt/id descending by default", async () => {
    const { app, calls } = createTestApp();
    const response = await request(app).get("/api/staff/tickets");

    expect(response.status).toBe(200);
    expect(response.body.page).toBe(1);
    expect(response.body.pageSize).toBe(20);
    expect(calls.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {},
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: 20,
    }));
  });

  it("T-STAFF-02 exposes only queue-safe fields and rejects invalid filters", async () => {
    const { app } = createTestApp({
      rows: [{
        ...queueRows[0],
        requester: { id: 12, name: "Example Requester", email: "private@example.test" },
        passwordHash: "must-not-leak",
        session: { tokenHash: "must-not-leak" },
      }],
    });
    const response = await request(app).get("/api/staff/tickets?status=NOPE&pageSize=101");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toContain("must-not-leak");
  });

  it("T-STAFF-02 maps an unassigned ticket to null without private fields", async () => {
    const { app } = createTestApp({
      rows: [{ ...queueRows[0], assignedStaff: null, requester: { id: 12, name: "Example Requester" } }],
    });
    const response = await request(app).get("/api/staff/tickets?assignment=unassigned");

    expect(response.status).toBe(200);
    expect(response.body.items[0]).toEqual(expect.objectContaining({ assignedStaff: null }));
    expect(response.body.items[0]).not.toHaveProperty("requester.email");
    expect(response.body.items[0]).not.toHaveProperty("passwordHash");
  });
});
