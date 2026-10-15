import { Prisma, type CurrentStatus, type PrismaClient } from "@prisma/client";
import type { AuthRole } from "../auth.js";
import { activeStaffTicketWhere } from "./ticket-scope.js";

const ACTIVE_STATUSES: CurrentStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const RESOLVED_STATUSES: CurrentStatus[] = ["RESOLVED", "CLOSED"];
const ALL_STATUSES: CurrentStatus[] = [
  "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const SUMMARY_SELECT = {
  ticketNumber: true,
  summary: true,
  currentStatus: true,
  itPriority: true,
  updatedAt: true,
  resolvedAt: true,
} satisfies Prisma.TicketSelect;

export class DashboardError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export interface DashboardPrisma extends Pick<PrismaClient, "$transaction"> {}

export interface DashboardActor {
  id: number;
  role: AuthRole;
}

function requesterScope(userId: number, requesterId: number): Prisma.TicketWhereInput {
  return {
    requesterUserId: userId,
    requesterId,
    requesterUser: { is: { id: userId, role: "REQUESTER", isActive: true } },
    requester: { is: { id: requesterId, isActive: true, user: { is: { id: userId, role: "REQUESTER", isActive: true } } } },
  };
}

function staffScope(): Prisma.TicketWhereInput {
  return activeStaffTicketWhere();
}

function metric(value: number, drillDown: string) {
  return { value, drillDown };
}

function asSummary(row: { ticketNumber: string; summary: string; currentStatus: CurrentStatus; itPriority: string | null; updatedAt: Date; resolvedAt: Date | null }, role: "requester" | "staff") {
  return {
    ticketNumber: row.ticketNumber,
    summary: row.summary,
    currentStatus: row.currentStatus,
    itPriority: row.itPriority,
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    href: role === "requester" ? `/tickets/${row.ticketNumber}` : `/staff/tickets/${row.ticketNumber}`,
  };
}

function metricWindow(now: Date): { asOf: string; windowStart: Date; windowStartIso: string } {
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { asOf: now.toISOString(), windowStart, windowStartIso: windowStart.toISOString() };
}

