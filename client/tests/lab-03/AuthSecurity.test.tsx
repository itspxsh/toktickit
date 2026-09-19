import { describe, expect, it, vi } from "vitest";
import { changePassword, loginUser } from "../../src/api.ts";

describe("L3-08 auth client hardening", () => {
  it("does not reuse a CSRF token across login/session rotation", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "stale" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "expired" } }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1, name: "Admin", email: "admin@example.test", role: "ADMIN", isActive: true, mustChangePassword: false } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "fresh" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ user: { id: 1, name: "Admin", email: "admin@example.test", role: "ADMIN", isActive: true, mustChangePassword: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(changePassword("old password", "new password")).rejects.toThrow();
    await loginUser("admin@example.test", "password");
    await changePassword("old password", "new password");
    const csrfCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/auth/csrf"));
    expect(csrfCalls).toHaveLength(2);
  });
});
