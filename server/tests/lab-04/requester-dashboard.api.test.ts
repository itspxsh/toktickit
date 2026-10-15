import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  ticket: {
    count: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
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
});
