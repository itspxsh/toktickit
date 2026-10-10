import type { Prisma, PrismaClient } from "@prisma/client";
import type { Request } from "express";
import { ActionRuleError } from "./action-rules.js";

export const TICKET_NUMBER_PATTERN = /^TKT-\d{4}-\d{6}$/;
export const ACTION_PERSON_SELECT = { id: true, name: true, role: true, isActive: true } as const;
export const ACTION_SAFE_SELECT = {
  id: true,
  description: true,
  result: true,
  attachmentNotes: true,
  followUpRequired: true,
  followUpNote: true,
  state: true,
  cancellationReason: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
  cancelledAt: true,
  version: true,
  createdBy: { select: ACTION_PERSON_SELECT },
  assignee: { select: ACTION_PERSON_SELECT },
  performedBy: { select: ACTION_PERSON_SELECT },
} satisfies Prisma.ActionTakenSelect;

export type TicketScope = {
  id: number;
  ticketNumber: string;
  workflowVersion: number;
  currentStatus: string;
  assignedStaffId: number | null;
};

export function parseTicketNumber(raw: string | undefined): string {
  const value = raw?.trim() ?? "";
  if (!TICKET_NUMBER_PATTERN.test(value)) throw new ActionRuleError(400, "INVALID_TICKET_NUMBER", "Ticket Number must match TKT-YYYY-NNNNNN.");
  return value;
}

export function parseIdentifier(raw: string | undefined, field = "identifier"): number {
  if (!raw || !/^[1-9]\d*$/.test(raw)) throw new ActionRuleError(400, "INVALID_IDENTIFIER", `${field} must be a positive integer.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new ActionRuleError(400, "INVALID_IDENTIFIER", `${field} must be a positive integer.`);
  return value;
}

export async function findAuthorizedTicket(
  prisma: PrismaClient | Prisma.TransactionClient,
  req: Request,
  ticketNumber: string,
  role: "requester" | "staff",
): Promise<TicketScope | null> {
  const ticket = await prisma.ticket.findFirst({
    where: {
      ticketNumber,
      requester: { isActive: true },
      // requesterId is populated exclusively by the session-backed requester
      // middleware and preserves ownership for legacy Tickets without a
      // requesterUserId value.
      ...(role === "requester" ? { requesterId: req.requesterId ?? -1 } : {}),
    },
    select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
  });
  return ticket;
}
