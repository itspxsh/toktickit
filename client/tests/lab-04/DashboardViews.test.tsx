import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequesterDashboard } from "../../src/requester-dashboard.tsx";
import { StaffDashboard } from "../../src/staff-dashboard.tsx";
import * as api from "../../src/api.ts";

vi.mock("../../src/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/api.ts")>();
  return { ...original, fetchRequesterDashboard: vi.fn(), fetchStaffDashboard: vi.fn() };
});

afterEach(() => vi.clearAllMocks());

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });

describe("L4-08 dashboard views", () => {
  it("T-UI-NAV-02 / AC-12 serializes dashboard date/group drilldowns in list requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }) });
    vi.stubGlobal("fetch", fetchMock);
    await api.fetchMyTickets(undefined, { statusGroup: "resolved", resolvedSince: "2026-10-09T00:00:00.000Z", before: "2026-10-16T00:00:00.000Z" });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("statusGroup=resolved");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("resolvedSince=2026-10-09T00%3A00%3A00.000Z");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("before=2026-10-16T00%3A00%3A00.000Z");
  });

  it("T-UI-DS-01 / AC-11 resolves a direct Action anchor to its authorized page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], page: 2, pageSize: 20, total: 25, totalPages: 2, ticketVersion: 1 }) });
    vi.stubGlobal("fetch", fetchMock);
    await api.fetchStaffTicketActions("TKT-2026-000001", 1, 20, undefined, 42);
    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string);
    expect(requestUrl.searchParams.get("focusActionId")).toBe("42");
    expect(requestUrl.searchParams.has("page")).toBe(false);
    expect(requestUrl.searchParams.get("pageSize")).toBe("20");
  });

  it("T-UI-DR-01 / AC-10,14 renders requester summaries and refuses foreign destinations", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockResolvedValue({
      asOf: "2026-10-16T00:00:00.000Z", windowStart: "2026-10-09T00:00:00.000Z", displayTimeZone: "Asia/Bangkok",
      metrics: {
        activeTickets: { value: 2, drillDown: "/tickets?statusGroup=active" },
        waitingForRequester: { value: 1, drillDown: "/tickets?status=WAITING_FOR_REQUESTER" },
        updatedLast7Days: { value: 3, drillDown: "/tickets?updatedSince=2026-10-09T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z" },
        resolvedLast7Days: { value: 1, drillDown: "https://evil.example/steal" },
      },
      attentionTickets: [],
      recentTickets: [{ ticketNumber: "TKT-2026-000001", summary: "VPN access", currentStatus: "OPEN", itPriority: null, updatedAt: "2026-10-15T10:00:00Z", resolvedAt: null, href: "/tickets/TKT-2026-000001" }],
    });
    const onNavigate = vi.fn();
    render(<RequesterDashboard onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: "My Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Active tickets: 2" })).toHaveAttribute("href", "/tickets?statusGroup=active");
    expect(screen.queryByRole("link", { name: "Resolved in the last 7 days: 1" })).not.toBeInTheDocument();
    expect(screen.getByText("TKT-2026-000001")).toBeInTheDocument();
  });

  it("T-UI-DS-01 / AC-11,14 pages the current-user Actions and refreshes safely", async () => {
    const response = {
      asOf: "2026-10-16T00:00:00.000Z", windowStart: "2026-10-09T00:00:00.000Z", displayTimeZone: "Asia/Bangkok" as const,
      metrics: {
        unassignedActive: { value: 2, drillDown: "/staff/tickets?statusGroup=active&assignment=unassigned" },
        ownedActive: { value: 1, drillDown: "/staff/tickets?statusGroup=active&assignment=mine" },
        urgentActive: { value: 1, drillDown: "/staff/tickets?statusGroup=active&itPriority=URGENT" },
        myUnfinishedActions: { value: 6, drillDown: "/staff/dashboard?actionPage=1#my-actions" },
      },
      statusBuckets: [{ status: "OPEN" as const, value: 1, drillDown: "/staff/tickets?status=OPEN" }],
      priorityBuckets: [{ priority: "UNPRIORITIZED" as const, value: 0, drillDown: "/staff/tickets?statusGroup=active&itPriority=UNPRIORITIZED" }],
      recentTickets: [], urgentTickets: [],
      myActions: { items: [{ id: 9, description: "Replace adapter", state: "PLANNED" as const, createdAt: "2026-10-16T00:00:00Z", assignee: { id: 4, name: "Staff", role: "IT_STAFF" as const, isActive: true }, ticketNumber: "TKT-2026-000001", ticketSummary: "VPN access", href: "/staff/tickets/TKT-2026-000001#action-9" }], page: 2, pageSize: 5, total: 6, totalPages: 2 },
    };
    vi.mocked(api.fetchStaffDashboard).mockResolvedValue(response);
    const onNavigate = vi.fn();
    render(<StaffDashboard location="/staff/dashboard?actionPage=2#my-actions" onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: "Support Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "TKT-2026-000001: VPN access" })).toHaveAttribute("href", "/staff/tickets/TKT-2026-000001#action-9");
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(onNavigate).toHaveBeenCalledWith("/staff/dashboard?actionPage=1#my-actions"));
  });
});
