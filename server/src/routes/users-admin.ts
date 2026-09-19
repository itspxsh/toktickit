import type { Express, Request, RequestHandler, Response } from "express";
import { hashPassword } from "../auth.js";
import { getPrisma } from "../prisma.js";
import { createAdminAuthMiddleware } from "../authorization.js";

type UserModel = {
  findMany(args: unknown): Promise<any[]>;
  count(args: unknown): Promise<number>;
  findUnique(args: unknown): Promise<any | null>;
  create(args: unknown): Promise<any>;
  update(args: unknown): Promise<any>;
};

type SessionModel = { updateMany(args: unknown): Promise<{ count: number }> };

export interface AdminUserClient {
  user: UserModel;
  session: SessionModel;
}

type UserRole = "REQUESTER" | "IT_STAFF" | "ADMIN";
const ROLES = new Set<UserRole>(["REQUESTER", "IT_STAFF", "ADMIN"]);
const MAX_PAGE_SIZE = 100;
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
};

function bodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function error(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message } });
}

function validation(res: Response, message: string): void {
  error(res, 400, "VALIDATION_ERROR", message);
}

function isPlainObjectWithKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function canonicalEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function validName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 120 ? name : null;
}

function validPassword(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const password = value.trim();
  return password.length >= 12 && password.length <= 128 ? password : null;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function safeUser(row: any): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseListQuery(raw: Record<string, unknown>): { where?: Record<string, unknown>; page: number; pageSize: number; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const where: Record<string, unknown> = {};
  if (raw.q !== undefined) {
    if (typeof raw.q !== "string" || raw.q.trim().length > 100) fieldErrors.q = "Search must contain at most 100 characters.";
    else if (raw.q.trim()) where.OR = [{ name: { contains: raw.q.trim(), mode: "insensitive" } }, { email: { contains: raw.q.trim(), mode: "insensitive" } }];
  }
  if (raw.role !== undefined) {
    if (typeof raw.role !== "string" || !ROLES.has(raw.role as UserRole)) fieldErrors.role = "Role is invalid.";
    else where.role = raw.role;
  }
  if (raw.isActive !== undefined) {
    if (raw.isActive !== "true" && raw.isActive !== "false") fieldErrors.isActive = "isActive must be true or false.";
    else where.isActive = raw.isActive === "true";
  }
  let page = 1;
  if (raw.page !== undefined) {
    const value = positiveInteger(raw.page);
    if (value === null) fieldErrors.page = "Page must be a positive integer.";
    else page = value;
  }
  let pageSize = 20;
  if (raw.pageSize !== undefined) {
    const value = positiveInteger(raw.pageSize);
    if (value === null || value > MAX_PAGE_SIZE) fieldErrors.pageSize = `Page size must be a positive integer no greater than ${MAX_PAGE_SIZE}.`;
    else pageSize = value;
  }
  if (page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize) + 1) fieldErrors.page = "Page is too large.";
  return { where: Object.keys(fieldErrors).length ? undefined : where, page, pageSize, fieldErrors };
}

function isUniqueViolation(reason: unknown): boolean {
  return Boolean(reason && typeof reason === "object" && (reason as { code?: unknown }).code === "P2002");
}

