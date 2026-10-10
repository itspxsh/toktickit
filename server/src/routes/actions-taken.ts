import type { Express, Request, RequestHandler, Response } from "express";
import type { ActionState, PrismaClient } from "@prisma/client";
import { requireCsrf } from "../auth.js";
import { createRequesterAuthMiddleware, createStaffAuthMiddleware } from "../authorization.js";
import { getPrisma } from "../prisma.js";
import {
  ACTION_STATES,
  ActionRuleError,
  assertNoUnknownKeys,
  assertVersions,
  isPositiveInteger,
  isPlainText,
  isUuid,
  parseActionContent,
  validateActionContent,
  type ActionContent,
} from "../lab-04/action-rules.js";
import { createAction, listActions, transitionAction, updateAction } from "../lab-04/action-service.js";
import { findAuthorizedTicket, parseIdentifier, parseTicketNumber } from "../lab-04/ticket-scope.js";

type Provider = () => PrismaClient;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActionRuleError(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

function pagination(req: Request, allowFocusAction = true): { page: number; pageSize: number; focusActionId?: number; explicitPage: boolean } {
  const allowed = new Set(allowFocusAction ? ["page", "pageSize", "focusActionId"] : ["page", "pageSize"]);
  if (Object.keys(req.query).some((key) => !allowed.has(key))) throw new ActionRuleError(400, "VALIDATION_ERROR", "Unknown Action query parameter.");
  const parse = (raw: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER): number => {
    if (raw === undefined) return fallback;
    if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) throw new ActionRuleError(400, "VALIDATION_ERROR", "Pagination query is invalid.");
    const value = Number(raw);
    if (!isPositiveInteger(value) || value > max) throw new ActionRuleError(400, "VALIDATION_ERROR", "Pagination query is outside the supported range.");
    return value;
  };
  const page = parse(req.query.page, 1);
  const pageSize = parse(req.query.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if (page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize) + 1) throw new ActionRuleError(400, "VALIDATION_ERROR", "page is too large.");
  let focusActionId: number | undefined;
  if (req.query.focusActionId !== undefined) {
    if (typeof req.query.focusActionId !== "string" || !/^[1-9]\d*$/.test(req.query.focusActionId)) throw new ActionRuleError(400, "INVALID_IDENTIFIER", "focusActionId must be a positive integer.");
    focusActionId = Number(req.query.focusActionId);
    if (!Number.isSafeInteger(focusActionId)) throw new ActionRuleError(400, "INVALID_IDENTIFIER", "focusActionId must be a positive integer.");
  }
  return { page, pageSize, focusActionId, explicitPage: req.query.page !== undefined };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof ActionRuleError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}) } });
    return;
  }
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
}

function actor(req: Request): number {
  const id = req.auth?.user.id;
  if (!isPositiveInteger(id)) throw new ActionRuleError(401, "UNAUTHENTICATED", "Authentication is required.");
  return id;
}

function parseCreate(body: Record<string, unknown>): {
  clientRequestId: string;
  expectedTicketVersion: number;
  assigneeId: number;
  content: ActionContent;
} {
  assertNoUnknownKeys(body, ["clientRequestId", "expectedTicketVersion", "assigneeId", "description", "result", "followUpRequired", "followUpNote", "attachmentNotes"]);
  assertVersions(body.expectedTicketVersion);
  if (!isUuid(body.clientRequestId)) throw new ActionRuleError(400, "VALIDATION_ERROR", "clientRequestId must be a UUID.", { clientRequestId: "Enter a valid UUID." });
  if (!isPositiveInteger(body.assigneeId)) throw new ActionRuleError(400, "VALIDATION_ERROR", "assigneeId must be a positive integer.", { assigneeId: "Choose an active support user." });
  const parsed = parseActionContent({
    ...body,
    result: body.result ?? "",
    followUpNote: body.followUpNote ?? "",
    attachmentNotes: body.attachmentNotes ?? "",
  });
  const content: ActionContent = {
    description: parsed.description!,
    result: parsed.result ?? "",
    followUpRequired: parsed.followUpRequired!,
    followUpNote: parsed.followUpNote ?? "",
    attachmentNotes: parsed.attachmentNotes ?? "",
  };
  validateActionContent(content);
  return { clientRequestId: body.clientRequestId, expectedTicketVersion: body.expectedTicketVersion, assigneeId: body.assigneeId, content };
}

