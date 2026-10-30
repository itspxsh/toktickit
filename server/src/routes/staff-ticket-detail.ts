import type { Express, RequestHandler, Response } from "express";
import { requireCsrf } from "../auth.js";
import { getPrisma } from "../prisma.js";
import { ActionRuleError } from "../lab-04/action-rules.js";
import { activeStaffTicketWhere } from "../lab-04/ticket-scope.js";
import { allowedTicketTransitions, assignTicket, claimTicket, resolutionBlockers, updateTicketPriority, updateTicketStatus, type ResolutionAction } from "../lab-04/workflow-service.js";
import type { CurrentStatus, ItPriority, PrismaClient } from "@prisma/client";

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
  resolvedAt: true,
  workflowVersion: true,
  updatedAt: true,
  requester: { select: { id: true, name: true, email: true } },
  assignedStaff: { select: { id: true, name: true, role: true } },
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
  statusEvents: {
    select: { id: true, fromStatus: true, toStatus: true, createdAt: true, actor: { select: { id: true, name: true, role: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  actions: { select: { state: true, result: true, followUpRequired: true } },
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

function validation(res: Response, code: string, message: string, fieldErrors?: Record<string, string>): void {
  res.status(400).json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } });
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
    resolvedAt: row.resolvedAt ?? null,
    workflowVersion: row.workflowVersion,
    appearsResolved: row.requesterResolvedAt !== null && row.requesterResolvedAt !== undefined,
    requester: row.requester ? { id: row.requester.id, name: row.requester.name, email: row.requester.email } : null,
    assignedStaff: row.assignedStaff ? { id: row.assignedStaff.id, name: row.assignedStaff.name, role: row.assignedStaff.role } : null,
    attachments: Array.isArray(row.attachments) ? row.attachments.map((item: any) => ({
      id: item.id, originalName: item.originalName, mimeType: item.mimeType, sizeBytes: item.sizeBytes,
      status: item.status, removedAt: item.removedAt ?? null, removalReason: item.removalReason ?? null, createdAt: item.createdAt,
    })) : [],
    publicComments: Array.isArray(row.publicComments) ? row.publicComments.map(safeEntry) : [],
    internalNotes: Array.isArray(row.internalNotes) ? row.internalNotes.map(safeEntry) : [],
    statusEvents: Array.isArray(row.statusEvents) ? row.statusEvents.map((event: any) => ({ id: event.id, fromStatus: event.fromStatus, toStatus: event.toStatus, createdAt: event.createdAt, actor: event.actor ? safePerson(event.actor) : null })) : [],
  };
}

function sendWorkflowError(res: Response, error: unknown): void {
  if (error instanceof ActionRuleError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}), ...(error.details ? { details: error.details } : {}) } });
    return;
  }
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

function workflowBody(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  const body = bodyObject(value);
  if (!body || Object.keys(body).some((key) => !allowed.includes(key))) return null;
  return body;
}

function positiveVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function bodyObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function plainText(value: unknown): value is string {
  return typeof value === "string" && !/[<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value);
}

