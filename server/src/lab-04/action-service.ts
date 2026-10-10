import { Prisma, type ActionRevisionKind, type ActionState, type PrismaClient } from "@prisma/client";
import {
  ACTION_STATES,
  ActionRuleError,
  actionFingerprint,
  canTransitionAction,
  isPlainText,
  type ActionContent,
  validateActionContent,
} from "./action-rules.js";
import { ACTION_SAFE_SELECT, type TicketScope } from "./ticket-scope.js";
import { advanceTicketVersion, assertTicketVersion, lockTicket, mapTransactionError, TRANSACTION_OPTIONS } from "./workflow-service.js";

type ActionRecord = {
  id: number;
  ticketId: number;
  clientRequestId: string;
  payloadFingerprint: string;
  createdById: number;
  assigneeId: number;
  performedById: number | null;
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
  state: ActionState;
  cancellationReason: string | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type ActionWithPeople = ActionRecord & {
  createdBy: { id: number; name: string; role: string; isActive: boolean };
  assignee: { id: number; name: string; role: string; isActive: boolean };
  performedBy: { id: number; name: string; role: string; isActive: boolean } | null;
};

type RequestContext = { ticket: TicketScope; ticketNumber: string; actorId: number };

function safeAction(row: ActionWithPeople): Record<string, unknown> {
  const person = (value: ActionWithPeople["createdBy"] | null) => value ? {
    id: value.id, name: value.name, role: value.role, isActive: value.isActive,
  } : null;
  return {
    id: row.id,
    description: row.description,
    result: row.result,
    attachmentNotes: row.attachmentNotes,
    followUpRequired: row.followUpRequired,
    followUpNote: row.followUpNote,
    state: row.state,
    createdBy: person(row.createdBy),
    assignee: person(row.assignee),
    performedBy: person(row.performedBy),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    completedAt: row.completedAt,
    cancelledAt: row.cancelledAt,
    cancellationReason: row.cancellationReason,
    version: row.version,
  };
}

function snapshot(row: ActionRecord): Prisma.InputJsonObject {
  return {
    ticketId: row.ticketId,
    clientRequestId: row.clientRequestId,
    createdById: row.createdById,
    assigneeId: row.assigneeId,
    performedById: row.performedById,
    description: row.description,
    result: row.result,
    followUpRequired: row.followUpRequired,
    followUpNote: row.followUpNote,
    attachmentNotes: row.attachmentNotes,
    state: row.state,
    cancellationReason: row.cancellationReason,
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

async function findCurrentTicket(tx: Prisma.TransactionClient, ticketId: number): Promise<TicketScope> {
  const row = await tx.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
  });
  if (!row) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
  return row;
}

async function findAction(tx: Prisma.TransactionClient, ticketId: number, actionId: number): Promise<ActionWithPeople> {
  const action = await tx.actionTaken.findFirst({ where: { id: actionId, ticketId }, select: { ...ACTION_SAFE_SELECT, ticketId: true, clientRequestId: true, payloadFingerprint: true, createdById: true, assigneeId: true, performedById: true } });
  if (!action) throw new ActionRuleError(404, "ACTION_NOT_FOUND", "Action was not found.");
  return action as ActionWithPeople;
}

async function assertActiveSupportUser(tx: Prisma.TransactionClient, userId: number): Promise<void> {
  // Lock Ticket first, then User. This ordering avoids child/user-before-parent cycles.
  await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
  const user = await tx.user.findFirst({
    where: { id: userId, isActive: true, role: { in: ["IT_STAFF", "ADMIN"] } },
    select: { id: true },
  });
  if (!user) throw new ActionRuleError(400, "VALIDATION_ERROR", "Assignee must be an active IT Staff or Administrator.", { assigneeId: "Choose an active support user." });
}

function assertParentEditable(ticket: TicketScope): void {
  if (["RESOLVED", "CLOSED", "CANCELLED"].includes(ticket.currentStatus)) {
    throw new ActionRuleError(409, "TICKET_NOT_EDITABLE", "This Ticket is read-only in its current status.");
  }
}

function assertExpectedActionVersion(action: ActionRecord, expected: unknown): void {
  if (typeof expected !== "number" || !Number.isSafeInteger(expected) || expected <= 0) {
    throw new ActionRuleError(400, "VALIDATION_ERROR", "expectedVersion must be a positive integer.");
  }
  if (action.version !== expected) throw new ActionRuleError(409, "STALE_WRITE", "Action changed; refresh before retrying.");
}

function isIdempotencyUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.includes("clientRequestId");
  return typeof target === "string" && /ActionTaken_ticketId_clientRequestId_key|clientRequestId/.test(target);
}