/** All requester dashboard reads share one repeatable-read snapshot and one session-derived owner scope. */
export async function requesterDashboard(prisma: DashboardPrisma, actor: DashboardActor, now = new Date()) {
  if (actor.role !== "REQUESTER") throw new DashboardError(403, "FORBIDDEN", "You are not allowed to perform this action.");
  const window = metricWindow(now);
  return prisma.$transaction(async (tx) => {
    const identity = await tx.user.findFirst({
      where: { id: actor.id, role: "REQUESTER", isActive: true, requester: { is: { isActive: true } } },
      select: { id: true, requester: { select: { id: true, isActive: true } } },
    });
    if (!identity?.requester?.isActive) throw new DashboardError(403, "FORBIDDEN", "You are not allowed to perform this action.");
    const scope = requesterScope(actor.id, identity.requester.id);
    const windowStart = window.windowStart;
    const asOfDate = new Date(window.asOf);
    const [activeTickets, waitingForRequester, updatedLast7Days, resolvedLast7Days, attention, recent] = await Promise.all([
      tx.ticket.count({ where: { ...scope, currentStatus: { in: ACTIVE_STATUSES } } }),
      tx.ticket.count({ where: { ...scope, currentStatus: "WAITING_FOR_REQUESTER" } }),
      tx.ticket.count({ where: { ...scope, updatedAt: { gte: windowStart, lt: asOfDate } } }),
      tx.ticket.count({ where: { ...scope, currentStatus: { in: RESOLVED_STATUSES }, resolvedAt: { gte: windowStart, lt: asOfDate } } }),
      tx.ticket.findMany({
        where: { ...scope, currentStatus: "WAITING_FOR_REQUESTER" },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: SUMMARY_SELECT,
      }),
      tx.ticket.findMany({
        where: { ...scope, updatedAt: { gte: windowStart, lt: asOfDate } },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: SUMMARY_SELECT,
      }),
    ]);
    return {
      asOf: window.asOf,
      windowStart: window.windowStartIso,
      displayTimeZone: "Asia/Bangkok" as const,
      metrics: {
        activeTickets: metric(activeTickets, "/tickets?statusGroup=active"),
        waitingForRequester: metric(waitingForRequester, "/tickets?status=WAITING_FOR_REQUESTER"),
        updatedLast7Days: metric(updatedLast7Days, `/tickets?updatedSince=${window.windowStartIso}&before=${window.asOf}`),
        resolvedLast7Days: metric(resolvedLast7Days, `/tickets?statusGroup=resolved&resolvedSince=${window.windowStartIso}&before=${window.asOf}`),
      },
      attentionTickets: attention.map((row) => asSummary(row, "requester")),
      recentTickets: recent.map((row) => asSummary(row, "requester")),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 });
}

/** Staff dashboard counts, buckets and child Action pagination share the queue's active-owner predicate. */
export async function staffDashboard(
  prisma: DashboardPrisma,
  actor: DashboardActor,
  actionPage: number,
  actionPageSize: number,
  now = new Date(),
) {
  if (actor.role !== "IT_STAFF" && actor.role !== "ADMIN") {
    throw new DashboardError(403, "FORBIDDEN", "You are not allowed to perform this action.");
  }
  const window = metricWindow(now);
  const scope = staffScope();
  const activeScope = { ...scope, currentStatus: { in: ACTIVE_STATUSES } } satisfies Prisma.TicketWhereInput;
  return prisma.$transaction(async (tx) => {
    const [unassignedActive, ownedActive, urgentActive, statusRows, priorityRows, recent, urgent, actionTotal, actions] = await Promise.all([
      tx.ticket.count({ where: { ...activeScope, assignedStaffId: null } }),
      tx.ticket.count({ where: { ...activeScope, assignedStaffId: actor.id } }),
      tx.ticket.count({ where: { ...activeScope, itPriority: "URGENT" } }),
      tx.ticket.groupBy({ by: ["currentStatus"], where: scope, _count: { _all: true } }),
      tx.ticket.groupBy({ by: ["itPriority"], where: activeScope, _count: { _all: true } }),
      tx.ticket.findMany({ where: scope, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5, select: SUMMARY_SELECT }),
      tx.ticket.findMany({ where: { ...activeScope, itPriority: "URGENT" }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 5, select: SUMMARY_SELECT }),
      tx.actionTaken.count({
        where: { assigneeId: actor.id, state: { in: ["PLANNED", "IN_PROGRESS"] }, ticket: { is: { ...activeScope } } },
      }),
      tx.actionTaken.findMany({
        where: { assigneeId: actor.id, state: { in: ["PLANNED", "IN_PROGRESS"] }, ticket: { is: { ...activeScope } } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (actionPage - 1) * actionPageSize,
        take: actionPageSize,
        select: {
          id: true, description: true, state: true, createdAt: true,
          assignee: { select: { id: true, name: true, role: true, isActive: true } },
          ticket: { select: { ticketNumber: true, summary: true } },
        },
      }),
    ]);
    const statusCount = new Map(statusRows.map((row) => [row.currentStatus, row._count._all]));
    const priorityCount = new Map(priorityRows.map((row) => [row.itPriority, row._count._all]));
    const statusBuckets = ALL_STATUSES.map((status) => ({
      status,
      value: statusCount.get(status) ?? 0,
      drillDown: `/staff/tickets?status=${status}`,
    }));
    const priorityBuckets = [
      ...PRIORITIES.map((priority) => ({ priority, value: priorityCount.get(priority) ?? 0, drillDown: `/staff/tickets?statusGroup=active&itPriority=${priority}` })),
      { priority: "UNPRIORITIZED" as const, value: priorityCount.get(null) ?? 0, drillDown: "/staff/tickets?statusGroup=active&itPriority=UNPRIORITIZED" },
    ];
    return {
      asOf: window.asOf,
      windowStart: window.windowStartIso,
      displayTimeZone: "Asia/Bangkok" as const,
      metrics: {
        unassignedActive: metric(unassignedActive, "/staff/tickets?statusGroup=active&assignment=unassigned"),
        ownedActive: metric(ownedActive, "/staff/tickets?statusGroup=active&assignment=mine"),
        urgentActive: metric(urgentActive, "/staff/tickets?statusGroup=active&itPriority=URGENT"),
        myUnfinishedActions: metric(actionTotal, `/staff/dashboard?actionPage=${actionPage}#my-actions`),
      },
      statusBuckets,
      priorityBuckets,
      recentTickets: recent.map((row) => asSummary(row, "staff")),
      urgentTickets: urgent.map((row) => asSummary(row, "staff")),
      myActions: {
        items: actions.map((row) => ({
          id: row.id,
          description: row.description,
          state: row.state,
          createdAt: row.createdAt.toISOString(),
          assignee: {
            id: row.assignee.id,
            name: row.assignee.name,
            role: row.assignee.role,
            isActive: row.assignee.isActive,
          },
          ticketNumber: row.ticket.ticketNumber,
          ticketSummary: row.ticket.summary,
          href: `/staff/tickets/${row.ticket.ticketNumber}#action-${row.id}`,
        })),
        page: actionPage,
        pageSize: actionPageSize,
        total: actionTotal,
        totalPages: actionTotal === 0 ? 0 : Math.ceil(actionTotal / actionPageSize),
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 });
}
