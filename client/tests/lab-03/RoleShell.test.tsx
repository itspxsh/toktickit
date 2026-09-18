import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../../src/components/ui.tsx";
import { RoleGuard } from "../../src/auth.tsx";

describe("L3-08 role-aware shell", () => {
  it("T-UI-03 / AC-03 exposes only requester destinations and accessible active state", () => {
    render(<AppShell activePath="/tickets" role="REQUESTER" userName="Example Requester" userEmail="requester@example.test"><p>content</p></AppShell>);
    expect(screen.getByRole("link", { name: "My Tickets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Staff Tickets" })).not.toBeInTheDocument();
    expect(screen.getByText("Requester")).toBeInTheDocument();
  });

  it("T-UI-03 / AC-03 exposes staff and admin destinations from server role", () => {
    render(<AppShell activePath="/admin/users" role="ADMIN" userName="System Administrator" userEmail="admin@example.test"><p>content</p></AppShell>);
    expect(screen.getByRole("link", { name: "Staff Tickets" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "User Management" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log out" })).toBeInTheDocument();
  });

  it("T-UI-03 / AC-03 renders a safe forbidden state for a disallowed deep link", () => {
    render(<RoleGuard role="REQUESTER" path="/admin/users"><p>secret page</p></RoleGuard>);
    expect(screen.getByRole("alert")).toHaveTextContent(/access denied/i);
    expect(screen.queryByText("secret page")).not.toBeInTheDocument();
  });

  it("does not render inert account actions when handlers are unavailable", () => {
    render(<AppShell activePath="/tickets" role="REQUESTER"><p>content</p></AppShell>);
    expect(screen.queryByRole("button", { name: "Change Password" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });
});