function parsePatch(body: Record<string, unknown>): {
  expectedTicketVersion: number;
  expectedVersion: number;
  changes: Partial<ActionContent> & { assigneeId?: number };
} {
  const editable = ["description", "result", "followUpRequired", "followUpNote", "attachmentNotes", "assigneeId"] as const;
  assertNoUnknownKeys(body, ["expectedTicketVersion", "expectedVersion", ...editable]);
  assertVersions(body.expectedTicketVersion, body.expectedVersion);
  if (!editable.some((field) => field in body)) throw new ActionRuleError(400, "VALIDATION_ERROR", "At least one editable Action field is required.");
  const changes = parseActionContent(body, true) as Partial<ActionContent>;
  if ("assigneeId" in body) {
    if (!isPositiveInteger(body.assigneeId)) throw new ActionRuleError(400, "VALIDATION_ERROR", "assigneeId must be a positive integer.", { assigneeId: "Choose an active support user." });
    return { expectedTicketVersion: body.expectedTicketVersion as number, expectedVersion: body.expectedVersion as number, changes: { ...changes, assigneeId: body.assigneeId } };
  }
  return { expectedTicketVersion: body.expectedTicketVersion as number, expectedVersion: body.expectedVersion as number, changes };
}

function parseTransition(body: Record<string, unknown>): {
  expectedTicketVersion: number;
  expectedVersion: number;
  state: ActionState;
  confirm?: boolean;
  reason?: string;
  result?: string;
  followUpRequired?: boolean;
  followUpNote?: string;
} {
  const common = ["expectedTicketVersion", "expectedVersion", "state"];
  if (typeof body.state !== "string" || !(ACTION_STATES as readonly string[]).includes(body.state)) throw new ActionRuleError(400, "VALIDATION_ERROR", "state is invalid.", { state: "Choose a valid Action state." });
  const state = body.state as ActionState;
  const allowed = state === "CANCELLED" ? [...common, "confirm", "reason"] : state === "COMPLETED" ? [...common, "confirm", "result", "followUpRequired", "followUpNote"] : common;
  assertNoUnknownKeys(body, allowed);
  assertVersions(body.expectedTicketVersion, body.expectedVersion);
  if ("confirm" in body && typeof body.confirm !== "boolean") throw new ActionRuleError(400, "VALIDATION_ERROR", "confirm must be a boolean.");
  const parsed: ReturnType<typeof parseTransition> = {
    expectedTicketVersion: body.expectedTicketVersion as number,
    expectedVersion: body.expectedVersion as number,
    state,
    ...(body.confirm !== undefined ? { confirm: body.confirm as boolean } : {}),
  };
  if (state === "CANCELLED") {
    if (!isPlainText(body.reason)) throw new ActionRuleError(400, "VALIDATION_ERROR", "A plain-text cancellation reason is required.", { reason: "Enter a plain-text reason." });
    parsed.reason = body.reason;
  }
  if (state === "COMPLETED") {
    if (body.result !== undefined) {
      if (!isPlainText(body.result)) throw new ActionRuleError(400, "VALIDATION_ERROR", "result must be plain text.", { result: "Use plain text." });
      parsed.result = body.result.trim();
    }
    if (body.followUpRequired !== undefined) {
      if (typeof body.followUpRequired !== "boolean") throw new ActionRuleError(400, "VALIDATION_ERROR", "followUpRequired must be a boolean.", { followUpRequired: "Use true or false." });
      parsed.followUpRequired = body.followUpRequired;
    }
    if (body.followUpNote !== undefined) {
      if (!isPlainText(body.followUpNote)) throw new ActionRuleError(400, "VALIDATION_ERROR", "followUpNote must be plain text.", { followUpNote: "Use plain text." });
      parsed.followUpNote = body.followUpNote.trim();
    }
  }
  return parsed;
}

