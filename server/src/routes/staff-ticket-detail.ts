import type { Express, RequestHandler, Response } from "express";
import { requireCsrf } from "../auth.js";
import { getPrisma } from "../prisma.js";

type Model = {
  findFirst(args: unknown): Promise<any>;
  update(args: unknown): Promise<any>;
  updateMany(args: unknown): Promise<{ count: number }>;
  create(args: unknown): Promise<any>;
};

interface StaffTicketDetailClient {
  ticket: Pick<Model, "findFirst" | "update" | "updateMany">;
  user: Pick<Model, "findFirst">;
  publicComment: Pick<Model, "create">;
  internalNote: Pick<Model, "create">;
}

type PrismaProvider = () => StaffTicketDetailClient;
type AuthRole = "REQUESTER" | "IT_STAFF" | "ADMIN";

const TICKET_NUMBER_PATTERN = /^TKT-\d{4}-\d{6}$/;
const STATUSES = new Set(["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"]);
const PRIORITIES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const TRANSITIONS: Record<string, Set<string>> = {
  NEW: new Set(["OPEN", "IN_PROGRESS", "CANCELLED"]),
  OPEN: new Set(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]),
  IN_PROGRESS: new Set(["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]),
  WAITING_FOR_REQUESTER: new Set(["OPEN", "IN_PROGRESS", "RESOLVED"]),
  RESOLVED: new Set(["CLOSED", "REOPENED"]),
  CLOSED: new Set(["REOPENED"]),
  REOPENED: new Set(["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"]),
  CANCELLED: new Set(["REOPENED"]),
};

const DETAIL_SELECT = {
  id: true,
  ticketNumber: true,
  summary: true,
  description: true,
  ticketDate: true,
  requestedPriority: true,
  itPriority: true,
  currentStatus: true,
  requesterResolvedAt: true,
  updatedAt: true,
  requester: { select: { id: true, name: true, email: true } },
  assignedStaff: { select: { id: true, name: true } },
  attachments: {
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, status: true, removedAt: true, removalReason: true, createdAt: true },
    where: { status: "ACTIVE" },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  },
  publicComments: {
    select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true, role: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  internalNotes: {
    select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true, role: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
};

function invalidTicketNumber(res: Response): void {
  res.status(400).json({ error: { code: "INVALID_TICKET_NUMBER", message: "Ticket Number must match TKT-YYYY-NNNNNN." } });
}

function ticketNumber(req: Parameters<RequestHandler>[0], res: Response): string | null {
  const value = req.params.ticketNumber?.trim();
  if (!value || !TICKET_NUMBER_PATTERN.test(value)) {
    invalidTicketNumber(res);
    return null;
  }
  return value;
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: "TICKET_NOT_FOUND", message: "Ticket was not found." } });
}

function validation(res: Response, code: string, message: string): void {
  res.status(400).json({ error: { code, message } });
}

function conflict(res: Response, code: string, message: string): void {
  res.status(409).json({ error: { code, message } });
}

function safePerson(row: any): Record<string, unknown> {
  return { id: row.id, name: row.name, ...(row.role ? { role: row.role } : {}) };
}

function safeEntry(row: any): Record<string, unknown> {
  return { id: row.id, author: row.author ? safePerson(row.author) : undefined, body: row.body, createdAt: row.createdAt };
}

function serialiseDetail(row: any): Record<string, unknown> {
  return {
    ticketNumber: row.ticketNumber,
    summary: row.summary,
    description: row.description,
    ticketDate: row.ticketDate,
    requestedPriority: row.requestedPriority,
    itPriority: row.itPriority ?? null,
    currentStatus: row.currentStatus,
    appearsResolved: row.requesterResolvedAt !== null && row.requesterResolvedAt !== undefined,
    requester: row.requester ? { id: row.requester.id, name: row.requester.name, email: row.requester.email } : null,
    assignedStaff: row.assignedStaff ? { id: row.assignedStaff.id, name: row.assignedStaff.name } : null,
    attachments: Array.isArray(row.attachments) ? row.attachments.map((item: any) => ({
      id: item.id, originalName: item.originalName, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
      status: item.status, removedAt: item.removedAt ?? null, removalReason: item.removalReason ?? null, createdAt: item.createdAt,
    })) : [],
    publicComments: Array.isArray(row.publicComments) ? row.publicComments.map(safeEntry) : [],
    internalNotes: Array.isArray(row.internalNotes) ? row.internalNotes.map(safeEntry) : [],
  };
}

function bodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function plainText(value: unknown): value is string {
  return typeof value === "string" && !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

async function loadTicket(prisma: StaffTicketDetailClient, number: string): Promise<any> {
  return prisma.ticket.findFirst({ where: { ticketNumber: number, requester: { isActive: true } }, select: DETAIL_SELECT });
}

function actor(req: Parameters<RequestHandler>[0]): { id: number; role: AuthRole } | null {
  const user = req.auth?.user;
  return user && typeof user.id === "number" && (user.role === "IT_STAFF" || user.role === "ADMIN")
    ? { id: user.id, role: user.role } : null;
}

/** Staff/Admin ticket detail, workflow, and internal-note routes. */
export function registerStaffTicketDetailRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma as unknown as PrismaProvider,
  authorizationMiddleware: RequestHandler,
  csrfMiddleware: RequestHandler = requireCsrf,
): void {
  app.get("/api/staff/tickets/:ticketNumber", authorizationMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    try {
      const row = await loadTicket(prismaProvider(), number);
      if (!row) return notFound(res);
      res.status(200).json({ ticket: serialiseDetail(row) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.post("/api/staff/tickets/:ticketNumber/claim", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const current = actor(req);
    if (!current || current.role !== "IT_STAFF") return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
    const body = bodyObject(req.body);
    if (body && Object.keys(body).length > 0) return validation(res, "VALIDATION_ERROR", "Claim accepts an empty JSON body.");
    try {
      const prisma = prismaProvider();
      const row = await prisma.ticket.findFirst({ where: { ticketNumber: number, requester: { isActive: true } }, select: { id: true, ticketNumber: true } });
      if (!row) return notFound(res);
      const result = await prisma.ticket.updateMany({ where: { id: row.id, assignedStaffId: null }, data: { assignedStaffId: current.id } });
      if (result.count !== 1) return conflict(res, "TICKET_ALREADY_ASSIGNED", "Ticket is already assigned.");
      res.status(200).json({ assignedStaff: { id: current.id, name: req.auth?.user.name } });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.patch("/api/staff/tickets/:ticketNumber/assignment", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const body = bodyObject(req.body);
    if (!body || Object.keys(body).length !== 1 || typeof body.assignedStaffId !== "number" || !Number.isSafeInteger(body.assignedStaffId) || body.assignedStaffId < 1) {
      return validation(res, "INVALID_ASSIGNMENT", "assignedStaffId must be a positive integer.");
    }
    try {
      const prisma = prismaProvider();
      const target = await prisma.user.findFirst({ where: { id: body.assignedStaffId, role: "IT_STAFF", isActive: true }, select: { id: true, name: true } });
      if (!target) return validation(res, "INVALID_ASSIGNMENT", "Assignment target must be an active IT Staff user.");
      const row = await loadTicket(prisma, number);
      if (!row) return notFound(res);
      const result = await prisma.ticket.updateMany({ where: { id: row.id }, data: { assignedStaffId: target.id } });
      if (result.count !== 1) return conflict(res, "CONFLICT", "Ticket assignment changed; refresh and retry.");
      res.status(200).json({ assignedStaff: target });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.patch("/api/staff/tickets/:ticketNumber/priority", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const body = bodyObject(req.body);
    if (!body || Object.keys(body).length !== 1 || typeof body.itPriority !== "string" || !PRIORITIES.has(body.itPriority)) return validation(res, "INVALID_IT_PRIORITY", "itPriority must be LOW, MEDIUM, HIGH, or URGENT.");
    try {
      const prisma = prismaProvider();
      const row = await loadTicket(prisma, number);
      if (!row) return notFound(res);
      const updated = await prisma.ticket.update({ where: { id: row.id }, data: { itPriority: body.itPriority }, select: { itPriority: true } });
      res.status(200).json({ itPriority: updated.itPriority });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.patch("/api/staff/tickets/:ticketNumber/status", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const body = bodyObject(req.body);
    if (!body || Object.keys(body).some((key) => !["currentStatus", "confirm"].includes(key)) || typeof body.currentStatus !== "string" || !STATUSES.has(body.currentStatus)) return validation(res, "INVALID_STATUS_TRANSITION", "currentStatus is invalid.");
    if ((body.currentStatus === "CLOSED" || body.currentStatus === "CANCELLED") && body.confirm !== true) return conflict(res, "CONFIRMATION_REQUIRED", "This status change requires explicit confirmation.");
    try {
      const prisma = prismaProvider();
      const row = await loadTicket(prisma, number);
      if (!row) return notFound(res);
      if (!TRANSITIONS[row.currentStatus]?.has(body.currentStatus)) return validation(res, "INVALID_STATUS_TRANSITION", "The requested status transition is not allowed.");
      const current = actor(req);
      if (row.currentStatus === "CANCELLED" && body.currentStatus === "REOPENED" && current?.role !== "ADMIN") {
        return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
      }
      const result = await prisma.ticket.updateMany({ where: { id: row.id, currentStatus: row.currentStatus }, data: { currentStatus: body.currentStatus } });
      if (result.count !== 1) return conflict(res, "CONFLICT", "Ticket status changed; refresh and retry.");
      res.status(200).json({ currentStatus: body.currentStatus });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.post("/api/staff/tickets/:ticketNumber/internal-notes", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const body = bodyObject(req.body);
    if (!body || Object.keys(body).length !== 1 || !plainText(body.body)) return validation(res, "VALIDATION_ERROR", "Only a plain-text body field is accepted.");
    const text = body.body.trim();
    if (!text || text.length > 2_000) return validation(res, "VALIDATION_ERROR", "Note body must contain 1-2,000 characters.");
    try {
      const prisma = prismaProvider();
      const row = await loadTicket(prisma, number);
      if (!row) return notFound(res);
      const created = await prisma.internalNote.create({ data: { ticketId: row.id, authorUserId: req.auth?.user.id, body: text }, include: { author: { select: { id: true, name: true, role: true } } } });
      res.status(201).json({ note: safeEntry(created) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });
}

export default registerStaffTicketDetailRoutes;
