import type { Express, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { allocateTicketNumber, type TicketSequenceClient } from "../ticket-number.js";

type Model = {
  findUnique(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
};

export interface TicketRouteClient extends TicketSequenceClient {
  requester: Pick<Model, "findUnique">;
  category: Pick<Model, "findUnique">;
  relatedSystem: Pick<Model, "findUnique">;
  ticket: Model;
}

type PrismaProvider = () => TicketRouteClient;
type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

const PRIORITIES = new Set<RequestedPriority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_INCLUDE = {
  requester: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
};

interface CreateInput {
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  requestedPriority: RequestedPriority;
  description: string;
}

interface ParsedInput {
  input?: CreateInput;
  fieldErrors: Record<string, string>;
}

function parsePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function parseCreateInput(body: unknown): ParsedInput {
  const fieldErrors: Record<string, string> = {};
  const value = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};

  const categoryId = value.categoryId;
  if (!parsePositiveInteger(categoryId)) fieldErrors.categoryId = "Category must be a positive integer.";

  const relatedSystemId = value.relatedSystemId;
  if (!parsePositiveInteger(relatedSystemId)) {
    fieldErrors.relatedSystemId = "Related System must be a positive integer.";
  }

  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (summary.length < 5 || summary.length > 120) {
    fieldErrors.summary = "Summary must contain 5-120 characters.";
  }

  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length < 10 || description.length > 2_000) {
    fieldErrors.description = "Description must contain 10-2,000 characters.";
  }

  const requestedPriority = value.requestedPriority;
  if (typeof requestedPriority !== "string" || !PRIORITIES.has(requestedPriority as RequestedPriority)) {
    fieldErrors.requestedPriority = "Requested Priority must be LOW, MEDIUM, HIGH, or URGENT.";
  }

  for (const generatedField of ["ticketNumber", "ticketDate", "ticketSequence", "currentStatus", "itPriority"]) {
    if (generatedField in value) {
      fieldErrors[generatedField] = "System-generated fields cannot be supplied.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    fieldErrors,
    input: {
      categoryId: categoryId as number,
      relatedSystemId: relatedSystemId as number,
      summary,
      requestedPriority: requestedPriority as RequestedPriority,
      description,
    },
  };
}

function parseRequesterId(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

function createFingerprint(requesterId: number, input: CreateInput): string {
  return JSON.stringify({ requesterId, ...input });
}

function rowFingerprint(row: Record<string, unknown>): string | null {
  if (
    typeof row.requesterId !== "number" ||
    typeof row.categoryId !== "number" ||
    typeof row.relatedSystemId !== "number" ||
    typeof row.summary !== "string" ||
    typeof row.description !== "string" ||
    typeof row.requestedPriority !== "string"
  ) return null;
  return JSON.stringify({
    requesterId: row.requesterId,
    categoryId: row.categoryId,
    relatedSystemId: row.relatedSystemId,
    summary: row.summary,
    requestedPriority: row.requestedPriority,
    description: row.description,
  });
}

function serialiseTicket(row: Record<string, unknown>): Record<string, unknown> {
  const requester = row.requester as Record<string, unknown> | undefined;
  const category = row.category as Record<string, unknown> | undefined;
  const relatedSystem = row.relatedSystem as Record<string, unknown> | undefined;
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    ticketDate: row.ticketDate,
    requester: requester ? { id: requester.id, name: requester.name } : undefined,
    category: category ? { id: category.id, name: category.name } : undefined,
    relatedSystem: relatedSystem ? { id: relatedSystem.id, name: relatedSystem.name } : undefined,
    summary: row.summary,
    requestedPriority: row.requestedPriority,
    description: row.description,
    itPriority: row.itPriority ?? null,
    currentStatus: row.currentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sendValidation(res: Response, fieldErrors: Record<string, string>): void {
  res.status(422).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Please correct the highlighted fields.",
      fieldErrors,
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

/** Register requester-scoped Ticket creation with the Lab 2 contract. */
export function registerTicketRoutes(
  app: Express,
  prismaProvider: PrismaProvider = getPrisma as unknown as PrismaProvider,
): void {
  app.post("/api/tickets", async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }

    const rawIdempotencyKey = req.header("Idempotency-Key")?.trim();
    if (!isUuid(rawIdempotencyKey)) {
      res.status(400).json({
        error: { code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency-Key must be a UUID." },
      });
      return;
    }
    const idempotencyKey = rawIdempotencyKey.toLowerCase();

    const parsed = parseCreateInput(req.body);
    if (!parsed.input) {
      sendValidation(res, parsed.fieldErrors);
      return;
    }

    const prisma = prismaProvider();
    try {
      const requester = await prisma.requester.findUnique({
        where: { id: requesterId },
        select: { id: true, name: true, isActive: true },
      }) as Record<string, unknown> | null;
      if (!requester) {
        res.status(404).json({ error: { code: "REQUESTER_NOT_FOUND", message: "Development Requester was not found." } });
        return;
      }
      if (requester.isActive !== true) {
        res.status(403).json({ error: { code: "REQUESTER_INACTIVE", message: "Development Requester is inactive." } });
        return;
      }

      const fingerprint = createFingerprint(requesterId, parsed.input);
      const existing = await prisma.ticket.findUnique({
        where: { clientRequestId: idempotencyKey },
        include: TICKET_INCLUDE,
      }) as Record<string, unknown> | null;
      if (existing) {
        if (rowFingerprint(existing) !== fingerprint) {
          res.status(409).json({
            error: { code: "IDEMPOTENCY_CONFLICT", message: "Idempotency-Key was already used with different data." },
          });
          return;
        }
        res.status(200).json({ data: serialiseTicket(existing), replayed: true });
        return;
      }

      const [category, relatedSystem] = await Promise.all([
        prisma.category.findUnique({ where: { id: parsed.input.categoryId }, select: { id: true, name: true, isActive: true } }),
        prisma.relatedSystem.findUnique({ where: { id: parsed.input.relatedSystemId }, select: { id: true, name: true, isActive: true } }),
      ]) as [Record<string, unknown> | null, Record<string, unknown> | null];
      const referenceErrors: Record<string, string> = {};
      if (!category || category.isActive !== true) referenceErrors.categoryId = "Category must exist and be active.";
      if (!relatedSystem || relatedSystem.isActive !== true) referenceErrors.relatedSystemId = "Related System must exist and be active.";
      if (Object.keys(referenceErrors).length > 0) {
        sendValidation(res, referenceErrors);
        return;
      }

      const ticketDate = new Date();
      const allocation = await allocateTicketNumber(prisma, ticketDate);
      let created: Record<string, unknown>;
      try {
        created = await prisma.ticket.create({
          data: {
            ticketNumber: allocation.ticketNumber,
            ticketSequence: allocation.ticketSequence,
            ticketDate,
            requesterId,
            categoryId: parsed.input.categoryId,
            relatedSystemId: parsed.input.relatedSystemId,
            summary: parsed.input.summary,
            requestedPriority: parsed.input.requestedPriority,
            description: parsed.input.description,
            currentStatus: "NEW",
            clientRequestId: idempotencyKey,
          },
          include: TICKET_INCLUDE,
        }) as Record<string, unknown>;
      } catch (error: unknown) {
        if (!isUniqueViolation(error)) throw error;
        const raced = await prisma.ticket.findUnique({
          where: { clientRequestId: idempotencyKey },
          include: TICKET_INCLUDE,
        }) as Record<string, unknown> | null;
        if (raced && rowFingerprint(raced) === fingerprint) {
          res.status(200).json({ data: serialiseTicket(raced), replayed: true });
          return;
        }
        if (raced) {
          res.status(409).json({
            error: { code: "IDEMPOTENCY_CONFLICT", message: "Idempotency-Key was already used with different data." },
          });
          return;
        }
        throw error;
      }

      res.status(201).json({ data: serialiseTicket(created), replayed: false });
    } catch {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Unable to create Ticket." },
      });
    }
  });
}
