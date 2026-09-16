import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { createAuthMiddleware, type AuthRole } from "./auth.js";
import { getPrisma } from "./prisma.js";

export type RequesterLookupClient = Pick<PrismaClient, "requester">;

declare global {
  namespace Express {
    interface Request {
      /** Database Requester id resolved from the authenticated User. */
      requesterId?: number;
    }
  }
}

export function roleAllowed(role: AuthRole | undefined, allowed: readonly AuthRole[]): boolean {
  return role !== undefined && allowed.includes(role);
}

function unauthenticated(res: Response): void {
  res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
}

export function requireRoles(allowed: readonly AuthRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      unauthenticated(res);
      return;
    }
    if (!roleAllowed(req.auth.user.role, allowed)) {
      forbidden(res);
      return;
    }
    next();
  };
}

/**
 * Resolve the Requester row from the authenticated User. A header or body
 * requester id is deliberately never consulted by this middleware.
 */
export function createRequesterAuthMiddleware(
  prismaProvider: () => RequesterLookupClient = getPrisma as unknown as () => RequesterLookupClient,
): RequestHandler {
  const sessionAuth = createAuthMiddleware(prismaProvider as never);
  return async (req: Request, res: Response, next: NextFunction) => {
    await sessionAuth(req, res, () => undefined);
    if (!req.auth) return;
    if (!roleAllowed(req.auth.user.role, ["REQUESTER"])) {
      forbidden(res);
      return;
    }
    try {
      const requester = await prismaProvider().requester.findUnique({
        where: { userId: req.auth.user.id },
        select: { id: true, isActive: true },
      }) as { id: number; isActive: boolean } | null;
      if (!requester || requester.isActive !== true) {
        // Keep inactive/missing requester identities indistinguishable from a
        // forbidden authenticated request and never disclose row existence.
        forbidden(res);
        return;
      }
      req.requesterId = requester.id;
      next();
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  };
}

export default { roleAllowed, requireRoles, createRequesterAuthMiddleware };
