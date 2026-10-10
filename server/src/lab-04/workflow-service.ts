import { Prisma, type PrismaClient } from "@prisma/client";
import { ActionRuleError, assertVersions } from "./action-rules.js";
import type { TicketScope } from "./ticket-scope.js";

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
