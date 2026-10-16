import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";

const staffDashboard = {
  asOf: "2026-10-16T00:00:00.000Z",
  windowStart: "2026-10-09T00:00:00.000Z",
  displayTimeZone: "Asia/Bangkok" as const,
  metrics: {
    unassignedActive: { value: 2, drillDown: "/staff/tickets?statusGroup=active&assignment=unassigned" },
    ownedActive: { value: 1, drillDown: "/staff/tickets?statusGroup=active&assignment=mine" },
    urgentActive: { value: 1, drillDown: "/staff/tickets?statusGroup=active&itPriority=URGENT" },
    myUnfinishedActions: { value: 1, drillDown: "/staff/dashboard#my-actions" },
  },
  statusBuckets: [],
  priorityBuckets: [],
  recentTickets: [],
  urgentTickets: [],
  myActions: { items: [], page: 1, pageSize: 5, total: 0, totalPages: 0 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("L4-08 staff dashboard API", () => {
  it("T-UI-DS-01 / AC-11,14 loads a bounded session-scoped page of current-user Actions", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => staffDashboard });
    vi.stubGlobal("fetch", fetchMock);

    expect(typeof api.fetchStaffDashboard).toBe("function");
    await expect(api.fetchStaffDashboard({ actionPage: 1, actionPageSize: 5 })).resolves.toEqual(staffDashboard);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/dashboards\/staff\?actionPage=1&actionPageSize=5$/),
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
