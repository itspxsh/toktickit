import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  hashPassword,
  createAuthMiddleware,
  registerAuthRoutes,
  requirePasswordChanged,
  type AuthPrisma,
} from "../../src/auth.js";

const password = "initial-password-123";
const user = {
  id: 12,
  name: "Example Requester",
  email: "person@example.test",
  passwordHash: "",
  role: "REQUESTER" as const,
  isActive: true,
  mustChangePassword: true,
};

async function harness(overrides: Partial<typeof user> = {}) {
  const storedUser = { ...user, passwordHash: await hashPassword(password), ...overrides };
  let session: { id: number; userId: number; tokenHash: string; expiresAt: Date; invalidatedAt: Date | null; user: typeof storedUser } | null = null;
  let nextSessionId = 1;
  const prisma: AuthPrisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: number } }) => {
        if (where.email && where.email !== storedUser.email) return null;
        if (where.id && where.id !== storedUser.id) return null;
        return storedUser;
      }),
      update: vi.fn(async ({ data }: { data: Partial<typeof storedUser> }) => Object.assign(storedUser, data)),
    },
    session: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        session && session.tokenHash === where.tokenHash ? { ...session, user: storedUser } : null),
      create: vi.fn(async ({ data }: { data: { userId: number; tokenHash: string; expiresAt: Date } }) => {
        session = { id: nextSessionId++, ...data, invalidatedAt: null, user: storedUser };
        return session;
      }),
      update: vi.fn(async ({ data }: { data: { invalidatedAt: Date } }) => {
        if (session) session.invalidatedAt = data.invalidatedAt;
        return session;
      }),
    },
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, () => prisma);
  app.get("/api/protected-probe", createAuthMiddleware(() => prisma), requirePasswordChanged, (_req, res) => res.json({ ok: true }));
  return { app, prisma, storedUser, getSession: () => session };
}

function sessionCookie(response: { headers: Record<string, unknown> }): string {
  const cookies = response.headers["set-cookie"];
  if (!Array.isArray(cookies) || typeof cookies[0] !== "string") throw new Error("login did not issue a session cookie");
  return cookies[0].split(";", 1)[0];
}

async function loginCookie(app: express.Express, loginPassword = password): Promise<string> {
  return sessionCookie(await request(app).post("/api/auth/login").send({ email: user.email, password: loginPassword }));
}

describe("Lab 3 authentication API", () => {
  it("T-AUTH-01 logs in an active user with a safe identity and opaque cookie", async () => {
    const { app } = await harness({ mustChangePassword: false });
    const response = await request(app).post("/api/auth/login").send({ email: " PERSON@EXAMPLE.TEST ", password });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ user: expect.objectContaining({ id: 12, email: "person@example.test", role: "REQUESTER", isActive: true, mustChangePassword: false }) });
    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(response.headers["set-cookie"][0]).toMatch(/tt_session=[^;]+; Max-Age=43200; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  });

  it("T-AUTH-02 uses one indistinguishable 401 envelope for unknown, inactive, and wrong credentials", async () => {
    const unknown = await harness();
    const unknownResponse = await request(unknown.app).post("/api/auth/login").send({ email: "unknown@example.test", password });
    const inactive = await harness({ isActive: false });
    const inactiveResponse = await request(inactive.app).post("/api/auth/login").send({ email: user.email, password });
    const wrong = await harness();
    const wrongResponse = await request(wrong.app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });
    expect([unknownResponse, inactiveResponse, wrongResponse].map((response) => [response.status, response.body])).toEqual([
      [401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }],
      [401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }],
      [401, { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } }],
    ]);
  });

  it("T-AUTH-03 gates protected routes until first-login password change", async () => {
    const { app } = await harness();
    const cookie = await loginCookie(app);
    const blocked = await request(app).get("/api/protected-probe").set("Cookie", cookie);
    expect(blocked.status).toBe(403);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(200);
  });

  it("T-AUTH-04 changes password, clears first-login state, and rotates the session", async () => {
    const { app, storedUser } = await harness();
    const cookie = await loginCookie(app);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .set("Origin", "http://localhost:3000")
      .set("X-CSRF-Token", csrf.body.csrfToken)
      .send({ currentPassword: password, newPassword: "a-new-password-123" });
    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(false);
    expect(storedUser.passwordHash).not.toContain("a-new-password-123");
    expect(response.headers["set-cookie"][0]).toMatch(/tt_session=/);
    const rotatedCookie = sessionCookie(response);
    expect((await request(app).get("/api/auth/me").set("Cookie", rotatedCookie)).status).toBe(200);
    expect((await request(app).post("/api/auth/login").send({ email: user.email, password })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: user.email, password: "a-new-password-123" })).status).toBe(200);
  });

  it("T-AUTH-05 invalidates logout sessions and never returns a token", async () => {
    const { app } = await harness({ mustChangePassword: false });
    const cookie = await loginCookie(app);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", csrf.body.csrfToken);
    expect(logout.status).toBe(204);
    expect(JSON.stringify(logout.body)).not.toMatch(/tt_session|token/i);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/api/auth/logout")).status).toBe(204);
  });

  it("T-AUTH-06 rejects unsafe cookie-authenticated requests from a foreign origin", async () => {
    const { app } = await harness({ mustChangePassword: false });
    const cookie = await loginCookie(app);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const response = await request(app).post("/api/auth/logout").set("Cookie", cookie).set("Origin", "https://evil.example").set("X-CSRF-Token", csrf.body.csrfToken);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: "FORBIDDEN", message: "Request origin or CSRF token is invalid." } });
  });

  it("T-AUTH-06 rejects unsafe cookie-authenticated requests with a forged CSRF token", async () => {
    const { app } = await harness({ mustChangePassword: false });
    const cookie = await loginCookie(app);
    const response = await request(app).post("/api/auth/logout").set("Cookie", cookie).set("Origin", "http://localhost:3000").set("X-CSRF-Token", "forged");
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: { code: "FORBIDDEN", message: "Request origin or CSRF token is invalid." } });
  });

  it("T-AUTH-04 rejects invalid password changes without mutating the user", async () => {
    const { app, prisma } = await harness();
    const cookie = await loginCookie(app);
    const csrf = await request(app).get("/api/auth/csrf").set("Cookie", cookie);
    const headers = { Cookie: cookie, Origin: "http://localhost:3000", "X-CSRF-Token": csrf.body.csrfToken };
    expect((await request(app).post("/api/auth/change-password").set(headers).send({ currentPassword: password, newPassword: "short" })).status).toBe(400);
    expect((await request(app).post("/api/auth/change-password").set(headers).send({ currentPassword: "wrong-password", newPassword: "a-new-password-123" })).status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("T-AUTH-05 rejects an expired session through the API", async () => {
    const { app, getSession } = await harness({ mustChangePassword: false });
    const cookie = await loginCookie(app);
    getSession()!.expiresAt = new Date(Date.now() - 1);
    expect((await request(app).get("/api/auth/me").set("Cookie", cookie)).status).toBe(401);
  });
});
