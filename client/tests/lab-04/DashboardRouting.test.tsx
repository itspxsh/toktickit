import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoleGuard } from "../../src/auth.tsx";
import { AppShell } from "../../src/components/ui.tsx";
import { MyTickets } from "../../src/my-tickets.tsx";
import { RequesterProvider } from "../../src/requester.tsx";
import * as api from "../../src/api.ts";

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
});