function contentOf(action: ActionRecord): ActionContent {
  return {
    description: action.description,
    result: action.result,
    followUpRequired: action.followUpRequired,
    followUpNote: action.followUpNote,
    attachmentNotes: action.attachmentNotes,
  };
}

async function addRevision(
  tx: Prisma.TransactionClient,
  row: ActionRecord,
  actorId: number,
  kind: ActionRevisionKind,
): Promise<void> {
  await tx.actionRevision.create({ data: { actionId: row.id, version: row.version, actorId, kind, snapshot: snapshot(row) } });
}

export async function listActions(
  prisma: PrismaClient,
  ctx: RequestContext,
  page: number,
  pageSize: number,
  options?: { revisionsActionId?: number; focusActionId?: number; explicitPage?: boolean },
): Promise<{ items: unknown[]; page: number; pageSize: number; total: number; totalPages: number; ticketVersion: number }> {
  const ticket = ctx.ticket;
  if (options?.revisionsActionId !== undefined) {
    const action = await prisma.actionTaken.findFirst({ where: { id: options.revisionsActionId, ticketId: ticket.id }, select: { id: true } });
    if (!action) throw new ActionRuleError(404, "ACTION_NOT_FOUND", "Action was not found.");
    const where = { actionId: action.id };
    const [items, total] = await Promise.all([
      prisma.actionRevision.findMany({ where, orderBy: [{ version: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: { version: true, kind: true, createdAt: true, actor: { select: { id: true, name: true, role: true, isActive: true } }, snapshot: true } }),
      prisma.actionRevision.count({ where }),
    ]);
    return { items, page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize), ticketVersion: ticket.workflowVersion };
  }
  if (options?.focusActionId !== undefined) {
    if (options.explicitPage) throw new ActionRuleError(400, "VALIDATION_ERROR", "focusActionId cannot be combined with page.");
    const focus = await prisma.actionTaken.findFirst({ where: { id: options.focusActionId, ticketId: ticket.id }, select: { id: true, createdAt: true } });
    if (!focus) throw new ActionRuleError(404, "ACTION_NOT_FOUND", "Action was not found.");
    const preceding = await prisma.actionTaken.count({
      where: { ticketId: ticket.id, OR: [{ createdAt: { lt: focus.createdAt } }, { createdAt: focus.createdAt, id: { lt: focus.id } }] },
    });
    page = Math.floor(preceding / pageSize) + 1;
  }
  const where = { ticketId: ticket.id };
  const [rows, total] = await Promise.all([
    prisma.actionTaken.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize, select: ACTION_SAFE_SELECT }),
    prisma.actionTaken.count({ where }),
  ]);
  return { items: rows.map((row) => safeAction(row as ActionWithPeople)), page, pageSize, total, totalPages: total === 0 ? 0 : Math.ceil(total / pageSize), ticketVersion: ticket.workflowVersion };
}

