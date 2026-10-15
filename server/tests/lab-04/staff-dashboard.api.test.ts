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

  it("matches staff/Admin buckets, actor-owned work and safe Action pagination (T-DASH-S-01..02)", async () => {
    db.ticket.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);
    db.ticket.groupBy
      .mockResolvedValueOnce([{ currentStatus: "OPEN", _count: { _all: 6 } }])
      .mockResolvedValueOnce([{ itPriority: null, _count: { _all: 2 } }, { itPriority: "URGENT", _count: { _all: 3 } }]);
    db.actionTaken.count.mockResolvedValue(4);
    db.actionTaken.findMany.mockResolvedValue([{
      id: 91,
      description: "Check the assigned workstation",
      state: "PLANNED",
      createdAt: new Date("2026-10-14T08:00:00.000Z"),
      assignee: { id: 41, name: "Support Agent", role: "IT_STAFF", isActive: true, passwordHash: "not selected" },
      ticket: { ticketNumber: "TKT-2026-000041", summary: "Device connectivity" },
      result: "must not be selected",
    }]);

    const response = await request(app).get("/api/dashboards/staff?actionPage=2&actionPageSize=3");

    expect(response.status).toBe(200);
    expect(response.body.metrics).toMatchObject({
      unassignedActive: { value: 7 },
      ownedActive: { value: 3 },
      urgentActive: { value: 2 },
      myUnfinishedActions: { value: 4, drillDown: "/staff/dashboard?actionPage=2#my-actions" },
    });
    expect(response.body.statusBuckets.find((bucket: { status: string }) => bucket.status === "OPEN").value).toBe(6);
    expect(response.body.priorityBuckets.find((bucket: { priority: string }) => bucket.priority === "UNPRIORITIZED").value).toBe(2);
    expect(response.body.priorityBuckets.find((bucket: { priority: string }) => bucket.priority === "URGENT").value).toBe(3);
    expect(response.body.myActions).toEqual({
      items: [{
        id: 91,
        description: "Check the assigned workstation",
        state: "PLANNED",
        createdAt: "2026-10-14T08:00:00.000Z",
        assignee: { id: 41, name: "Support Agent", role: "IT_STAFF", isActive: true },
        ticketNumber: "TKT-2026-000041",
        ticketSummary: "Device connectivity",
        href: "/staff/tickets/TKT-2026-000041#action-91",
      }],
      page: 2,
      pageSize: 3,
      total: 4,
      totalPages: 2,
    });

    const activeScope = {
      requester: { is: { isActive: true, user: { is: { role: "REQUESTER", isActive: true } } } },
      currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] },
    };
    expect(db.ticket.count).toHaveBeenNthCalledWith(1, { where: { ...activeScope, assignedStaffId: null } });
    expect(db.ticket.count).toHaveBeenNthCalledWith(2, { where: { ...activeScope, assignedStaffId: 41 } });
    expect(db.ticket.count).toHaveBeenNthCalledWith(3, { where: { ...activeScope, itPriority: "URGENT" } });
    expect(db.ticket.groupBy).toHaveBeenNthCalledWith(1, expect.objectContaining({ by: ["currentStatus"], where: { requester: activeScope.requester } }));
    expect(db.ticket.groupBy).toHaveBeenNthCalledWith(2, expect.objectContaining({ by: ["itPriority"], where: activeScope }));
    expect(db.actionTaken.count).toHaveBeenCalledWith({
      where: { assigneeId: 41, state: { in: ["PLANNED", "IN_PROGRESS"] }, ticket: { is: activeScope } },
    });
    expect(db.actionTaken.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 3,
      take: 3,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: { assigneeId: 41, state: { in: ["PLANNED", "IN_PROGRESS"] }, ticket: { is: activeScope } },
    }));
    expect(db.actionTaken.findMany.mock.calls[0]?.[0].select).not.toHaveProperty("result");
  });

  it("returns a safe service error instead of manufacturing zero counts (T-DASH-S-03)", async () => {
    db.ticket.count.mockRejectedValue(new Error("private database detail"));

    const response = await request(app).get("/api/dashboards/staff");

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Unable to load dashboard data." } });
    expect(JSON.stringify(response.body)).not.toContain("private database detail");
  });
});
