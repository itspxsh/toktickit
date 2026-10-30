import { Prisma, type PrismaClient } from "@prisma/client";
import type { CurrentStatus, ItPriority, UserRole } from "@prisma/client";
import type { Request } from "express";
import { ActionRuleError, assertVersions } from "./action-rules.js";
import { activeStaffTicketWhere, findAuthorizedTicket, type TicketScope } from "./ticket-scope.js";

const TICKET_TRANSITIONS: Record<CurrentStatus, readonly CurrentStatus[]> = {
  NEW: ["OPEN", "IN_PROGRESS", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  WAITING_FOR_REQUESTER: ["OPEN", "IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

export function allowedTicketTransitions(from: CurrentStatus, role: UserRole): CurrentStatus[] {
  if (role === "REQUESTER" || (from === "CANCELLED" && role !== "ADMIN")) return [];
  return [...TICKET_TRANSITIONS[from]];
}

export function ticketTransitionRequiresConfirmation(from: CurrentStatus, to: CurrentStatus): boolean {
  return from !== to && (to === "RESOLVED" || to === "CANCELLED" || (from === "RESOLVED" && to === "CLOSED"));
}

export type ResolutionAction = Pick<Prisma.ActionTakenGetPayload<{}>, "state" | "result" | "followUpRequired">;
export type ResolutionBlocker = "ZERO_COMPLETED" | "UNFINISHED_ACTIONS" | "FOLLOW_UP_REQUIRED";

export function resolutionBlockers(actions: readonly ResolutionAction[]): ResolutionBlocker[] {
  const blockers: ResolutionBlocker[] = [];
  if (!actions.some((action) => action.state === "COMPLETED" && typeof action.result === "string" && action.result.trim().length > 0)) {
    blockers.push("ZERO_COMPLETED");
  }
  if (actions.some((action) => action.state === "PLANNED" || action.state === "IN_PROGRESS")) {
    blockers.push("UNFINISHED_ACTIONS");
  }
  if (actions.some((action) => action.state !== "CANCELLED" && action.followUpRequired)) {
    blockers.push("FOLLOW_UP_REQUIRED");
  }
  return blockers;
}

type WorkflowTicket = TicketScope & {
  resolvedAt: Date | null;
  itPriority: ItPriority | null;
};

type WorkflowTransaction = Prisma.TransactionClient;

type WorkflowResponse = {
  ticketVersion: number;
  currentStatus: CurrentStatus;
  allowedTransitions: CurrentStatus[];
  resolutionGate: { canResolve: boolean; blockers: ResolutionBlocker[] };
};

const EDITABLE_TICKET_STATUSES: readonly CurrentStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];

async function loadLockedTicket(tx: WorkflowTransaction, ticket: TicketScope): Promise<WorkflowTicket> {
  const current = await tx.ticket.findFirst({
    where: { id: ticket.id, ticketNumber: ticket.ticketNumber, ...activeStaffTicketWhere() },
    select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true, resolvedAt: true, itPriority: true },
  });
  if (!current) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
  return current;
}

async function loadResolutionBlockers(tx: WorkflowTransaction, ticketId: number): Promise<ResolutionBlocker[]> {
  const actions = await tx.actionTaken.findMany({
    where: { ticketId },
    select: { state: true, result: true, followUpRequired: true },
  });
  return resolutionBlockers(actions);
}

async function lockActiveSupportUser(
  tx: WorkflowTransaction,
  userId: number,
  requiredRole?: UserRole,
): Promise<{ id: number; name: string } | null> {
  // Workflow lock order is always Ticket first, then candidate User.
  await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`);
  return tx.user.findFirst({
    where: {
      id: userId,
      isActive: true,
      role: requiredRole ?? { in: ["IT_STAFF", "ADMIN"] },
    },
    select: { id: true, name: true },
  });
}

async function workflowResponse(tx: WorkflowTransaction, ticket: WorkflowTicket, role: UserRole): Promise<WorkflowResponse> {
  const blockers = await loadResolutionBlockers(tx, ticket.id);
  return {
    ticketVersion: ticket.workflowVersion,
    currentStatus: ticket.currentStatus as CurrentStatus,
    allowedTransitions: allowedTicketTransitions(ticket.currentStatus as CurrentStatus, role),
    resolutionGate: { canResolve: blockers.length === 0, blockers },
  };
}

async function withLockedTicket<T>(
  prisma: PrismaClient,
  req: Request,
  ticketNumber: string,
  operation: (tx: WorkflowTransaction, ticket: WorkflowTicket) => Promise<T>,
): Promise<T> {
  const authorized = await findAuthorizedTicket(prisma, req, ticketNumber, "staff");
  if (!authorized) throw new ActionRuleError(404, "TICKET_NOT_FOUND", "Ticket was not found.");
  return prisma.$transaction(async (tx) => {
    await lockTicket(tx, authorized.id);
    const ticket = await loadLockedTicket(tx, authorized);
    return operation(tx, ticket);
  }, TRANSACTION_OPTIONS);
}

function assertTicketEditable(ticket: WorkflowTicket): void {
  if (!EDITABLE_TICKET_STATUSES.includes(ticket.currentStatus as CurrentStatus)) {
    throw new ActionRuleError(409, "TICKET_NOT_EDITABLE", "This Ticket is read-only in its current status.");
  }
}

export async function claimTicket(
  prisma: PrismaClient,
  req: Request,
  input: { ticketNumber: string; actorId: number; role: UserRole; expectedTicketVersion: number },
): Promise<{ assignedStaff: { id: number; name: string }; workflow: WorkflowResponse }> {
  try {
    return await withLockedTicket(prisma, req, input.ticketNumber, async (tx, ticket) => {
      assertTicketEditable(ticket);
      assertTicketVersion(ticket, input.expectedTicketVersion);
      if (ticket.assignedStaffId !== null) throw new ActionRuleError(409, "TICKET_ALREADY_ASSIGNED", "Ticket is already assigned.");
      const owner = await lockActiveSupportUser(tx, input.actorId, input.role);
      if (!owner) throw new ActionRuleError(403, "FORBIDDEN", "You are not allowed to perform this action.");
      const changed = await tx.ticket.updateMany({ where: { id: ticket.id, workflowVersion: ticket.workflowVersion, assignedStaffId: null }, data: { assignedStaffId: owner.id, workflowVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ActionRuleError(409, "TICKET_ALREADY_ASSIGNED", "Ticket is already assigned.");
      const updated = { ...ticket, assignedStaffId: owner.id, workflowVersion: ticket.workflowVersion + 1 };
      return { assignedStaff: owner, workflow: await workflowResponse(tx, updated, input.role) };
    });
  } catch (error) {
    throw mapTransactionError(error) ?? error;
  }
}

export async function assignTicket(
  prisma: PrismaClient,
  req: Request,
  input: { ticketNumber: string; assignedStaffId: number | null; role: UserRole; expectedTicketVersion: number },
): Promise<{ assignedStaff: { id: number; name: string } | null; workflow: WorkflowResponse }> {
  try {
    return await withLockedTicket(prisma, req, input.ticketNumber, async (tx, ticket) => {
      assertTicketEditable(ticket);
      assertTicketVersion(ticket, input.expectedTicketVersion);
      const target = input.assignedStaffId === null ? null : await lockActiveSupportUser(tx, input.assignedStaffId);
      if (input.assignedStaffId !== null && !target) throw new ActionRuleError(400, "VALIDATION_ERROR", "Assignment target must be an active support user.", { assignedStaffId: "Choose an active IT Staff or Administrator." });
      if ((target?.id ?? null) === ticket.assignedStaffId) {
        return { assignedStaff: target, workflow: await workflowResponse(tx, ticket, input.role) };
      }
      const changed = await tx.ticket.updateMany({ where: { id: ticket.id, workflowVersion: ticket.workflowVersion }, data: { assignedStaffId: target?.id ?? null, workflowVersion: { increment: 1 } } });
      if (changed.count !== 1) throw new ActionRuleError(409, "STALE_WRITE", "Ticket work changed; refresh before retrying.");
      const updated = { ...ticket, assignedStaffId: target?.id ?? null, workflowVersion: ticket.workflowVersion + 1 };
      return { assignedStaff: target, workflow: await workflowResponse(tx, updated, input.role) };
    });
  } catch (error) {
    throw mapTransactionError(error) ?? error;
  }
}

export async function updateTicketPriority(
  prisma: PrismaClient,
  req: Request,
  input: { ticketNumber: string; itPriority: ItPriority; role: UserRole; expectedTicketVersion: number },
): Promise<{ itPriority: ItPriority | null; workflow: WorkflowResponse }> {
  try {
    return await withLockedTicket(prisma, req, input.ticketNumber, async (tx, ticket) => {
      assertTicketEditable(ticket);
      assertTicketVersion(ticket, input.expectedTicketVersion);
      if (ticket.itPriority !== input.itPriority) {
        const changed = await tx.ticket.updateMany({ where: { id: ticket.id, workflowVersion: ticket.workflowVersion }, data: { itPriority: input.itPriority, workflowVersion: { increment: 1 } } });
        if (changed.count !== 1) throw new ActionRuleError(409, "STALE_WRITE", "Ticket work changed; refresh before retrying.");
      }
      const updated = { ...ticket, itPriority: input.itPriority, workflowVersion: ticket.workflowVersion + (ticket.itPriority === input.itPriority ? 0 : 1) };
      return { itPriority: updated.itPriority, workflow: await workflowResponse(tx, updated, input.role) };
    });
  } catch (error) {
    throw mapTransactionError(error) ?? error;
  }
}

export async function updateTicketStatus(
  prisma: PrismaClient,
  req: Request,
  input: { ticketNumber: string; currentStatus: CurrentStatus; confirm?: boolean; role: UserRole; actorId: number; expectedTicketVersion: number },
): Promise<WorkflowResponse & { noOp: boolean }> {
  try {
    return await withLockedTicket(prisma, req, input.ticketNumber, async (tx, ticket) => {
      assertTicketVersion(ticket, input.expectedTicketVersion);
      if (ticket.currentStatus === input.currentStatus) return { ...(await workflowResponse(tx, ticket, input.role)), noOp: true };
      if (ticket.currentStatus === "CANCELLED" && input.currentStatus === "REOPENED" && input.role !== "ADMIN") {
        throw new ActionRuleError(403, "FORBIDDEN", "You are not allowed to perform this action.");
      }
      if (!allowedTicketTransitions(ticket.currentStatus as CurrentStatus, input.role).includes(input.currentStatus)) {
        throw new ActionRuleError(400, "INVALID_STATUS_TRANSITION", "The requested status transition is not allowed.");
      }
      if (ticketTransitionRequiresConfirmation(ticket.currentStatus as CurrentStatus, input.currentStatus) && input.confirm !== true) {
        throw new ActionRuleError(409, "CONFIRMATION_REQUIRED", "This status change requires explicit confirmation.");
      }
      if (input.currentStatus === "RESOLVED" || input.currentStatus === "CLOSED") {
        const blockers = await loadResolutionBlockers(tx, ticket.id);
        if (blockers.length) throw new ActionRuleError(409, "RESOLUTION_REQUIREMENTS_NOT_MET", "Complete truthful Action work before resolving or closing this Ticket.", undefined, { blockers });
      }
      const now = new Date();
      const changed = await tx.ticket.updateMany({
        where: { id: ticket.id, workflowVersion: ticket.workflowVersion, currentStatus: ticket.currentStatus as CurrentStatus },
        data: {
          currentStatus: input.currentStatus,
          workflowVersion: { increment: 1 },
          ...(input.currentStatus === "RESOLVED" ? { resolvedAt: now } : input.currentStatus === "REOPENED" ? { resolvedAt: null } : {}),
        },
      });
      if (changed.count !== 1) throw new ActionRuleError(409, "STALE_WRITE", "Ticket work changed; refresh before retrying.");
      await tx.ticketStatusEvent.create({ data: { ticketId: ticket.id, fromStatus: ticket.currentStatus as CurrentStatus, toStatus: input.currentStatus, actorId: input.actorId } });
      const updated = {
        ...ticket,
        currentStatus: input.currentStatus,
        workflowVersion: ticket.workflowVersion + 1,
        resolvedAt: input.currentStatus === "RESOLVED" ? now : input.currentStatus === "REOPENED" ? null : ticket.resolvedAt,
      };
      return { ...(await workflowResponse(tx, updated, input.role)), noOp: false };
    });
  } catch (error) {
    throw mapTransactionError(error) ?? error;
  }
}

/** Parent Ticket is always locked before an Action or User row. */
export async function lockTicket(tx: Prisma.TransactionClient, ticketId: number): Promise<void> {
  await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`SELECT "id" FROM "Ticket" WHERE "id" = ${ticketId} FOR UPDATE`);
}

export function assertTicketVersion(ticket: Pick<TicketScope, "workflowVersion">, expected: unknown): void {
  assertVersions(expected);
  if (ticket.workflowVersion !== expected) {
    throw new ActionRuleError(409, "STALE_WRITE", "Ticket work changed; refresh before retrying.");
  }
}

export async function advanceTicketVersion(tx: Prisma.TransactionClient, ticketId: number): Promise<number> {
  const changed = await tx.ticket.update({
    where: { id: ticketId },
    data: { workflowVersion: { increment: 1 } },
    select: { workflowVersion: true },
  });
  return changed.workflowVersion;
}

export function mapTransactionError(error: unknown): ActionRuleError | null {
  if (error instanceof ActionRuleError) return error;
  // Unique-key conflicts are operation-specific (Action creation maps its idempotency key explicitly).
  // Only Prisma serialization conflicts are safely equivalent to a stale workflow version here.
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return new ActionRuleError(409, "STALE_WRITE", "Work changed concurrently; refresh and retry.");
  }
  return null;
}

export const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

export type PrismaProvider = () => PrismaClient;