async function loadTicket(prisma: StaffTicketDetailClient, number: string): Promise<any> {
  return prisma.ticket.findFirst({ where: { ticketNumber: number, ...activeStaffTicketWhere() }, select: DETAIL_SELECT });
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
      const user = req.auth?.user;
      const role = user?.role === "ADMIN" ? "ADMIN" : "IT_STAFF";
      const blockers = resolutionBlockers((row.actions ?? []) as ResolutionAction[]);
      const detail = serialiseDetail(row);
      res.status(200).json({ ticket: {
        ...detail,
        workflowVersion: row.workflowVersion,
        resolvedAt: row.resolvedAt?.toISOString?.() ?? null,
        allowedTransitions: allowedTicketTransitions(row.currentStatus, role),
        resolutionGate: { canResolve: blockers.length === 0, blockers },
      } });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.post("/api/staff/tickets/:ticketNumber/claim", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const current = actor(req);
    if (!current) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
    const body = workflowBody(req.body, ["expectedTicketVersion"]);
    if (!body || !positiveVersion(body.expectedTicketVersion)) return validation(res, "VALIDATION_ERROR", "expectedTicketVersion must be a positive integer.", { expectedTicketVersion: "Expected Ticket version must be a positive integer." });
    try {
      const result = await claimTicket(prismaProvider() as unknown as PrismaClient, req, { ticketNumber: number, actorId: current.id, role: current.role, expectedTicketVersion: body.expectedTicketVersion });
      res.status(200).json({ assignedStaff: result.assignedStaff, ticketVersion: result.workflow.ticketVersion });
    } catch (error) {
      sendWorkflowError(res, error);
    }
  });

  app.patch("/api/staff/tickets/:ticketNumber/assignment", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const rawBody = bodyObject(req.body);
    const expectedTicketVersion = rawBody?.expectedTicketVersion;
    if (!positiveVersion(expectedTicketVersion)) return validation(res, "VALIDATION_ERROR", "expectedTicketVersion must be a positive integer.", { expectedTicketVersion: "Expected Ticket version must be a positive integer." });
    const body = workflowBody(rawBody, ["expectedTicketVersion", "assignedStaffId"]);
    if (!body) return validation(res, "VALIDATION_ERROR", "Request contains invalid workflow fields.");
    if (!(body.assignedStaffId === null || (typeof body.assignedStaffId === "number" && Number.isSafeInteger(body.assignedStaffId) && body.assignedStaffId > 0))) {
      return validation(res, "VALIDATION_ERROR", "assignedStaffId must be a positive integer or null.", { assignedStaffId: "Choose an active IT Staff or Administrator." });
    }
    try {
      const current = actor(req);
      if (!current) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
      const result = await assignTicket(prismaProvider() as unknown as PrismaClient, req, { ticketNumber: number, assignedStaffId: body.assignedStaffId as number | null, role: current.role, expectedTicketVersion });
      res.status(200).json({ assignedStaff: result.assignedStaff, ticketVersion: result.workflow.ticketVersion });
    } catch (error) {
      sendWorkflowError(res, error);
    }
  });

  app.patch("/api/staff/tickets/:ticketNumber/priority", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const rawBody = bodyObject(req.body);
    const expectedTicketVersion = rawBody?.expectedTicketVersion;
    if (!positiveVersion(expectedTicketVersion)) return validation(res, "VALIDATION_ERROR", "expectedTicketVersion must be a positive integer.", { expectedTicketVersion: "Expected Ticket version must be a positive integer." });
    const body = workflowBody(rawBody, ["expectedTicketVersion", "itPriority"]);
    if (!body) return validation(res, "VALIDATION_ERROR", "Request contains invalid workflow fields.");
    if (typeof body.itPriority !== "string" || !PRIORITIES.has(body.itPriority)) return validation(res, "INVALID_IT_PRIORITY", "itPriority must be LOW, MEDIUM, HIGH, or URGENT.");
    try {
      const current = actor(req);
      if (!current) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
      const result = await updateTicketPriority(prismaProvider() as unknown as PrismaClient, req, { ticketNumber: number, itPriority: body.itPriority as ItPriority, role: current.role, expectedTicketVersion });
      res.status(200).json({ itPriority: result.itPriority, ticketVersion: result.workflow.ticketVersion });
    } catch (error) {
      sendWorkflowError(res, error);
    }
  });

  app.patch("/api/staff/tickets/:ticketNumber/status", authorizationMiddleware, csrfMiddleware, async (req, res) => {
    const number = ticketNumber(req, res);
    if (!number) return;
    const rawBody = bodyObject(req.body);
    const expectedTicketVersion = rawBody?.expectedTicketVersion;
    if (!positiveVersion(expectedTicketVersion)) return validation(res, "VALIDATION_ERROR", "expectedTicketVersion must be a positive integer.", { expectedTicketVersion: "Expected Ticket version must be a positive integer." });
    const body = workflowBody(rawBody, ["expectedTicketVersion", "currentStatus", "confirm"]);
    if (!body) return validation(res, "VALIDATION_ERROR", "Request contains invalid workflow fields.");
    if (typeof body.currentStatus !== "string" || !STATUSES.has(body.currentStatus) || ("confirm" in body && typeof body.confirm !== "boolean")) return validation(res, "INVALID_STATUS_TRANSITION", "A valid currentStatus is required.");
    try {
      const current = actor(req);
      if (!current) return res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
      const result = await updateTicketStatus(prismaProvider() as unknown as PrismaClient, req, { ticketNumber: number, currentStatus: body.currentStatus as CurrentStatus, confirm: body.confirm as boolean | undefined, role: current.role, actorId: current.id, expectedTicketVersion });
      res.status(200).json(result);
    } catch (error) {
      sendWorkflowError(res, error);
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