export async function createAction(
  prisma: PrismaClient,
  ctx: RequestContext,
  input: { clientRequestId: string; expectedTicketVersion: number; assigneeId: number; content: ActionContent },
): Promise<{ action: unknown; ticketVersion: number; replay: boolean }> {
  const fingerprint = actionFingerprint(input.assigneeId, input.content);
  try { return await prisma.$transaction(async (tx) => {
    await lockTicket(tx, ctx.ticket.id);
    const ticket = await findCurrentTicket(tx, ctx.ticket.id);
    const existing = await tx.actionTaken.findUnique({
      where: { ticketId_clientRequestId: { ticketId: ticket.id, clientRequestId: input.clientRequestId } },
      select: { ...ACTION_SAFE_SELECT, ticketId: true, clientRequestId: true, payloadFingerprint: true, createdById: true, assigneeId: true, performedById: true },
    });
    if (existing) {
      if (existing.createdById !== ctx.actorId || existing.payloadFingerprint !== fingerprint) {
        throw new ActionRuleError(409, "IDEMPOTENCY_CONFLICT", "This request key was already used for different work.");
      }
      return { action: safeAction(existing as ActionWithPeople), ticketVersion: ticket.workflowVersion, replay: true };
    }
    assertParentEditable(ticket);
    assertTicketVersion(ticket, input.expectedTicketVersion);
    await assertActiveSupportUser(tx, input.assigneeId);
    validateActionContent(input.content);
    const created = await tx.actionTaken.create({
      data: {
        ticketId: ticket.id,
        clientRequestId: input.clientRequestId,
        payloadFingerprint: fingerprint,
        createdById: ctx.actorId,
        assigneeId: input.assigneeId,
        ...input.content,
        state: "PLANNED",
        version: 1,
      },
      select: { ...ACTION_SAFE_SELECT, ticketId: true, clientRequestId: true, payloadFingerprint: true, createdById: true, assigneeId: true, performedById: true },
    });
    await addRevision(tx, created as ActionRecord, ctx.actorId, "CREATE");
    const ticketVersion = await advanceTicketVersion(tx, ticket.id);
    return { action: safeAction(created as ActionWithPeople), ticketVersion, replay: false };
  }, TRANSACTION_OPTIONS); } catch (error) {
    if (!isIdempotencyUniqueViolation(error)) throw mapTransactionError(error) ?? error;

    // A competing request may have committed the same idempotency key after
    // our first read. Re-check the active requester scope and replay identity
    // under the parent lock before returning any Action data.
    try {
      return await prisma.$transaction(async (tx) => {
        await lockTicket(tx, ctx.ticket.id);
        const ticket = await tx.ticket.findFirst({
          where: { id: ctx.ticket.id, ticketNumber: ctx.ticketNumber, requester: { isActive: true } },
          select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
        });
        if (!ticket) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
        const raced = await tx.actionTaken.findUnique({
          where: { ticketId_clientRequestId: { ticketId: ticket.id, clientRequestId: input.clientRequestId } },
          select: { ...ACTION_SAFE_SELECT, ticketId: true, clientRequestId: true, payloadFingerprint: true, createdById: true, assigneeId: true, performedById: true },
        });
        if (!raced) throw mapTransactionError(error) ?? error;
        if (raced.createdById !== ctx.actorId || raced.payloadFingerprint !== fingerprint) {
          throw new ActionRuleError(409, "IDEMPOTENCY_CONFLICT", "This request key was already used for different work.");
        }
        return { action: safeAction(raced as ActionWithPeople), ticketVersion: ticket.workflowVersion, replay: true };
      }, TRANSACTION_OPTIONS);
    } catch (recheckError) {
      throw mapTransactionError(recheckError) ?? recheckError;
    }
  }
}

export async function updateAction(
  prisma: PrismaClient,
  ctx: RequestContext,
  actionId: number,
  input: { expectedTicketVersion: number; expectedVersion: number; changes: Partial<ActionContent> & { assigneeId?: number } },
): Promise<{ action: unknown; ticketVersion: number; noOp: boolean }> {
  try { return await prisma.$transaction(async (tx) => {
    await lockTicket(tx, ctx.ticket.id);
    const ticket = await findCurrentTicket(tx, ctx.ticket.id);
    assertParentEditable(ticket);
    assertTicketVersion(ticket, input.expectedTicketVersion);
    const action = await findAction(tx, ticket.id, actionId);
    if (["COMPLETED", "CANCELLED"].includes(action.state)) throw new ActionRuleError(409, "ACTION_NOT_EDITABLE", "A terminal Action cannot be edited.");
    assertExpectedActionVersion(action, input.expectedVersion);
    const { assigneeId: requestedAssignee, ...contentChanges } = input.changes;
    const next = { ...contentOf(action), ...contentChanges };
    validateActionContent(next);
    const assigneeId = requestedAssignee ?? action.assigneeId;
    const assignmentChanged = assigneeId !== action.assigneeId;
    const contentChanged = Object.keys(contentChanges).some((key) => next[key as keyof ActionContent] !== action[key as keyof ActionRecord]);
    if (!assignmentChanged && !contentChanged) return { action: safeAction(action), ticketVersion: ticket.workflowVersion, noOp: true };
    if (assignmentChanged) await assertActiveSupportUser(tx, assigneeId);
    const changed = await tx.actionTaken.updateMany({ where: { id: action.id, ticketId: ticket.id, version: action.version }, data: { ...next, assigneeId, version: { increment: 1 } } });
    if (changed.count !== 1) throw new ActionRuleError(409, "STALE_WRITE", "Action changed; refresh before retrying.");
    const updated = await findAction(tx, ticket.id, action.id);
    await addRevision(tx, updated, ctx.actorId, assignmentChanged && !contentChanged ? "ASSIGN" : "EDIT");
    const ticketVersion = await advanceTicketVersion(tx, ticket.id);
    return { action: safeAction(updated), ticketVersion, noOp: false };
  }, TRANSACTION_OPTIONS); } catch (error) { throw mapTransactionError(error) ?? error; }
}

