import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import type { Express, NextFunction, Request, RequestHandler, Response } from "express";
import { getPrisma } from "./prisma.js";

export const SESSION_COOKIE = "tt_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;
const PASSWORD_MIN = 12;
const PASSWORD_MAX = 128;
const AUTH_ORIGIN = process.env.AUTH_ORIGIN ?? "http://localhost:3000";

export type AuthRole = "REQUESTER" | "IT_STAFF" | "ADMIN";

export interface AuthUserRecord {
  id: number;
  name: string;
  email: string;
  passwordHash: string;
  role: AuthRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

export interface AuthSessionRecord {
  id: number;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  invalidatedAt: Date | null;
  user: AuthUserRecord;
}

export interface AuthPrisma {
  user: {
    findUnique(args: unknown): Promise<any>;
    update(args: unknown): Promise<any>;
  };
  session: {
    findUnique(args: unknown): Promise<any>;
    create(args: unknown): Promise<any>;
    update(args: unknown): Promise<any>;
  };
}

interface AuthContext {
  user: AuthUserRecord;
  session: AuthSessionRecord;
  tokenHash: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const csrfHashes = new Map<string, { hash: string; expiresAt: number }>();

function scrypt(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 32, { N: 16_384, r: 8, p: 1 });
  return `$scrypt$N=16384,r=8,p=1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const match = /^\$scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([^$]+)\$([^$]+)$/.exec(encoded);
  if (!match) return false;
  const [, nText, rText, pText, saltText, digestText] = match;
  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || N < 2 || r < 1 || p < 1 || N > 2 ** 20) return false;
  try {
    const expected = Buffer.from(digestText, "base64url");
    const actual = await scrypt(password, Buffer.from(saltText, "base64url"), expected.length, { N, r, p });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isSessionUsable(
  session: { expiresAt: Date; invalidatedAt: Date | null; userActive: boolean },
  now = new Date(),
): boolean {
  return session.userActive && session.invalidatedAt === null && session.expiresAt.getTime() > now.getTime();
}

export function validatePasswordChange(currentPassword: string, newPassword: string, currentHash: string): { valid: true } | { valid: false; message: string } {
  const next = typeof newPassword === "string" ? newPassword.trim() : "";
  const current = typeof currentPassword === "string" ? currentPassword.trim() : "";
  if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) {
    return { valid: false, message: `New password must contain ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` };
  }
  if (next === current || next === currentHash) {
    return { valid: false, message: "New password must differ from the current password." };
  }
  return { valid: true };
}

function safeUser(user: AuthUserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return [];
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return [[name, value]];
  }));
}

function cookieHeader(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function setSessionCookie(res: Response, token: string, maxAge = SESSION_TTL_SECONDS): void {
  res.setHeader("Set-Cookie", cookieHeader(token, maxAge));
}

function clearSessionCookie(res: Response): void {
  setSessionCookie(res, "", 0);
}

function invalidCredentials(res: Response): void {
  res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } });
}

function invalidRequest(res: Response, message: string): void {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: "FORBIDDEN", message: "Request origin or CSRF token is invalid." } });
}

async function loadAuth(req: Request, prisma: AuthPrisma): Promise<AuthContext | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token || token.length < 20) return null;
  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session || !isSessionUsable({ expiresAt: session.expiresAt, invalidatedAt: session.invalidatedAt, userActive: session.user.isActive })) return null;
  return { user: session.user, session, tokenHash };
}

function originIsSame(req: Request): boolean {
  return req.get("Origin") === AUTH_ORIGIN;
}

function csrfIsValid(req: Request, auth: AuthContext): boolean {
  const supplied = req.get("X-CSRF-Token");
  const expected = csrfHashes.get(auth.tokenHash);
  if (!supplied || !expected || expected.expiresAt <= Date.now()) return false;
  const suppliedHash = createHash("sha256").update(supplied, "utf8").digest("hex");
  const suppliedBytes = Buffer.from(suppliedHash, "utf8");
  const expectedBytes = Buffer.from(expected.hash, "utf8");
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

export function createAuthMiddleware(prismaProvider: () => AuthPrisma = getPrisma): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = await loadAuth(req, prismaProvider());
      if (!auth) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
        return;
      }
      req.auth = auth;
      next();
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  };
}

export const requirePasswordChanged: RequestHandler = (req, res, next) => {
  if (!req.auth) {
    res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
    return;
  }
  if (req.auth.user.mustChangePassword) {
    res.status(403).json({ error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Password change is required before continuing." } });
    return;
  }
  next();
};

export function registerAuthRoutes(app: Express, prismaProvider: () => AuthPrisma = getPrisma): void {
  app.post("/api/auth/login", async (req, res) => {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || email.length > 320) {
      invalidRequest(res, "Email and password are required.");
      return;
    }
    try {
      const prisma = prismaProvider();
      const candidate = await prisma.user.findUnique({ where: { email } });
      if (!candidate || !candidate.isActive || !(await verifyPassword(password, candidate.passwordHash))) {
        invalidCredentials(res);
        return;
      }
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashSessionToken(token);
      await prisma.session.create({ data: { userId: candidate.id, tokenHash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
      setSessionCookie(res, token);
      res.status(200).json({ user: safeUser(candidate) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.get("/api/auth/csrf", async (req, res) => {
    try {
      const auth = await loadAuth(req, prismaProvider());
      if (!auth) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
        return;
      }
      const token = randomBytes(32).toString("base64url");
      csrfHashes.set(auth.tokenHash, { hash: createHash("sha256").update(token, "utf8").digest("hex"), expiresAt: auth.session.expiresAt.getTime() });
      res.status(200).json({ csrfToken: token });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.get("/api/auth/me", async (req, res) => {
    try {
      const auth = await loadAuth(req, prismaProvider());
      if (!auth) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
        return;
      }
      res.status(200).json({ user: safeUser(auth.user) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      const prisma = prismaProvider();
      const auth = await loadAuth(req, prisma);
      if (!auth) {
        clearSessionCookie(res);
        res.status(204).end();
        return;
      }
      if (!originIsSame(req) || !csrfIsValid(req, auth)) {
        forbidden(res);
        return;
      }
      await prisma.session.update({ where: { id: auth.session.id }, data: { invalidatedAt: new Date() } });
      csrfHashes.delete(auth.tokenHash);
      clearSessionCookie(res);
      res.status(204).end();
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.post("/api/auth/change-password", async (req, res) => {
    try {
      const prisma = prismaProvider();
      const auth = await loadAuth(req, prisma);
      if (!auth) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
        return;
      }
      if (!originIsSame(req) || !csrfIsValid(req, auth)) {
        forbidden(res);
        return;
      }
      const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
      const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
      const validation = validatePasswordChange(currentPassword, newPassword, auth.user.passwordHash);
      if (!validation.valid) {
        invalidRequest(res, validation.message);
        return;
      }
      if (!(await verifyPassword(currentPassword, auth.user.passwordHash))) {
        invalidCredentials(res);
        return;
      }
      const passwordHash = await hashPassword(newPassword);
      const updated = await prisma.user.update({ where: { id: auth.user.id }, data: { passwordHash, mustChangePassword: false } });
      await prisma.session.update({ where: { id: auth.session.id }, data: { invalidatedAt: new Date() } });
      csrfHashes.delete(auth.tokenHash);
      const token = randomBytes(32).toString("base64url");
      const tokenHash = hashSessionToken(token);
      await prisma.session.create({ data: { userId: updated.id, tokenHash, expiresAt: new Date(Date.now() + SESSION_TTL_MS) } });
      setSessionCookie(res, token);
      res.status(200).json({ user: safeUser(updated) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });
}