function actorId(req: Request): number | null {
  const value = req.auth?.user.id;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

/** Admin-only user list, create/edit, activation, and initial-password reset. */
export function registerAdminUserRoutes(
  app: Express,
  prismaProvider: () => AdminUserClient = getPrisma as unknown as () => AdminUserClient,
  authorizationMiddleware: RequestHandler = createAdminAuthMiddleware(),
  csrfMiddleware: RequestHandler = (_req, _res, next) => next(),
): void {
  app.get("/api/admin/users", authorizationMiddleware, async (req, res) => {
    const parsed = parseListQuery(req.query as Record<string, unknown>);
    if (!parsed.where) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "One or more query parameters are invalid.", fieldErrors: parsed.fieldErrors } });
      return;
    }
    const skip = (parsed.page - 1) * parsed.pageSize;
    try {
      const prisma = prismaProvider();
      const [rows, total] = await Promise.all([
        prisma.user.findMany({ where: parsed.where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip, take: parsed.pageSize, select: SAFE_USER_SELECT }),
        prisma.user.count({ where: parsed.where }),
      ]);
      res.status(200).json({ items: rows.map(safeUser), page: parsed.page, pageSize: parsed.pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / parsed.pageSize) });
    } catch {
      error(res, 500, "INTERNAL_ERROR", "Something went wrong.");
    }
  });

  app.post("/api/admin/users", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const body = bodyObject(req.body);
    if (!body || !isPlainObjectWithKeys(body, ["name", "email", "role", "initialPassword"]) || Object.keys(body).length !== 4) return validation(res, "Name, email, role, and initial password are required.");
    const name = validName(body.name);
    const email = canonicalEmail(body.email);
    const password = validPassword(body.initialPassword);
    if (!name) return validation(res, "Name must contain 1-120 characters.");
    if (!email) return validation(res, "Email is invalid.");
    if (typeof body.role !== "string" || !ROLES.has(body.role as UserRole)) return validation(res, "Role is invalid.");
    if (!password) return validation(res, "Initial password must contain 12-128 characters.");
    try {
      const created = await prismaProvider().user.create({ data: { name, email, role: body.role, passwordHash: await hashPassword(password), isActive: true, mustChangePassword: true }, select: SAFE_USER_SELECT });
      res.status(201).json({ user: safeUser(created) });
    } catch (reason) {
      if (isUniqueViolation(reason)) return error(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
      error(res, 500, "INTERNAL_ERROR", "Something went wrong.");
    }
  });

  app.patch("/api/admin/users/:userId", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const id = positiveInteger(req.params.userId);
    if (id === null) return error(res, 400, "INVALID_IDENTIFIER", "User id is invalid.");
    const body = bodyObject(req.body);
    if (!body || Object.keys(body).length === 0 || !isPlainObjectWithKeys(body, ["name", "email", "role", "isActive"])) return validation(res, "Only name, email, role, and isActive may be changed.");
    const name = body.name === undefined ? undefined : validName(body.name);
    const email = body.email === undefined ? undefined : canonicalEmail(body.email);
    if (body.name !== undefined && !name) return validation(res, "Name must contain 1-120 characters.");
    if (body.email !== undefined && !email) return validation(res, "Email is invalid.");
    if (body.role !== undefined && (typeof body.role !== "string" || !ROLES.has(body.role as UserRole))) return validation(res, "Role is invalid.");
    if (body.isActive !== undefined && typeof body.isActive !== "boolean") return validation(res, "isActive must be boolean.");
    try {
      const prisma = prismaProvider();
      const target = await prisma.user.findUnique({ where: { id }, select: { ...SAFE_USER_SELECT } });
      if (!target) return error(res, 404, "NOT_FOUND", "User was not found.");
      const nextActive = body.isActive === undefined ? target.isActive : body.isActive;
      const nextRole = body.role === undefined ? target.role : body.role;
      if (id === actorId(req) && nextActive === false) return error(res, 409, "ADMIN_SAFETY_RULE", "An Administrator cannot deactivate their own account.");
      if (target.role === "ADMIN" && target.isActive === true && (nextActive === false || nextRole !== "ADMIN")) {
        const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
        if (activeAdmins <= 1) return error(res, 409, "ADMIN_SAFETY_RULE", "The last active Administrator cannot be removed.");
      }
      const data: Record<string, unknown> = {};
      if (name !== undefined) data.name = name;
      if (email !== undefined) data.email = email;
      if (body.role !== undefined) data.role = body.role;
      if (body.isActive !== undefined) data.isActive = body.isActive;
      const updated = await prisma.user.update({ where: { id }, data, select: SAFE_USER_SELECT });
      if (target.isActive === true && nextActive === false) await prisma.session.updateMany({ where: { userId: id, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
      res.status(200).json({ user: safeUser(updated) });
    } catch (reason) {
      if (isUniqueViolation(reason)) return error(res, 409, "EMAIL_ALREADY_EXISTS", "A user with this email already exists.");
      error(res, 500, "INTERNAL_ERROR", "Something went wrong.");
    }
  });

  app.post("/api/admin/users/:userId/reset-initial-password", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const id = positiveInteger(req.params.userId);
    if (id === null) return error(res, 400, "INVALID_IDENTIFIER", "User id is invalid.");
    const body = bodyObject(req.body);
    if (!body || Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, "initialPassword")) return validation(res, "Initial password is required.");
    const password = validPassword(body.initialPassword);
    if (!password) return validation(res, "Initial password must contain 12-128 characters.");
    try {
      const prisma = prismaProvider();
      const target = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!target) return error(res, 404, "NOT_FOUND", "User was not found.");
      const updated = await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true }, select: SAFE_USER_SELECT });
      await prisma.session.updateMany({ where: { userId: id, invalidatedAt: null }, data: { invalidatedAt: new Date() } });
      res.status(200).json({ user: safeUser(updated) });
    } catch {
      error(res, 500, "INTERNAL_ERROR", "Something went wrong.");
    }
  });
}

export default registerAdminUserRoutes;
