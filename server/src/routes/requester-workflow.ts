import type { Express, Request, RequestHandler, Response } from "express";
import { requireCsrf } from "../auth.js";
import { getPrisma } from "../prisma.js";
import { roleAllowed } from "../authorization.js";

type WorkflowModel = {
  findFirst(args: unknown): Promise<unknown>;
  findUnique(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
};

interface WorkflowClient {
  ticket: WorkflowModel;
  requester: Pick<WorkflowModel, "findUnique">;
  publicComment: Pick<WorkflowModel, "create">;
}

type PrismaProvider = () => WorkflowClient;
const TICKET_NUMBER_PATTERN = /^TKT-\d{4}-\d{6}$/;

function invalidTicketNumber(res: Response): void {
  res.status(400).json({ error: { code: "INVALID_TICKET_NUMBER", message: "Ticket Number must match TKT-YYYY-NNNNNN." } });
}

function validTicketNumber(req: Request, res: Response): string | null {
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

function validation(res: Response, message: string): void {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: "FORBIDDEN", message: "You are not allowed to perform this action." } });
}

function safeComment(row: Record<string, unknown>): Record<string, unknown> {
  const author = row.author as Record<string, unknown> | undefined;
  return {
    id: row.id,
    author: author ? { id: author.id, name: author.name, role: author.role } : undefined,
    body: row.body,
    createdAt: row.createdAt,
  };
}

/** Requester indication and authenticated public-comment boundaries. */
export function registerRequesterWorkflowRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma as unknown as PrismaProvider,
  authenticatedMiddleware?: RequestHandler,
): void {
  const authenticated = authenticatedMiddleware ? [authenticatedMiddleware] : [];

  app.post("/api/tickets/:ticketNumber/resolution-indication", ...authenticated, requireCsrf, async (req, res) => {
    if (!req.auth || !roleAllowed(req.auth.user.role, ["REQUESTER"])) {
      forbidden(res);
      return;
    }
    const ticketNumber = validTicketNumber(req, res);
    if (!ticketNumber) return;
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    if (typeof body.appearsResolved !== "boolean") {
      validation(res, "appearsResolved must be a boolean.");
      return;
    }
    try {
      const prisma = prismaProvider();
      const ticket = await prisma.ticket.findFirst({
        where: { ticketNumber, requesterUserId: req.auth.user.id, requester: { isActive: true } },
        select: { id: true, ticketNumber: true },
      }) as { id: number; ticketNumber: string } | null;
      if (!ticket) {
        notFound(res);
        return;
      }
      await prisma.ticket.update({
        where: { id: ticket.id },
        data: { requesterResolvedAt: body.appearsResolved ? new Date() : null },
      });
      res.status(200).json({ ticketNumber: ticket.ticketNumber, appearsResolved: body.appearsResolved });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });

  app.post("/api/tickets/:ticketNumber/comments", ...authenticated, requireCsrf, async (req, res) => {
    if (!req.auth || !roleAllowed(req.auth.user.role, ["REQUESTER", "IT_STAFF", "ADMIN"])) {
      forbidden(res);
      return;
    }
    const ticketNumber = validTicketNumber(req, res);
    if (!ticketNumber) return;
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body as Record<string, unknown>
      : {};
    const keys = Object.keys(body);
    if (keys.some((key) => key !== "body") || typeof body.body !== "string") {
      validation(res, "Only a body field is accepted.");
      return;
    }
    const commentBody = body.body.trim();
    if (commentBody.length < 1 || commentBody.length > 2_000) {
      validation(res, "Comment body must contain 1-2,000 characters.");
      return;
    }
    try {
      const prisma = prismaProvider();
      const where = req.auth.user.role === "REQUESTER"
        ? { ticketNumber, requesterUserId: req.auth.user.id, requester: { isActive: true } }
        : { ticketNumber };
      const ticket = await prisma.ticket.findFirst({ where, select: { id: true } }) as { id: number } | null;
      if (!ticket) {
        notFound(res);
        return;
      }
      const created = await prisma.publicComment.create({
        data: { ticketId: ticket.id, authorUserId: req.auth.user.id, body: commentBody },
        include: { author: { select: { id: true, name: true, role: true } } },
      }) as Record<string, unknown>;
      res.status(201).json({ comment: safeComment(created) });
    } catch {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong." } });
    }
  });
}

export default registerRequesterWorkflowRoutes;
