import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, Login } from "../../src/auth.tsx";

describe("L3-08 Login", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("T-UI-01 / AC-02 renders labelled fields and signs in without persisting secrets", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1, name: "Admin", email: "admin@example.test", role: "ADMIN", isActive: true, mustChangePassword: false } }), { status: 200 })));
    render(<AuthProvider><Login /></AuthProvider>);
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    await user.type(screen.getByRole("textbox", { name: "Email" }), "admin@example.test");
    await user.type(password, "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Signed in as Admin/i)).toBeInTheDocument();
    expect(window.localStorage.length).toBe(0);
    expect(screen.queryByDisplayValue("correct horse battery staple")).not.toBeInTheDocument();
  });

  it("T-UI-01 exposes a generic safe credential error and clears the password", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHENTICATED" } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }), { status: 401 })));
    render(<AuthProvider><Login /></AuthProvider>);
    await user.type(screen.getByRole("textbox", { name: "Email" }), "unknown@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/email or password is incorrect/i);
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
