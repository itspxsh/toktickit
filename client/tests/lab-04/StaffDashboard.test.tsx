import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { StaffDashboard } from "../../src/staff-dashboard.tsx";

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

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

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

  it("T-UI-DS-01 / AC-11,14 normalizes an unsafe actionPage before fetching", () => {
    const fetchDashboard = vi.spyOn(api, "fetchStaffDashboard").mockImplementation(() => new Promise(() => {}));
    const onNavigate = vi.fn();
    render(<StaffDashboard location="/staff/dashboard?actionPage=9007199254740992#my-actions" onNavigate={onNavigate} />);

    expect(fetchDashboard).toHaveBeenCalledWith({ actionPage: 1, actionPageSize: 5 }, expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/staff/dashboard#my-actions", { replace: true });
  });

  it("T-UI-DS-01 / AC-11,14 normalizes absurd actionPage values before fetching", () => {
    const fetchDashboard = vi.spyOn(api, "fetchStaffDashboard").mockImplementation(() => new Promise(() => {}));
    const onNavigate = vi.fn();
    render(<StaffDashboard location="/staff/dashboard?actionPage=1000000000#my-actions" onNavigate={onNavigate} />);

    expect(fetchDashboard).toHaveBeenCalledWith({ actionPage: 1, actionPageSize: 5 }, expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/staff/dashboard#my-actions", { replace: true });
  });

  it("T-UI-DS-01 / AC-11,14 clamps a known out-of-range Action page to the final page", async () => {
    const fetchDashboard = vi.spyOn(api, "fetchStaffDashboard").mockResolvedValue({
      ...staffDashboard,
      myActions: { items: [], page: 2, pageSize: 5, total: 6, totalPages: 2 },
    });
    const onNavigate = vi.fn();
    render(<StaffDashboard location="/staff/dashboard?actionPage=4#my-actions" onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: "Support Dashboard" })).toBeInTheDocument();
    expect(fetchDashboard).toHaveBeenCalledWith({ actionPage: 4, actionPageSize: 5 }, expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/staff/dashboard?actionPage=2#my-actions", { replace: true });
  });

  it.each([
    ["invalid UTC calendar date", { ...staffDashboard, asOf: "2026-02-31T00:00:00.000Z" }],
    ["fractional metrics", { ...staffDashboard, metrics: { ...staffDashboard.metrics, ownedActive: { value: 1.5, drillDown: "/staff/tickets?statusGroup=active&assignment=mine" } } }],
    ["negative buckets", { ...staffDashboard, statusBuckets: [{ status: "OPEN", value: -1, drillDown: "/staff/tickets?status=OPEN" }] }],
    ["zero page with results", { ...staffDashboard, myActions: { ...staffDashboard.myActions, page: 0, total: 1, totalPages: 1 } }],
  ])("T-UI-DS-01 / AC-11 rejects dashboard payloads with %s", async (_label, payload) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    await expect(api.fetchStaffDashboard()).rejects.toThrow(/dashboard/i);
  });
});
