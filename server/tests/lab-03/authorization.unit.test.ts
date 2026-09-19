import { describe, expect, it, vi } from "vitest";
import { createRequesterAuthMiddleware, roleAllowed } from "../../src/authorization.js";
import { createPasswordChangedMiddleware } from "../../src/auth.js";

describe("Lab 3 authorization predicates", () => {
  it("T-UNIT-04 allows only the explicitly granted roles", () => {
    expect(roleAllowed("REQUESTER", ["REQUESTER"])).toBe(true);
    expect(roleAllowed("REQUESTER", ["IT_STAFF", "ADMIN"])).toBe(false);
    expect(roleAllowed("IT_STAFF", ["IT_STAFF", "ADMIN"])).toBe(true);
    expect(roleAllowed("ADMIN", ["IT_STAFF", "ADMIN"])).toBe(true);
  });

  it("blocks first-login sessions before protected handlers and passes changed sessions", () => {
    const next = vi.fn();
    const middleware = createPasswordChangedMiddleware((req, _res, afterAuth) => {
      (req as any).auth = { user: { mustChangePassword: true } };
      afterAuth();
    });
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    middleware({} as any, { status, json } as any, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Password change is required before continuing." } });
    expect(next).not.toHaveBeenCalled();

    status.mockClear();
    json.mockClear();
    const changed = createPasswordChangedMiddleware((req, _res, afterAuth) => {
      (req as any).auth = { user: { mustChangePassword: false } };
      afterAuth();
    });
    changed({} as any, { status, json } as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("resolves requester scope from the authenticated user, never from a header", async () => {
    const next = vi.fn();
    const middleware = createRequesterAuthMiddleware(() => ({
      user: { findUnique: vi.fn() },
      session: {
        findUnique: vi.fn(async () => ({
          id: 1,
          userId: 12,
          tokenHash: "hash",
          expiresAt: new Date(Date.now() + 60_000),
          invalidatedAt: null,
          user: { id: 12, role: "REQUESTER", isActive: true },
        })),
      },
      requester: { findUnique: vi.fn(async () => ({ id: 7, isActive: true })) },
    } as any));
    const req = { headers: { cookie: "tt_session=opaque-session-token-123456789" }, get(name: string) {
      return name.toLowerCase() === "cookie" ? this.headers.cookie : undefined;
    }, requesterId: 999 } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    await middleware(req, res, next);
    expect(req.requesterId).toBe(7);
    expect(next).toHaveBeenCalledOnce();
  });
});
