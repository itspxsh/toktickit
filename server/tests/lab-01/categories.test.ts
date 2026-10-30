import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import {
  createAuthMiddleware,
  createPasswordChangedMiddleware,
  hashPassword,
  registerAuthRoutes,
} from "../../src/auth.js";
import { registerReferenceDataRoutes } from "../../src/routes/reference-data.js";

const password = "valid-test-password-123";
const user = {
  id: 32,
  name: "Lab Test Requester",
  email: "lab-test-requester@example.test",
  passwordHash: "",
  role: "REQUESTER" as const,
  isActive: true,
  mustChangePassword: false,
};

async function createTestApp() {
  const storedUser = { ...user, passwordHash: await hashPassword(password) };
  let session: {
    id: number;
    userId: number;
    tokenHash: string;
    expiresAt: Date;
    invalidatedAt: Date | null;
  } | null = null;
  const calls = { categoryFindMany: vi.fn(async () => [
    { id: 1, name: "Account and Access" },
    { id: 2, name: "Hardware" },
    { id: 4, name: "Network" },
    { id: 3, name: "Software" },
  ]) };
  const prisma = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: number } }) => {
        if (where.email && where.email !== storedUser.email) return null;
        if (where.id && where.id !== storedUser.id) return null;
        return storedUser;
      }),
      update: vi.fn(async () => storedUser),
    },
    session: {
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) =>
        session?.tokenHash === where.tokenHash ? { ...session, user: storedUser } : null),
      create: vi.fn(async ({ data }: { data: { userId: number; tokenHash: string; expiresAt: Date } }) => {
        session = { id: 1, ...data, invalidatedAt: null };
        return session;
      }),
      update: vi.fn(async () => session),
    },
    category: { findMany: calls.categoryFindMany },
    relatedSystem: { findMany: vi.fn(async () => []) },
  };
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, () => prisma as never);
  registerReferenceDataRoutes(
    app,
    () => prisma as never,
    createPasswordChangedMiddleware(createAuthMiddleware(() => prisma as never)),
  );
  return { app, calls };
}

function sessionCookie(response: request.Response): string {
  const cookie = response.headers["set-cookie"]?.[0];
  if (typeof cookie !== "string") throw new Error("Expected login to issue a session cookie.");
  return cookie.split(";", 1)[0];
}

describe("GET /api/categories", () => {
  it("returns active categories in name order to an authenticated requester", async () => {
    const { app, calls } = await createTestApp();
    const login = await request(app).post("/api/auth/login").send({ email: user.email, password });
    expect(login.status).toBe(200);

    const response = await request(app).get("/api/categories").set("Cookie", sessionCookie(login));
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: 1, name: "Account and Access" },
      { id: 2, name: "Hardware" },
      { id: 4, name: "Network" },
      { id: 3, name: "Software" },
    ]);
    expect(calls.categoryFindMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });

  it("returns 401 to anonymous callers without querying reference data", async () => {
    const { app, calls } = await createTestApp();
    const response = await request(app).get("/api/categories");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    expect(calls.categoryFindMany).not.toHaveBeenCalled();
  });
});
