import { Prisma, type PrismaClient } from "@prisma/client";
import type { CurrentStatus, UserRole } from "@prisma/client";
import { ActionRuleError, assertVersions } from "./action-rules.js";
import type { TicketScope } from "./ticket-scope.js";

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
  if (!actions.some((action) => action.state === "COMPLETED" && action.result.trim().length > 0)) {
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
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) {
    return new ActionRuleError(409, error.code === "P2002" ? "IDEMPOTENCY_CONFLICT" : "STALE_WRITE", "Work changed concurrently; refresh and retry.");
  }
  return null;
}

export const TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted } as const;

export type PrismaProvider = () => PrismaClient;
