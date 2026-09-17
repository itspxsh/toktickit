import type { Express, RequestHandler, Response } from "express";
import { getPrisma } from "../prisma.js";
import { createStaffAuthMiddleware } from "../authorization.js";

type QueueModel = {
  findMany(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
};

export interface StaffQueueClient {
  ticket: QueueModel;
}

type PrismaProvider = () => StaffQueueClient;
type QueueStatus = "NEW" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_REQUESTER" | "RESOLVED" | "CLOSED" | "REOPENED" | "CANCELLED";
type ItPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type Assignment = "unassigned" | "mine" | "assigned";
type QueueSort = "updatedAtDesc" | "priorityDesc" | "statusAsc";

const STATUSES = new Set<QueueStatus>([
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
]);
const IT_PRIORITIES = new Set<ItPriority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const ASSIGNMENTS = new Set<Assignment>(["unassigned", "mine", "assigned"]);
const SORTS = new Set<QueueSort>(["updatedAtDesc", "priorityDesc", "statusAsc"]);
const MAX_PAGE_SIZE = 100;
const QUEUE_SELECT = {
  ticketNumber: true,
  summary: true,
  requester: { select: { id: true, name: true } },
  itPriority: true,
  currentStatus: true,
  assignedStaff: { select: { id: true, name: true } },
  updatedAt: true,
};

function validation(res: Response, fieldErrors: Record<string, string>): void {
  res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "One or more query parameters are invalid.",
      fieldErrors,
    },
  });
}

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function positiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

interface QueueQuery {
  q?: string;
  status?: QueueStatus;
  itPriority?: ItPriority;
  assignment?: Assignment;
  sort: QueueSort;
  page: number;
  pageSize: number;
}

function parseQueueQuery(raw: Record<string, unknown>): { query?: QueueQuery; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  let q: string | undefined;
  if (raw.q !== undefined) {
    const value = queryString(raw.q);
    if (value === undefined || value.trim().length > 100) fieldErrors.q = "Search must contain at most 100 characters.";
    else if (value.trim()) q = value.trim();
  }

  let status: QueueStatus | undefined;
  if (raw.status !== undefined) {
    const value = queryString(raw.status);
    if (value === undefined || !STATUSES.has(value as QueueStatus)) fieldErrors.status = "Status is invalid.";
    else status = value as QueueStatus;
  }

  let itPriority: ItPriority | undefined;
  if (raw.itPriority !== undefined) {
    const value = queryString(raw.itPriority);
    if (value === undefined || !IT_PRIORITIES.has(value as ItPriority)) fieldErrors.itPriority = "IT priority is invalid.";
    else itPriority = value as ItPriority;
  }

  let assignment: Assignment | undefined;
  if (raw.assignment !== undefined) {
    const value = queryString(raw.assignment);
    if (value === undefined || !ASSIGNMENTS.has(value as Assignment)) fieldErrors.assignment = "Assignment filter is invalid.";
    else assignment = value as Assignment;
  }

  let sort: QueueSort = "updatedAtDesc";
  if (raw.sort !== undefined) {
    const value = queryString(raw.sort);
    if (value === undefined || !SORTS.has(value as QueueSort)) fieldErrors.sort = "Sort is invalid.";
    else sort = value as QueueSort;
  }

  let page = 1;
  if (raw.page !== undefined) {
    const value = positiveInteger(raw.page);
    if (value === undefined) fieldErrors.page = "Page must be a positive integer.";
    else page = value;
  }

  let pageSize = 20;
  if (raw.pageSize !== undefined) {
    const value = positiveInteger(raw.pageSize);
    if (value === undefined || value > MAX_PAGE_SIZE) fieldErrors.pageSize = `Page size must be a positive integer no greater than ${MAX_PAGE_SIZE}.`;
    else pageSize = value;
  }

  if (page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize) + 1) fieldErrors.page = "Page is too large.";
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return { fieldErrors, query: { q, status, itPriority, assignment, sort, page, pageSize } };
}

function buildWhere(query: QueueQuery, actorId: number): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (query.q) {
    where.OR = [
      { ticketNumber: { contains: query.q, mode: "insensitive" } },
      { summary: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.status) where.currentStatus = query.status;
  if (query.itPriority) where.itPriority = query.itPriority;
  if (query.assignment === "unassigned") where.assignedStaffId = null;
  if (query.assignment === "mine") where.assignedStaffId = actorId;
  if (query.assignment === "assigned") where.assignedStaffId = { not: null };
  return where;
}

function orderBy(sort: QueueSort): Array<Record<string, string>> {
  if (sort === "priorityDesc") return [{ itPriority: "desc" }, { updatedAt: "desc" }, { id: "desc" }];
  if (sort === "statusAsc") return [{ currentStatus: "asc" }, { updatedAt: "desc" }, { id: "desc" }];
  return [{ updatedAt: "desc" }, { id: "desc" }];
}

function serialise(row: Record<string, unknown>): Record<string, unknown> {
  const requester = row.requester as Record<string, unknown> | null | undefined;
  const assignedStaff = row.assignedStaff as Record<string, unknown> | null | undefined;
  return {
    ticketNumber: row.ticketNumber,
    summary: row.summary,
    requester: requester ? { id: requester.id, name: requester.name } : null,
    itPriority: row.itPriority ?? null,
    currentStatus: row.currentStatus,
    assignedStaff: assignedStaff ? { id: assignedStaff.id, name: assignedStaff.name } : null,
    updatedAt: row.updatedAt,
  };
}

/** Register the read-only IT Staff/Admin queue. Mutating workflow operations belong to L3-06. */
export function registerStaffQueueRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma as unknown as PrismaProvider,
  authorizationMiddleware: RequestHandler = createStaffAuthMiddleware(),
): void {
  app.get("/api/staff/tickets", authorizationMiddleware, async (req, res) => {
    const parsed = parseQueueQuery(req.query as Record<string, unknown>);
    if (!parsed.query) {
      validation(res, parsed.fieldErrors);
      return;
    }
    const actorId = req.auth?.user.id;
    if (!actorId) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required." } });
      return;
    }
    const where = buildWhere(parsed.query, actorId);
    const skip = (parsed.query.page - 1) * parsed.query.pageSize;
    try {
      const prisma = prismaProvider();
      const [rows, total] = await Promise.all([
        prisma.ticket.findMany({ where, orderBy: orderBy(parsed.query.sort), skip, take: parsed.query.pageSize, select: QUEUE_SELECT }),
        prisma.ticket.count({ where }),
      ]) as [unknown[], number];
      res.status(200).json({
        items: rows.map((row) => serialise(row as Record<string, unknown>)),
        page: parsed.query.page,
        pageSize: parsed.query.pageSize,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / parsed.query.pageSize),
      });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Unable to load staff Tickets." } });
    }
  });
}

export default registerStaffQueueRoutes;
