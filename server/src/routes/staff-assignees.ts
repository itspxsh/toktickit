import type { Express, RequestHandler } from "express";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../prisma.js";
import { createStaffAuthMiddleware } from "../authorization.js";
import { ActionRuleError, isPositiveInteger } from "../lab-04/action-rules.js";

type Provider = () => PrismaClient;

function positiveQuery(raw: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) throw new ActionRuleError(400, "VALIDATION_ERROR", "Pagination query is invalid.");
  const parsed = Number(raw);
  if (!isPositiveInteger(parsed) || parsed > max) throw new ActionRuleError(400, "VALIDATION_ERROR", "Pagination query is outside the supported range.");
  return parsed;
}

function sendError(res: import("express").Response, error: unknown): void {
  if (error instanceof ActionRuleError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) } });
    return;
  }
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

export function registerStaffAssigneeRoutes(
  app: Express,
  provider: Provider = getPrisma,
  authorizationMiddleware: RequestHandler = createStaffAuthMiddleware(),
): void {
  app.get("/api/staff/assignees", authorizationMiddleware, async (req, res) => {
    try {
      const allowed = new Set(["q", "page", "pageSize"]);
      if (Object.keys(req.query).some((key) => !allowed.has(key))) throw new ActionRuleError(400, "VALIDATION_ERROR", "Unknown assignee query parameter.");
      let q: string | undefined;
      if (req.query.q !== undefined) {
        if (typeof req.query.q !== "string" || req.query.q.trim().length > 100) throw new ActionRuleError(400, "VALIDATION_ERROR", "q must contain at most 100 characters.", { q: "Use at most 100 characters." });
        q = req.query.q.trim() || undefined;
      }
      const page = positiveQuery(req.query.page, 1);
      const pageSize = positiveQuery(req.query.pageSize, 20, 100);
      if (page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize) + 1) throw new ActionRuleError(400, "VALIDATION_ERROR", "page is too large.");
      const where: Prisma.UserWhereInput = {
        isActive: true,
        role: { in: ["IT_STAFF", "ADMIN"] },
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
      };
      const prisma = provider();
      const [items, total] = await Promise.all([
        prisma.user.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { id: true, name: true, role: true, isActive: true } }),
        prisma.user.count({ where }),
      ]);
      res.status(200).json({ items, page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize) });
    } catch (error) {
      sendError(res, error);
    }
  });
}
