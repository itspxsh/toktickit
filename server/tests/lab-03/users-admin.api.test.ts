import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAdminUserRoutes } from "../../src/routes/users-admin.js";

const actor = { id: 99, name: "Root Admin", email: "root@example.test", role: "ADMIN", isActive: true, mustChangePassword: false };
const baseUser = { id: 12, name: "Example Requester", email: "requester@example.test", role: "REQUESTER", isActive: true, mustChangePassword: true, createdAt: new Date("2026-09-15T07:00:00.000Z"), updatedAt: new Date("2026-09-15T07:00:00.000Z"), passwordHash: "never-return" };

const adminAuth: RequestHandler = (req, _res, next) => {
  (req as any).auth = { user: actor, session: { id: 1, userId: actor.id, tokenHash: "opaque", expiresAt: new Date(Date.now() + 60_000), invalidatedAt: null }, tokenHash: "opaque" };
  next();
};

function createTestApp(overrides: Record<string, any> = {}) {
  const calls = {
    findMany: vi.fn(async () => [baseUser]),
    count: vi.fn(async () => 1),
    findUnique: vi.fn(async () => baseUser),
    create: vi.fn(async ({ data }: any) => ({ ...baseUser, ...data, id: 20, passwordHash: "hashed" })),
    update: vi.fn(async ({ data }: any) => ({ ...baseUser, ...data, passwordHash: "hashed" })),
    sessionUpdateMany: vi.fn(async () => ({ count: 1 })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  registerAdminUserRoutes(app, () => ({
    user: { findMany: calls.findMany, count: calls.count, findUnique: calls.findUnique, create: calls.create, update: calls.update },
    session: { updateMany: calls.sessionUpdateMany },
  }) as any, adminAuth, ((req, res, next) => next()) as RequestHandler);
  return { app, calls };
}

describe("L3-07 Admin user management", () => {
  it("T-ADMIN-01 / AC-10 lists safe users with search, role, active filter, and pagination", async () => {
    const { app, calls } = createTestApp();
    const response = await request(app).get("/api/admin/users?q=Example&role=REQUESTER&isActive=true&page=2&pageSize=20");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 2, pageSize: 20, total: 1, totalPages: 1, items: [{ id: 12, email: "requester@example.test", role: "REQUESTER" }] });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
    expect(calls.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ role: "REQUESTER", isActive: true }) }));
  });

  it("T-ADMIN-02 / AC-10 creates one canonical-role user without returning the password", async () => {
    const { app, calls } = createTestApp();
    const response = await request(app).post("/api/admin/users").send({ name: " New User ", email: " NEW@EXAMPLE.TEST ", role: "IT_STAFF", initialPassword: "a-secure-password" });
    expect(response.status).toBe(201);
    expect(response.body.user).toMatchObject({ name: "New User", email: "new@example.test", role: "IT_STAFF", mustChangePassword: true });
    expect(JSON.stringify(response.body)).not.toContain("password");
    expect(calls.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ email: "new@example.test", role: "IT_STAFF", mustChangePassword: true }) }));
  });

  it("T-ADMIN-02 rejects duplicate canonical email and invalid role", async () => {
    const duplicate = createTestApp({ create: vi.fn(async () => { const error: any = new Error("duplicate"); error.code = "P2002"; throw error; }) });
    const duplicateResponse = await request(duplicate.app).post("/api/admin/users").send({ name: "Other", email: "REQUESTER@EXAMPLE.TEST", role: "REQUESTER", initialPassword: "a-secure-password" });
    expect(duplicateResponse.status).toBe(409);
    expect(duplicateResponse.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    const invalid = await request(duplicate.app).post("/api/admin/users").send({ name: "Other", email: "other@example.test", role: "SUPERUSER", initialPassword: "a-secure-password" });
    expect(invalid.status).toBe(400);
  });

  it("T-ADMIN-03 / AC-11 blocks self and last-admin deactivation, and invalidates sessions on success", async () => {
    const self = createTestApp({ findUnique: vi.fn(async () => actor) });
    const selfResponse = await request(self.app).patch("/api/admin/users/99").send({ isActive: false });
    expect(selfResponse.status).toBe(409);
    expect(selfResponse.body.error.code).toBe("ADMIN_SAFETY_RULE");

    const target = { ...baseUser, id: 12, role: "ADMIN", isActive: true };
    const last = createTestApp({ findUnique: vi.fn(async () => target), count: vi.fn(async () => 1) });
    const lastResponse = await request(last.app).patch("/api/admin/users/12").send({ isActive: false });
    expect(lastResponse.status).toBe(409);
    expect(lastResponse.body.error.code).toBe("ADMIN_SAFETY_RULE");

    const deactivate = createTestApp({ findUnique: vi.fn(async () => baseUser), count: vi.fn(async () => 2) });
    const response = await request(deactivate.app).patch("/api/admin/users/12").send({ isActive: false });
    expect(response.status).toBe(200);
    expect(deactivate.calls.sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 12, invalidatedAt: null }) }));
  });

  it("T-ADMIN-04 / AC-11 resets an initial password as a hash and invalidates sessions", async () => {
    const { app, calls } = createTestApp();
    const response = await request(app).post("/api/admin/users/12/reset-initial-password").send({ initialPassword: "a-new-secure-password" });
    expect(response.status).toBe(200);
    expect(response.body.user.mustChangePassword).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain("a-new-secure-password");
    expect(calls.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mustChangePassword: true }) }));
    expect(calls.sessionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 12, invalidatedAt: null }) }));
  });
});
