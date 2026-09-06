import type { Express, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import { allocateTicketNumber, type TicketSequenceClient } from "../ticket-number.js";

type Model = {
  findUnique(args: unknown): Promise<unknown>;
  create(args: unknown): Promise<unknown>;
};

type ListModel = {
  findMany(args: unknown): Promise<unknown>;
  count(args: unknown): Promise<number>;
};

export interface TicketRouteClient extends TicketSequenceClient {
  requester: Pick<Model, "findUnique">;
  category: Pick<Model, "findUnique">;
  relatedSystem: Pick<Model, "findUnique">;
  ticket: Model & ListModel;
}

type PrismaProvider = () => TicketRouteClient;
type RequestedPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TicketListSortBy = "updatedAt" | "createdAt" | "ticketNumber" | "requestedPriority";
type SortOrder = "asc" | "desc";

const PRIORITIES = new Set<RequestedPriority>(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TICKET_INCLUDE = {
  requester: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
};

const TICKET_LIST_SELECT = {
  id: true,
  ticketNumber: true,
  ticketDate: true,
  summary: true,
  requestedPriority: true,
  currentStatus: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  relatedSystem: { select: { id: true, name: true } },
};

const TICKET_LIST_SORT_FIELDS = new Set<TicketListSortBy>([
  "updatedAt",
  "createdAt",
  "ticketNumber",
  "requestedPriority",
]);

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

function serialiseTicketListRow(row: Record<string, unknown>): Record<string, unknown> {
  const category = row.category as Record<string, unknown> | undefined;
  const relatedSystem = row.relatedSystem as Record<string, unknown> | undefined;
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    ticketDate: row.ticketDate,
    summary: row.summary,
    requestedPriority: row.requestedPriority,
    currentStatus: row.currentStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    category: category ? { id: category.id, name: category.name } : undefined,
    relatedSystem: relatedSystem ? { id: relatedSystem.id, name: relatedSystem.name } : undefined,
  };
}

interface ParsedListQuery {
  search?: string;
  categoryId?: number;
  relatedSystemId?: number;
  requestedPriority?: RequestedPriority;
  status: "NEW";
  sortBy: TicketListSortBy;
  sortOrder: SortOrder;
  page: number;
  pageSize: 10 | 20 | 50;
}

interface ParsedListQueryResult {
  query?: ParsedListQuery;
  fieldErrors: Record<string, string>;
}

function readQueryValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseQueryPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseListQuery(rawQuery: Record<string, unknown>): ParsedListQueryResult {
  const fieldErrors: Record<string, string> = {};
  const searchValue = rawQuery.search;
  let search: string | undefined;
  if (searchValue !== undefined) {
    const value = readQueryValue(searchValue);
    if (value === undefined || value.trim().length > 100) {
      fieldErrors.search = "Search must contain at most 100 characters.";
    } else if (value.trim()) {
      search = value.trim();
    }
  }

  const categoryValue = rawQuery.categoryId;
  let categoryId: number | undefined;
  if (categoryValue !== undefined) {
    categoryId = parseQueryPositiveInteger(categoryValue);
    if (categoryId === undefined) fieldErrors.categoryId = "Category id must be a positive integer.";
  }

  const relatedSystemValue = rawQuery.relatedSystemId;
  let relatedSystemId: number | undefined;
  if (relatedSystemValue !== undefined) {
    relatedSystemId = parseQueryPositiveInteger(relatedSystemValue);
    if (relatedSystemId === undefined) {
      fieldErrors.relatedSystemId = "Related System id must be a positive integer.";
    }
  }

  const requestedPriorityValue = rawQuery.requestedPriority;
  let requestedPriority: RequestedPriority | undefined;
  if (requestedPriorityValue !== undefined) {
    const value = readQueryValue(requestedPriorityValue);
    if (value === undefined || !PRIORITIES.has(value as RequestedPriority)) {
      fieldErrors.requestedPriority = "Requested Priority must be LOW, MEDIUM, HIGH, or URGENT.";
    } else {
      requestedPriority = value as RequestedPriority;
    }
  }

  const statusValue = rawQuery.status;
  let status: "NEW" = "NEW";
  if (statusValue !== undefined) {
    const value = readQueryValue(statusValue);
    if (value !== "NEW") fieldErrors.status = "Status must be NEW.";
    else status = value;
  }

  const sortByValue = rawQuery.sortBy;
  let sortBy: TicketListSortBy = "updatedAt";
  if (sortByValue !== undefined) {
    const value = readQueryValue(sortByValue);
    if (value === undefined || !TICKET_LIST_SORT_FIELDS.has(value as TicketListSortBy)) {
      fieldErrors.sortBy = "Sort field is not supported.";
    } else {
      sortBy = value as TicketListSortBy;
    }
  }

  const sortOrderValue = rawQuery.sortOrder;
  let sortOrder: SortOrder = "desc";
  if (sortOrderValue !== undefined) {
    const value = readQueryValue(sortOrderValue);
    if (value !== "asc" && value !== "desc") fieldErrors.sortOrder = "Sort order must be asc or desc.";
    else sortOrder = value;
  }

  const pageValue = rawQuery.page;
  let page = 1;
  if (pageValue !== undefined) {
    const parsed = parseQueryPositiveInteger(pageValue);
    if (parsed === undefined) fieldErrors.page = "Page must be a positive integer.";
    else page = parsed;
  }

  const pageSizeValue = rawQuery.pageSize;
  let pageSize: 10 | 20 | 50 = 10;
  if (pageSizeValue !== undefined) {
    const parsed = parseQueryPositiveInteger(pageSizeValue);
    if (parsed !== 10 && parsed !== 20 && parsed !== 50) {
      fieldErrors.pageSize = "Page size must be 10, 20, or 50.";
    } else {
      pageSize = parsed;
    }
  }

  if (page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize) + 1) {
    fieldErrors.page = "Page is too large.";
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    fieldErrors,
    query: { search, categoryId, relatedSystemId, requestedPriority, status, sortBy, sortOrder, page, pageSize },
  };
}

