import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ticket: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    groupBy: vi.fn(),
  },
  requester: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), findFirst: vi.fn() },
  actionTaken: { count: vi.fn(), findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../../src/prisma.js", () => ({ getPrisma: () => db }));
vi.mock("../../src/authorization.js", () => {
  const middleware = (allowed: string[]) => (req: { header(name: string): string | undefined; auth?: unknown; requesterId?: number }, res: { status(code: number): { json(body: unknown): void } }, next: () => void) => {
    const role = req.header("X-Test-Role") ?? (allowed.includes("REQUESTER") ? "REQUESTER" : "IT_STAFF");
    if (!allowed.includes(role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
      return;
    }
    req.auth = { user: { id: role === "REQUESTER" ? 7 : 41, role, isActive: true, mustChangePassword: false } };
    if (role === "REQUESTER") req.requesterId = 7;
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

const AS_OF = "2026-10-15T12:00:00.000Z";
const WINDOW_START = "2026-10-08T12:00:00.000Z";

describe("L4-07 Requester dashboard API (T-DASH-R-01..02)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AS_OF));
    vi.clearAllMocks();
    db.ticket.count.mockResolvedValue(0);
    db.ticket.findMany.mockResolvedValue([]);
    db.requester.findUnique.mockResolvedValue({ id: 7, isActive: true });
    db.user.findUnique.mockResolvedValue({ id: 7, role: "REQUESTER", isActive: true, requester: { id: 7, isActive: true } });
    db.user.findFirst.mockResolvedValue({ id: 7, requester: { id: 7, isActive: true } });
    db.actionTaken.count.mockResolvedValue(0);
    db.actionTaken.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db));
  });

  afterEach(() => vi.useRealTimers());

  it("returns the exact zero-scope contract from a server-authorized identity", async () => {
    const response = await request(app).get("/api/dashboards/requester");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      asOf: AS_OF,
      windowStart: WINDOW_START,
      displayTimeZone: "Asia/Bangkok",
      metrics: {
        activeTickets: { value: 0, drillDown: "/tickets?statusGroup=active" },
        waitingForRequester: { value: 0, drillDown: "/tickets?status=WAITING_FOR_REQUESTER" },
        updatedLast7Days: { value: 0, drillDown: `/tickets?updatedSince=${WINDOW_START}&before=${AS_OF}` },
        resolvedLast7Days: { value: 0, drillDown: `/tickets?statusGroup=resolved&resolvedSince=${WINDOW_START}&before=${AS_OF}` },
      },
      attentionTickets: [],
      recentTickets: [],
    });
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: "RepeatableRead" }));
  });

  it("rejects actor-selection and unknown dashboard query keys before querying data", async () => {
    const response = await request(app).get("/api/dashboards/requester?requesterId=99");
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.ticket.count).not.toHaveBeenCalled();
  });

  it("uses the session-linked requester for the list filter and supports resolved UTC drill-downs (T-QUERY-01)", async () => {
    const response = await request(app).get(
      `/api/tickets?statusGroup=resolved&resolvedSince=${WINDOW_START}&before=${AS_OF}&page=2&pageSize=20`,
    );
    expect(response.status).toBe(200);
    expect(db.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        requesterId: 7,
        currentStatus: { in: ["RESOLVED", "CLOSED"] },
        resolvedAt: { gte: new Date(WINDOW_START), lt: new Date(AS_OF) },
      }),
      skip: 20,
      take: 20,
    }));
    expect(db.ticket.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ requesterId: 7 }) }));
  });

  it("keeps updatedSince on updatedAt while a resolved drill-down applies before to resolvedAt", async () => {
    const response = await request(app).get(
      `/api/tickets?statusGroup=resolved&updatedSince=${WINDOW_START}&before=${AS_OF}`,
    );

    expect(response.status).toBe(200);
    expect(db.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        requesterId: 7,
        currentStatus: { in: ["RESOLVED", "CLOSED"] },
        updatedAt: { gte: new Date(WINDOW_START) },
        resolvedAt: { lt: new Date(AS_OF) },
      }),
    }));
  });

  it("rejects impossible UTC calendar dates before reading tickets", async () => {
    const response = await request(app).get("/api/tickets?updatedSince=2026-02-30T12:00:00.000Z&before=2026-03-01T12:00:00.000Z");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(db.ticket.findMany).not.toHaveBeenCalled();
    expect(db.ticket.count).not.toHaveBeenCalled();
  });

  it("calculates all requester metrics and emits only bounded safe summaries (T-DASH-R-01..02)", async () => {
    const fixture = {
      ticketNumber: "TKT-2026-000031",
      summary: "VPN reconnect issue",
      currentStatus: "WAITING_FOR_REQUESTER",
      itPriority: "HIGH",
      updatedAt: new Date("2026-10-14T10:00:00.000Z"),
      resolvedAt: null,
      description: "must not be projected",
      requesterUserId: 7,
    };
    db.ticket.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(1);
    db.ticket.findMany.mockResolvedValue([fixture]);

    const response = await request(app).get("/api/dashboards/requester");

    expect(response.status).toBe(200);
    expect(response.body.metrics).toMatchObject({
      activeTickets: { value: 4 },
      waitingForRequester: { value: 2 },
      updatedLast7Days: { value: 8 },
      resolvedLast7Days: { value: 1 },
    });
    const safeSummary = {
      ticketNumber: fixture.ticketNumber,
      summary: fixture.summary,
      currentStatus: fixture.currentStatus,
      itPriority: fixture.itPriority,
      updatedAt: fixture.updatedAt.toISOString(),
      resolvedAt: null,
      href: `/tickets/${fixture.ticketNumber}`,
    };
    expect(response.body.attentionTickets).toEqual([safeSummary]);
    expect(response.body.recentTickets).toEqual([safeSummary]);

    const ownerScope = {
      requesterId: 7,
      requesterUserId: 7,
      requesterUser: { is: { id: 7, role: "REQUESTER", isActive: true } },
      requester: { is: { id: 7, isActive: true, user: { is: { id: 7, role: "REQUESTER", isActive: true } } } },
    };
    expect(db.ticket.count).toHaveBeenNthCalledWith(1, { where: expect.objectContaining({ ...ownerScope, currentStatus: { in: ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"] } }) });
    expect(db.ticket.count).toHaveBeenNthCalledWith(2, { where: expect.objectContaining({ ...ownerScope, currentStatus: "WAITING_FOR_REQUESTER" }) });
    expect(db.ticket.count).toHaveBeenNthCalledWith(3, { where: expect.objectContaining({ ...ownerScope, updatedAt: { gte: new Date(WINDOW_START), lt: new Date(AS_OF) } }) });
    expect(db.ticket.count).toHaveBeenNthCalledWith(4, { where: expect.objectContaining({ ...ownerScope, currentStatus: { in: ["RESOLVED", "CLOSED"] }, resolvedAt: { gte: new Date(WINDOW_START), lt: new Date(AS_OF) } }) });
    for (const call of db.ticket.findMany.mock.calls) {
      expect(call[0]).toMatchObject({ take: 5, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { ticketNumber: true, summary: true, currentStatus: true, itPriority: true, updatedAt: true, resolvedAt: true } });
      expect(call[0].where).toMatchObject(ownerScope);
    }
  });

  it("does not turn an inactive or unlinked session identity into an empty dashboard", async () => {
    db.user.findFirst.mockResolvedValue(null);

    const response = await request(app).get("/api/dashboards/requester");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(db.ticket.count).not.toHaveBeenCalled();
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });
});
