import type { Express, RequestHandler, Response } from "express";
import { getPrisma } from "../prisma.js";
import { createRequesterAuthMiddleware, createStaffAuthMiddleware } from "../authorization.js";
import { DashboardError, requesterDashboard, staffDashboard, type DashboardPrisma } from "../lab-04/dashboard-service.js";

type PrismaProvider = () => DashboardPrisma;
const REQUESTER_QUERY_KEYS = new Set<string>();
const STAFF_QUERY_KEYS = new Set(["actionPage", "actionPageSize"]);

function validation(res: Response, fieldErrors: Record<string, string>) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "One or more query parameters are invalid.", fieldErrors } });
}

function readPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function unknownKeys(query: Record<string, unknown>, allowed: Set<string>): Record<string, string> {
  return Object.fromEntries(Object.keys(query).filter((key) => !allowed.has(key)).map((key) => [key, "Query parameter is not supported."]));
}

function sendError(res: Response, error: unknown) {
  if (error instanceof DashboardError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to load dashboard data." } });
}

export function registerDashboardRoutes(
  app: Express,
  provider: PrismaProvider = getPrisma as unknown as PrismaProvider,
  requesterAuthorization: RequestHandler = createRequesterAuthMiddleware(),
  staffAuthorization: RequestHandler = createStaffAuthMiddleware(),
): void {
  app.get("/api/dashboards/requester", requesterAuthorization, async (req, res) => {
    const query = req.query as Record<string, unknown>;
    const fieldErrors = unknownKeys(query, REQUESTER_QUERY_KEYS);
    if (Object.keys(fieldErrors).length > 0) {
      validation(res, fieldErrors);
      return;
    }
    const actor = req.auth?.user;
    if (!actor || actor.role !== "REQUESTER") {
      res.status(actor ? 403 : 401).json({ error: { code: actor ? "FORBIDDEN" : "UNAUTHENTICATED", message: actor ? "You are not allowed to perform this action." : "Authentication is required." } });
      return;
    }
    try {
      res.status(200).json(await requesterDashboard(provider(), { id: actor.id, role: actor.role }));
    } catch (error) { sendError(res, error); }
  });

  app.get("/api/dashboards/staff", staffAuthorization, async (req, res) => {
    const query = req.query as Record<string, unknown>;
    const fieldErrors = unknownKeys(query, STAFF_QUERY_KEYS);
    let actionPage = 1;
    let actionPageSize = 5;
    if (query.actionPage !== undefined) {
      const parsed = readPositiveInteger(query.actionPage);
      if (parsed === undefined) fieldErrors.actionPage = "Action page must be a positive integer.";
      else actionPage = parsed;
    }
    if (query.actionPageSize !== undefined) {
      const parsed = readPositiveInteger(query.actionPageSize);
      if (parsed === undefined || parsed > 20) fieldErrors.actionPageSize = "Action page size must be between 1 and 20.";
      else actionPageSize = parsed;
    }
    if (actionPage > Math.floor(Number.MAX_SAFE_INTEGER / actionPageSize) + 1) fieldErrors.actionPage = "Action page is too large.";
    if (Object.keys(fieldErrors).length > 0) {
      validation(res, fieldErrors);
      return;
    }
    const actor = req.auth?.user;
    if (!actor || (actor.role !== "IT_STAFF" && actor.role !== "ADMIN")) {
      res.status(actor ? 403 : 401).json({ error: { code: actor ? "FORBIDDEN" : "UNAUTHENTICATED", message: actor ? "You are not allowed to perform this action." : "Authentication is required." } });
      return;
    }
    try {
      res.status(200).json(await staffDashboard(provider(), { id: actor.id, role: actor.role }, actionPage, actionPageSize));
    } catch (error) { sendError(res, error); }
  });
}

export default registerDashboardRoutes;
