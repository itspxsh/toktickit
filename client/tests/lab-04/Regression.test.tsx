import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, Login } from "../../src/auth.tsx";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("T-UI-REG-01 / AC-13, AC-17: safe inherited auth regression", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("clears a failed login password and shows only the safe API message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) return jsonResponse({ error: { code: "UNAUTHENTICATED", message: "Please sign in." } }, 401);
      if (url.includes("/api/auth/csrf")) return jsonResponse({ csrfToken: "local-test-token" }, 200);
      if (url.includes("/api/auth/login")) return jsonResponse({
        error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect.", internal: "secret-hash-must-not-render" },
      }, 401);
      throw new Error("Unexpected test request");
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<AuthProvider><Login /></AuthProvider>);

    await user.type(await screen.findByLabelText("Email"), "requester@example.test");
    const password = screen.getByLabelText("Password");
    await user.type(password, "incorrect-fixture-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(password).toHaveValue("");
    expect(document.body).not.toHaveTextContent("secret-hash-must-not-render");
  });
});
