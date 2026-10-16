import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleGuard } from "../../src/auth.tsx";
import { AppShell } from "../../src/components/ui.tsx";

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
});
