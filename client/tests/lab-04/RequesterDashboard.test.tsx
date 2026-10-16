import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as api from "../../src/api.ts";
import { RequesterDashboard } from "../../src/requester-dashboard.tsx";

const requesterDashboard = {
  asOf: "2026-10-16T00:00:00.000Z",
  windowStart: "2026-10-09T00:00:00.000Z",
  displayTimeZone: "Asia/Bangkok" as const,
  metrics: {
    activeTickets: { value: 2, drillDown: "/tickets?statusGroup=active" },
    waitingForRequester: { value: 1, drillDown: "/tickets?status=WAITING_FOR_REQUESTER" },
    updatedLast7Days: { value: 3, drillDown: "/tickets?updatedSince=2026-10-09T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z" },
    resolvedLast7Days: { value: 1, drillDown: "/tickets?statusGroup=resolved&resolvedSince=2026-10-09T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z" },
  },
  attentionTickets: [],
  recentTickets: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("L4-08 requester dashboard API", () => {
  it("T-UI-DR-01 / AC-10,14 loads only the server-session requester dashboard", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => requesterDashboard });
    vi.stubGlobal("fetch", fetchMock);

    expect(typeof api.fetchRequesterDashboard).toBe("function");
    await expect(api.fetchRequesterDashboard()).resolves.toEqual(requesterDashboard);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/dashboards\/requester$/),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("T-UI-DR-01 / AC-10 rejects malformed success payloads into a safe error path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ metrics: null }) });
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.fetchRequesterDashboard()).rejects.toThrow(/dashboard/i);
  });

  it("T-UI-DR-01 / AC-10 rejects malformed dates in server-provided drill-down links", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue({
      ...requesterDashboard,
      metrics: {
        ...requesterDashboard.metrics,
        updatedLast7Days: { value: 3, drillDown: "/tickets?updatedSince=2026-02-31T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z" },
      },
    });
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "My Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Updated in the last 7 days: 3" })).not.toBeInTheDocument();
  });

  it("T-UI-DR-01 / AC-10 rejects offset and contradictory dates in drill-down links", async () => {
    vi.spyOn(api, "fetchRequesterDashboard").mockResolvedValue({
      ...requesterDashboard,
      metrics: {
        ...requesterDashboard.metrics,
        updatedLast7Days: { value: 3, drillDown: "/tickets?updatedSince=2026-10-09T00%3A00%3A00%2B01%3A00&before=2026-10-08T00%3A00%3A00.000Z" },
      },
    });
    render(<RequesterDashboard onNavigate={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "My Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Updated in the last 7 days: 3" })).not.toBeInTheDocument();
  });
});
