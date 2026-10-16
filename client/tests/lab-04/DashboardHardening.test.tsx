import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import * as api from "../../src/api.ts";
import { RequesterDashboard } from "../../src/requester-dashboard.tsx";
import { StaffDashboard } from "../../src/staff-dashboard.tsx";

vi.mock("../../src/api.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/api.ts")>();
  return { ...original, fetchRequesterDashboard: vi.fn(), fetchStaffDashboard: vi.fn() };
});

afterEach(() => vi.clearAllMocks());

describe("L4-08 dashboard and navigation hardening", () => {
  it("replaces the current history entry when canonicalizing a URL", async () => {
    const { useBrowserLocation } = await import("../../src/App.tsx");
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const replace = vi.spyOn(window.history, "replaceState");
    const push = vi.spyOn(window.history, "pushState");
    const { result, unmount } = renderHook(() => useBrowserLocation());

    act(() => result.current[1]("/tickets?status=OPEN", { replace: true }));

    expect(replace).toHaveBeenCalledWith({}, "", "/tickets?status=OPEN");
    expect(push).not.toHaveBeenCalled();
    expect(result.current[0]).toBe("/tickets?status=OPEN");
    unmount();
    vi.restoreAllMocks();
    window.history.replaceState({}, "", current);
  });

  it("shows the forbidden state when a dashboard API responds 403", async () => {
    vi.mocked(api.fetchRequesterDashboard).mockRejectedValue(new api.ApiError("Forbidden", 403));
    render(<RequesterDashboard onNavigate={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  });

  it("shows the forbidden state for a forbidden staff dashboard response", async () => {
    vi.mocked(api.fetchStaffDashboard).mockRejectedValue(new api.ApiError("Forbidden", 403));
    render(<StaffDashboard location="/staff/dashboard" onNavigate={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Access denied" })).toBeInTheDocument();
  });

  it("guards browser Back navigation while a development ticket form is dirty", async () => {
    const { useBrowserLocation } = await import("../../src/App.tsx");
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.history.pushState({}, "", "/create-ticket");
    let confirmNavigation: (() => void) | undefined;
    const guard = vi.fn((continueNavigation: () => void) => { confirmNavigation = continueNavigation; });
    const { result } = renderHook(() => useBrowserLocation(guard));
    const pushState = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back");
    window.history.replaceState({}, "", "/tickets");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(guard).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/create-ticket");
    expect(result.current[0]).toBe("/create-ticket");
    act(() => confirmNavigation?.());
    expect(back).toHaveBeenCalledTimes(1);
    expect(pushState).toHaveBeenCalledTimes(1);
    window.history.replaceState({}, "", "/tickets");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(guard).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/tickets");
    vi.restoreAllMocks();
    window.history.replaceState({}, "", current);
  });
});
