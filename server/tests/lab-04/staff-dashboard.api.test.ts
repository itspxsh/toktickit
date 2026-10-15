import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ticket: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  requester: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  actionTaken: { count: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../../src/prisma.js", () => ({ getPrisma: () => db }));
vi.mock("../../src/authorization.js", () => {
  const middleware = (allowed: string[]) => (req: { header(name: string): string | undefined; auth?: unknown }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
    const role = req.header("X-Test-Role") ?? (allowed.includes("REQUESTER") ? "REQUESTER" : "IT_STAFF");
    if (!allowed.includes(role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
      return;
    }
    req.auth = { user: { id: role === "REQUESTER" ? 7 : 41, role, isActive: true, mustChangePassword: false } };
    next();
  };
  return {
    roleAllowed: (role: string | undefined, allowed: readonly string[]) => role !== undefined && allowed.includes(role),
    createRequesterAuthMiddleware: () => middleware(["REQUESTER"]),
    createStaffAuthMiddleware: () => middleware(["IT_STAFF", "ADMIN"]),
    createAdminAuthMiddleware: () => middleware(["ADMIN"]),
  };
});

import { app } from "../../src/app.js";

const STATUSES = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];

describe("L4-07 Staff dashboard API (T-DASH-S-01..03)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ticket.count.mockResolvedValue(0);
    db.ticket.findMany.mockResolvedValue([]);
    db.ticket.groupBy.mockResolvedValue([]);
    db.user.findFirst.mockResolvedValue({ id: 41, name: "Support Agent", role: "IT_STAFF", isActive: true });
    db.user.findUnique.mockResolvedValue({ id: 41, role: "IT_STAFF", isActive: true });
    db.actionTaken.count.mockResolvedValue(0);
    db.actionTaken.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  });

  it("returns all status and priority buckets, bounded lists, and paged empty Action shape", async () => {
    const response = await request(app).get("/api/dashboards/staff");
    expect(response.status).toBe(200);
    expect(response.body.statusBuckets.map((bucket: { status: string }) => bucket.status)).toEqual(STATUSES);
    expect(response.body.priorityBuckets.map((bucket: { priority: string }) => bucket.priority)).toEqual(["LOW", "MEDIUM", "HIGH", "URGENT", "UNPRIORITIZED"]);
    expect(response.body.recentTickets).toEqual([]);
    expect(response.body.urgentTickets).toEqual([]);
    expect(response.body.myActions).toEqual({ items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "RepeatableRead" }));
  });

  it("rejects invalid page bounds and unknown dashboard keys before querying", async () => {
    const invalidPage = await request(app).get("/api/dashboards/staff?actionPageSize=21");
    expect(invalidPage.status).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
    const unknown = await request(app).get("/api/dashboards/staff?staffId=1");
    expect(unknown.status).toBe(400);
    expect(db.ticket.count).not.toHaveBeenCalled();
  });

  it("forbids Requester access to the staff dashboard", async () => {
    const response = await request(app).get("/api/dashboards/staff").set("X-Test-Role", "REQUESTER");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("keeps dashboard staff drill-down lists inside the same active requester scope (T-QUERY-01)", async () => {
    const response = await request(app).get("/api/staff/tickets?statusGroup=active&assignment=unassigned");

    expect(response.status).toBe(200);
    const expectedRequesterScope = {
      is: {
        isActive: true,
        user: { is: { role: "REQUESTER", isActive: true } },
      },
    };
    expect(db.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
        assignedStaffId: null,
        requester: expectedRequesterScope,
      }),
    }));
    expect(db.ticket.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ requester: expectedRequesterScope }),
    }));
  });
});