export async function transitionAction(
  prisma: PrismaClient,
  ctx: RequestContext,
  actionId: number,
  input: { expectedTicketVersion: number; expectedVersion: number; state: ActionState; confirm?: boolean; reason?: string; result?: string; followUpRequired?: boolean; followUpNote?: string },
): Promise<{ action: unknown; ticketVersion: number }> {
  try { return await prisma.$transaction(async (tx) => {
    await lockTicket(tx, ctx.ticket.id);
    const ticket = await findCurrentTicket(tx, ctx.ticket.id);
    assertParentEditable(ticket);
    assertTicketVersion(ticket, input.expectedTicketVersion);
    const action = await findAction(tx, ticket.id, actionId);
    assertExpectedActionVersion(action, input.expectedVersion);
    if (!ACTION_STATES.includes(input.state) || !canTransitionAction(action.state, input.state)) {
      throw new ActionRuleError(409, "ACTION_TRANSITION_NOT_ALLOWED", "This Action transition is not allowed.");
    }
    if ((input.state === "COMPLETED" || input.state === "CANCELLED") && input.confirm !== true) {
      throw new ActionRuleError(409, "CONFIRMATION_REQUIRED", "This Action transition requires explicit confirmation.");
    }
    let data: Prisma.ActionTakenUncheckedUpdateManyInput;
    let kind: ActionRevisionKind;
    if (input.state === "IN_PROGRESS") {
      await assertActiveSupportUser(tx, action.assigneeId);
      data = { state: "IN_PROGRESS", version: { increment: 1 } };
      kind = "START";
    } else if (input.state === "COMPLETED") {
      await assertActiveSupportUser(tx, action.assigneeId);
      const next = { ...contentOf(action), ...(input.result !== undefined ? { result: input.result } : {}), ...(input.followUpRequired !== undefined ? { followUpRequired: input.followUpRequired } : {}), ...(input.followUpNote !== undefined ? { followUpNote: input.followUpNote } : {}) };
      validateActionContent(next, true);
      const completedAt = new Date();
      data = { ...next, state: "COMPLETED", completedAt, version: { increment: 1 } };
      data = { ...next, state: "COMPLETED", performedById: ctx.actorId, completedAt, version: { increment: 1 } };
      kind = "COMPLETE";
    } else {
      const reason = input.reason?.trim() ?? "";
      if (reason.length < 5 || reason.length > 250 || !isPlainText(reason)) {
        throw new ActionRuleError(400, "VALIDATION_ERROR", "Cancellation reason must contain 5-250 plain-text characters.", { reason: "Enter 5-250 plain-text characters." });
      }
      data = { state: "CANCELLED", cancellationReason: reason, cancelledAt: new Date(), version: { increment: 1 } };
      kind = "CANCEL";
    }
    const changed = await tx.actionTaken.updateMany({ where: { id: action.id, ticketId: ticket.id, version: action.version }, data });
    if (changed.count !== 1) throw new ActionRuleError(409, "STALE_WRITE", "Action changed; refresh before retrying.");
    const updated = await findAction(tx, ticket.id, action.id);
    await addRevision(tx, updated, ctx.actorId, kind);
    const ticketVersion = await advanceTicketVersion(tx, ticket.id);
    return { action: safeAction(updated), ticketVersion };
  }, TRANSACTION_OPTIONS); } catch (error) { throw mapTransactionError(error) ?? error; }
}
