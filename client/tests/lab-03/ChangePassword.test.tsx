import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, ChangePassword } from "../../src/auth.tsx";

describe("L3-08 Change Password", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1, name: "Requester", email: "requester@example.test", role: "REQUESTER", isActive: true, mustChangePassword: true } }), { status: 200 })));
  });

  it("T-UI-02 / AC-02 validates confirmation and keeps role navigation blocked until success", async () => {
    const user = userEvent.setup();
    render(<AuthProvider><ChangePassword /></AuthProvider>);
    expect(screen.getByRole("heading", { name: "Change Password" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Current password"), "temporary password");
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "short");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/12.*128/i);
    expect(screen.queryByRole("link", { name: "My Tickets" })).not.toBeInTheDocument();
  });

  it("clears all password fields after a failed server change", async () => {
    const user = userEvent.setup();
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "Unable to change password." } }), { status: 400 })));
    render(<AuthProvider><ChangePassword /></AuthProvider>);
    await user.type(screen.getByLabelText("Current password"), "temporary password");
    await user.type(screen.getByLabelText("New password"), "a valid password");
    await user.type(screen.getByLabelText("Confirm new password"), "a valid password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
  });
});