function buildTicketListWhere(query: ParsedListQuery, requesterId: number): Record<string, unknown> {
  const where: Record<string, unknown> = {
    requesterId,
    currentStatus: query.status,
  };
  if (query.categoryId !== undefined) where.categoryId = query.categoryId;
  if (query.relatedSystemId !== undefined) where.relatedSystemId = query.relatedSystemId;
  if (query.requestedPriority !== undefined) where.requestedPriority = query.requestedPriority;
  if (query.search) {
    where.OR = [
      { ticketNumber: { contains: query.search, mode: "insensitive" } },
      { summary: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return where;
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
  app.get("/api/tickets", async (req: Request, res: Response) => {
    const requesterId = parseRequesterId(req.header("X-Development-Requester-Id"));
    if (requesterId === null) {
      res.status(400).json({
        error: { code: "INVALID_REQUESTER_CONTEXT", message: "A positive Development Requester id is required." },
      });
      return;
    }

    const parsed = parseListQuery(req.query as Record<string, unknown>);
    if (!parsed.query) {
      res.status(400).json({
        error: {
          code: "INVALID_QUERY",
          message: "One or more query parameters are invalid.",
          fieldErrors: parsed.fieldErrors,
        },
      });
      return;
    }

    const prisma = prismaProvider();
    try {
      const requester = await prisma.requester.findUnique({
        where: { id: requesterId },
        select: { id: true, isActive: true },
      }) as Record<string, unknown> | null;
      if (!requester) {
        res.status(404).json({ error: { code: "REQUESTER_NOT_FOUND", message: "Development Requester was not found." } });
        return;
      }
      if (requester.isActive !== true) {
        res.status(403).json({ error: { code: "REQUESTER_INACTIVE", message: "Development Requester is inactive." } });
        return;
      }

      const where = buildTicketListWhere(parsed.query, requesterId);
      const skip = (parsed.query.page - 1) * parsed.query.pageSize;
      const orderBy = [
        { [parsed.query.sortBy]: parsed.query.sortOrder },
        { id: parsed.query.sortOrder },
      ];
      const [ticketRows, totalItems] = await Promise.all([
        prisma.ticket.findMany({
          where,
          orderBy,
          skip,
          take: parsed.query.pageSize,
          select: TICKET_LIST_SELECT,
        }),
        prisma.ticket.count({ where }),
      ]) as [unknown[], number];

      res.status(200).json({
        data: ticketRows.map((row) => serialiseTicketListRow(row as Record<string, unknown>)),
        pagination: {
          page: parsed.query.page,
          pageSize: parsed.query.pageSize,
          totalItems,
          totalPages: Math.ceil(totalItems / parsed.query.pageSize),
        },
      });
    } catch {
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Unable to load Tickets." },
      });
    }
  });

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
