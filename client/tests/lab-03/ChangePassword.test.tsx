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
});