export function registerActionsTakenRoutes(
  app: Express,
  provider: Provider = getPrisma,
  requesterAuthorization: RequestHandler = createRequesterAuthMiddleware(),
  staffAuthorization: RequestHandler = createStaffAuthMiddleware(),
  csrfMiddleware: RequestHandler = requireCsrf,
): void {
  const registerRead = (path: string, authorization: RequestHandler, audience: "requester" | "staff") => {
    app.get(path, authorization, async (req, res) => {
      try {
        const number = parseTicketNumber(req.params.ticketNumber);
        const { page, pageSize, focusActionId, explicitPage } = pagination(req);
        const prisma = provider();
        const ticket = await findAuthorizedTicket(prisma, req, number, audience);
        if (!ticket) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
        const result = await listActions(prisma, { req, ticket, ticketNumber: number, actorId: actor(req) }, page, pageSize, { focusActionId, explicitPage });
        res.status(200).json(result);
      } catch (error) { sendError(res, error); }
    });
  };
  registerRead("/api/tickets/:ticketNumber/actions", requesterAuthorization, "requester");
  registerRead("/api/staff/tickets/:ticketNumber/actions", staffAuthorization, "staff");

  app.get("/api/staff/tickets/:ticketNumber/actions/:actionId/revisions", staffAuthorization, async (req, res) => {
    try {
      const number = parseTicketNumber(req.params.ticketNumber);
      const actionId = parseIdentifier(req.params.actionId, "actionId");
      const { page, pageSize } = pagination(req, false);
      const prisma = provider();
      const ticket = await findAuthorizedTicket(prisma, req, number, "staff");
      if (!ticket) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
      const { ticketVersion: _ticketVersion, ...result } = await listActions(prisma, { req, ticket, ticketNumber: number, actorId: actor(req) }, page, pageSize, { revisionsActionId: actionId });
      res.status(200).json(result);
    } catch (error) { sendError(res, error); }
  });

  app.post("/api/staff/tickets/:ticketNumber/actions", staffAuthorization, csrfMiddleware, async (req, res) => {
    try {
      const number = parseTicketNumber(req.params.ticketNumber);
      const input = parseCreate(bodyObject(req.body));
      const prisma = provider();
      const ticket = await findAuthorizedTicket(prisma, req, number, "staff");
      if (!ticket) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
      const result = await createAction(prisma, { req, ticket, ticketNumber: number, actorId: actor(req) }, input);
      res.status(result.replay ? 200 : 201).json({ action: result.action, ticketVersion: result.ticketVersion });
    } catch (error) { sendError(res, error); }
  });

  app.patch("/api/staff/tickets/:ticketNumber/actions/:actionId", staffAuthorization, csrfMiddleware, async (req, res) => {
    try {
      const number = parseTicketNumber(req.params.ticketNumber);
      const actionId = parseIdentifier(req.params.actionId, "actionId");
      const input = parsePatch(bodyObject(req.body));
      const prisma = provider();
      const ticket = await findAuthorizedTicket(prisma, req, number, "staff");
      if (!ticket) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
      const result = await updateAction(prisma, { req, ticket, ticketNumber: number, actorId: actor(req) }, actionId, input);
      res.status(200).json({ action: result.action, ticketVersion: result.ticketVersion });
    } catch (error) { sendError(res, error); }
  });

  app.post("/api/staff/tickets/:ticketNumber/actions/:actionId/transitions", staffAuthorization, csrfMiddleware, async (req, res) => {
    try {
      const number = parseTicketNumber(req.params.ticketNumber);
      const actionId = parseIdentifier(req.params.actionId, "actionId");
      const input = parseTransition(bodyObject(req.body));
      const prisma = provider();
      const ticket = await findAuthorizedTicket(prisma, req, number, "staff");
      if (!ticket) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
      const result = await transitionAction(prisma, { req, ticket, ticketNumber: number, actorId: actor(req) }, actionId, input);
      res.status(200).json(result);
    } catch (error) { sendError(res, error); }
  });
}
