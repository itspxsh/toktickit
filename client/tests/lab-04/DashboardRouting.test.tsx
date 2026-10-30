import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoleGuard } from "../../src/auth.tsx";
import { AppShell } from "../../src/components/ui.tsx";
import { MyTickets } from "../../src/my-tickets.tsx";
import { StaffTicketQueue } from "../../src/staff-ticket-queue.tsx";
import { RequesterChangeConfirmation, RequesterProvider, useRequesterContext } from "../../src/requester.tsx";
import * as api from "../../src/api.ts";

afterEach(() => vi.restoreAllMocks());

function NavigationDraftHarness({ onNavigate }: { onNavigate: () => void }) {
  const context = useRequesterContext();
  return <>
    <button type="button" onClick={() => context.setStaffTicketDirty(true)}>Start an Action draft</button>
    <button type="button" onClick={() => context.requestNavigation(onNavigate)}>Go to dashboard</button>
    <RequesterChangeConfirmation />
  </>;
}

describe("L4-08 role Dashboard routes and navigation", () => {
  it("T-UI-NAV-01 / AC-12,13 permits the Requester Dashboard and rejects staff deep links", () => {
    const { rerender } = render(<RoleGuard role="REQUESTER" path="/dashboard"><h1>My Dashboard</h1></RoleGuard>);
    expect(screen.getByRole("heading", { name: "My Dashboard" })).toBeInTheDocument();

    rerender(<RoleGuard role="REQUESTER" path="/staff/dashboard"><h1>Support Dashboard</h1></RoleGuard>);
    expect(screen.getByRole("alert")).toHaveTextContent(/access denied/i);
    expect(screen.queryByRole("heading", { name: "Support Dashboard" })).not.toBeInTheDocument();
  });

  it("T-UI-NAV-01 / AC-12,13 exposes the Staff Dashboard as the exact active destination", () => {
    render(<AppShell activePath="/staff/dashboard" role="IT_STAFF" userName="Staff" userEmail="staff@example.test"><p>dashboard</p></AppShell>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Staff Tickets" })).not.toHaveAttribute("aria-current", "page");
  });

  it("T-UI-NAV-02 / AC-12,14 keeps a list route active when only its query changes", () => {
    render(<AppShell activePath="/tickets?statusGroup=active&page=2" role="REQUESTER"><p>tickets</p></AppShell>);
    expect(screen.getByRole("link", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");
  });

  it("T-UI-NAV-02 / AC-12 initializes visible date filters from dashboard drilldown URLs", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><MyTickets location="/tickets?statusGroup=resolved&resolvedSince=2026-10-09T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z" onNavigate={onNavigate} /></RequesterProvider>);

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Status group" })).toHaveValue("resolved");
    expect(screen.getByRole("textbox", { name: "Resolved since (UTC ISO)" })).toHaveValue("2026-10-09T00:00:00.000Z");
    expect(await screen.findByText("No Tickets match the current search and filters.")).toBeInTheDocument();
    expect(fetchTickets).toHaveBeenCalledWith(undefined, expect.objectContaining({ statusGroup: "resolved", resolvedSince: "2026-10-09T00:00:00.000Z", before: "2026-10-16T00:00:00.000Z" }), expect.any(AbortSignal));
  });

  it("T-UI-NAV-02 / AC-12 canonicalizes contradictory and malformed URL filters", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><MyTickets location="/tickets?status=NEW&statusGroup=resolved&updatedSince=bad&resolvedSince=2026-10-09T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z&unexpected=hidden" onNavigate={onNavigate} /></RequesterProvider>);

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Current Status" })).toHaveValue("NEW");
    expect(screen.getByRole("combobox", { name: "Status group" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Resolved since (UTC ISO)" })).toHaveValue("");
    expect(fetchTickets).toHaveBeenCalledWith(undefined, expect.objectContaining({ status: "NEW", statusGroup: undefined, updatedSince: undefined, resolvedSince: undefined, before: "2026-10-16T00:00:00.000Z" }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/tickets?status=NEW&before=2026-10-16T00%3A00%3A00.000Z", { replace: true });
  });

  it("T-UI-NAV-02 / AC-12 drops an active group that contradicts an exact terminal status", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><MyTickets location="/tickets?status=CANCELLED&statusGroup=active" onNavigate={onNavigate} /></RequesterProvider>);

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(fetchTickets).toHaveBeenCalledWith(undefined, expect.objectContaining({ status: "CANCELLED", statusGroup: undefined }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/tickets?status=CANCELLED", { replace: true });
  });

  it("T-UI-NAV-02 / AC-12 drops resolvedSince unless resolved status group remains valid", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const fetchTickets = vi.mocked(api.fetchStaffTickets);
    const onNavigate = vi.fn();
    render(<StaffTicketQueue location="/staff/tickets?status=CANCELLED&statusGroup=active&resolvedSince=2026-10-09T00%3A00%3A00.000Z&before=2026-10-16T00%3A00%3A00.000Z" onNavigate={onNavigate} />);

    expect(await screen.findByRole("heading", { name: "Staff Ticket Queue" })).toBeInTheDocument();
    expect(fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ status: "CANCELLED", statusGroup: undefined, resolvedSince: undefined, before: "2026-10-16T00:00:00.000Z" }), expect.any(AbortSignal));
    expect(screen.getByRole("combobox", { name: "Status group" })).toHaveValue("");
  });

  it("T-UI-NAV-02 / AC-12 keeps interactive exact-status filters compatible with status groups", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><MyTickets location="/tickets?statusGroup=active" onNavigate={onNavigate} /></RequesterProvider>);

    await screen.findByRole("heading", { name: "My Tickets" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Current Status" }), "CANCELLED");
    expect(fetchTickets).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ status: "CANCELLED", statusGroup: undefined }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenLastCalledWith("/tickets?status=CANCELLED");
  });

  it("T-UI-NAV-02 / AC-12 drops invalid requester IDs, priorities, and date windows before fetching", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const onNavigate = vi.fn();
    const tooFuture = new Date(Date.now() + 120_000).toISOString();
    const since = new Date(Date.now() - 120_000).toISOString();
    render(<RequesterProvider mode="disabled"><MyTickets location={`/tickets?requestedPriority=BOGUS&categoryId=0&relatedSystemId=1x&updatedSince=${encodeURIComponent(since)}&before=${encodeURIComponent(tooFuture)}`} onNavigate={onNavigate} /></RequesterProvider>);

    await screen.findByRole("heading", { name: "My Tickets" });
    expect(fetchTickets).toHaveBeenCalledWith(undefined, expect.objectContaining({
      requestedPriority: undefined,
      categoryId: undefined,
      relatedSystemId: undefined,
      updatedSince: undefined,
      before: undefined,
    }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/tickets", { replace: true });
  });

  it("T-UI-NAV-02 / AC-12 requires a valid exclusive upper bound for date lower bounds", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const lower = new Date(Date.now() - 120_000).toISOString();
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><MyTickets location={`/tickets?updatedSince=${encodeURIComponent(lower)}`} onNavigate={onNavigate} /></RequesterProvider>);

    await screen.findByRole("heading", { name: "My Tickets" });
    expect(fetchTickets).toHaveBeenCalledWith(undefined, expect.objectContaining({ updatedSince: undefined, before: undefined }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/tickets", { replace: true });
  });

  it("T-UI-NAV-02 / AC-12 applies the same date-window validation to staff queue URLs", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const since = new Date(Date.now() - 120_000).toISOString();
    const before = new Date(Date.now() - 240_000).toISOString();
    const onNavigate = vi.fn();
    render(<StaffTicketQueue location={`/staff/tickets?updatedSince=${encodeURIComponent(since)}&before=${encodeURIComponent(before)}`} onNavigate={onNavigate} />);

    await screen.findByRole("heading", { name: "Staff Ticket Queue" });
    expect(fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ updatedSince: undefined, before }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith(`/staff/tickets?before=${encodeURIComponent(before)}`, { replace: true });
  });

  it("T-UI-NAV-02 / AC-12 allows a valid before-only date filter", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const before = new Date(Date.now() + 30_000).toISOString();
    const onNavigate = vi.fn();
    render(<StaffTicketQueue location={`/staff/tickets?before=${encodeURIComponent(before)}`} onNavigate={onNavigate} />);

    await screen.findByRole("heading", { name: "Staff Ticket Queue" });
    expect(fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ updatedSince: undefined, resolvedSince: undefined, before }), expect.any(AbortSignal));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("T-UI-NAV-02 / AC-12 rejects impossible calendar dates in requester URL filters", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><MyTickets location="/tickets?before=2026-02-31T00%3A00%3A00.000Z" onNavigate={onNavigate} /></RequesterProvider>);

    await screen.findByRole("heading", { name: "My Tickets" });
    expect(fetchTickets).toHaveBeenCalledWith(undefined, expect.objectContaining({ before: undefined }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/tickets", { replace: true });
  });

  it("T-UI-NAV-02 / AC-12 rejects impossible calendar dates in staff URL filters", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    const fetchTickets = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const since = new Date(Date.now() - 120_000).toISOString();
    const onNavigate = vi.fn();
    render(<StaffTicketQueue location={`/staff/tickets?updatedSince=${encodeURIComponent(since)}&before=2026-02-31T00%3A00%3A00.000Z`} onNavigate={onNavigate} />);

    await screen.findByRole("heading", { name: "Staff Ticket Queue" });
    expect(fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ updatedSince: undefined, before: undefined }), expect.any(AbortSignal));
    expect(onNavigate).toHaveBeenCalledWith("/staff/tickets", { replace: true });
  });

  it("T-UI-NAV-02 / AC-14 keeps the current numbered Staff queue page in the visible page window", async () => {
    const fetchTickets = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({
      items: [{
        ticketNumber: "TKT-2026-000004", summary: "VPN access", requester: { id: 12, name: "Requester" },
        itPriority: "HIGH", currentStatus: "IN_PROGRESS", assignedStaff: null, updatedAt: "2026-10-16T00:00:00.000Z",
      }],
      page: 6, pageSize: 20, total: 200, totalPages: 10,
    });

    render(<StaffTicketQueue location="/staff/tickets?page=6" onNavigate={vi.fn()} />);

    const currentPage = await screen.findByRole("button", { name: "Page 6" });
    expect(currentPage).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Page 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 7" })).toBeInTheDocument();
    expect(fetchTickets).toHaveBeenCalledWith(expect.objectContaining({ page: 6 }), expect.any(AbortSignal));
  });

  it("T-UI-NAV-02 / AC-14 hides requester date-filter chips when an invalid future bound is omitted", async () => {
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories: [], relatedSystems: [] });
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue({ data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });
    const user = userEvent.setup();
    render(<RequesterProvider mode="disabled"><MyTickets onNavigate={vi.fn()} /></RequesterProvider>);
    await screen.findByRole("heading", { name: "My Tickets" });

    const future = new Date(Date.now() + 120_000).toISOString();
    await user.type(screen.getByRole("textbox", { name: "Before (UTC ISO)" }), future);

    expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("T-UI-NAV-02 / AC-14 hides Staff date-filter chips when an invalid future bound is omitted", async () => {
    vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    const user = userEvent.setup();
    render(<StaffTicketQueue onNavigate={vi.fn()} />);
    await screen.findByRole("heading", { name: "Staff Ticket Queue" });

    const future = new Date(Date.now() + 120_000).toISOString();
    await user.type(screen.getByRole("textbox", { name: "Before (UTC ISO)" }), future);

    expect(screen.queryByRole("region", { name: "Active filters" })).not.toBeInTheDocument();
  });

  it("T-UI-NAV-01 / AC-14 confirms before navigating away from an unsaved Action draft", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<RequesterProvider mode="disabled"><NavigationDraftHarness onNavigate={onNavigate} /></RequesterProvider>);

    await user.click(screen.getByRole("button", { name: "Start an Action draft" }));
    await user.click(screen.getByRole("button", { name: "Go to dashboard" }));

    expect(screen.getByRole("alertdialog", { name: "Discard changes?" })).toBeInTheDocument();
    expect(onNavigate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
