import { performance } from "node:perf_hooks";
import { Prisma, PrismaClient, type CurrentStatus } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLab3Data, seedLab4Data } from "../../src/data-foundation.js";
import { requesterDashboard, staffDashboard, type DashboardPrisma } from "../../src/lab-04/dashboard-service.js";
import { allocateTicketNumber } from "../../src/ticket-number.js";
import { assertTestDatabaseUrl } from "../helpers/test-database.js";
import { deployMigrationHistory, resetGuardedTestDatabase } from "../helpers/lab4-migration-fixture.js";

const ACTIVE_STATUSES: CurrentStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
const RESOLVED_STATUSES: CurrentStatus[] = ["RESOLVED", "CLOSED"];
const ACTIVE_ACTION_STATES = ["PLANNED", "IN_PROGRESS"] as const;

describe.sequential("L4-07 PostgreSQL dashboard reconciliation and query budget", () => {
  let databaseUrl: string;
  let prisma: PrismaClient;
  let previousBootstrapPassword: string | undefined;

  beforeAll(async () => {
    databaseUrl = assertTestDatabaseUrl();
    previousBootstrapPassword = process.env.LAB3_TEST_INITIAL_PASSWORD;
    process.env.LAB3_TEST_INITIAL_PASSWORD ??= "lab4-dashboard-integration-only-12";
    await resetGuardedTestDatabase();
    deployMigrationHistory(databaseUrl, true);
    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
      log: [{ emit: "event", level: "query" }],
    });
    await seedLab3Data(prisma);
    await seedLab4Data(prisma);
  }, 120_000);

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (previousBootstrapPassword === undefined) delete process.env.LAB3_TEST_INITIAL_PASSWORD;
    else process.env.LAB3_TEST_INITIAL_PASSWORD = previousBootstrapPassword;
  });

  async function makeTicket(
    requester: { id: number; userId: number },
    refs: { categoryId: number; relatedSystemId: number; staffId: number },
    data: { status: CurrentStatus; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null; updatedAt: Date; resolvedAt?: Date | null },
  ) {
    const number = await allocateTicketNumber(prisma);
    return prisma.ticket.create({
      data: {
        ticketNumber: number.ticketNumber,
        ticketSequence: number.ticketSequence,
        requesterId: requester.id,
        requesterUserId: requester.userId,
        assignedStaffId: refs.staffId,
        categoryId: refs.categoryId,
        relatedSystemId: refs.relatedSystemId,
        summary: `L4-07 fixture ${data.status} ${number.ticketSequence}`,
        requestedPriority: "HIGH",
        description: "Isolated dashboard integration fixture.",
        itPriority: data.priority,
        currentStatus: data.status,
        clientRequestId: `lab4-dashboard-${number.ticketSequence}`,
        createdAt: data.updatedAt,
        updatedAt: data.updatedAt,
        resolvedAt: data.resolvedAt ?? null,
      },
    });
  }

  async function references() {
    const [requester, staff, category, relatedSystem] = await Promise.all([
      prisma.requester.findUnique({ where: { email: "jennifer@example.test" }, select: { id: true, userId: true } }),
      prisma.user.findFirst({ where: { role: "IT_STAFF", isActive: true }, orderBy: [{ email: "asc" }, { id: "asc" }], select: { id: true } }),
      prisma.category.findFirst({ orderBy: { id: "asc" }, select: { id: true } }),
      prisma.relatedSystem.findFirst({ orderBy: { id: "asc" }, select: { id: true } }),
    ]);
    expect(requester?.userId).not.toBeNull();
    expect(staff).not.toBeNull();
    expect(category).not.toBeNull();
    expect(relatedSystem).not.toBeNull();
    return { requester: requester!, staffId: staff!.id, categoryId: category!.id, relatedSystemId: relatedSystem!.id };
  }

  it("T-DB-DASH-01 reconciles session-scoped metrics with independent SQL and keeps a coherent repeatable-read snapshot", async () => {
    const refs = await references();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const boundaryWaiting = await makeTicket(refs.requester, refs, { status: "WAITING_FOR_REQUESTER", priority: "URGENT", updatedAt: windowStart });
    await makeTicket(refs.requester, refs, { status: "RESOLVED", priority: "HIGH", updatedAt: new Date(now.getTime() - 60_000), resolvedAt: windowStart });
    await makeTicket(refs.requester, refs, { status: "CLOSED", priority: null, updatedAt: new Date(now.getTime() - 60_000), resolvedAt: null });
    await makeTicket(refs.requester, refs, { status: "OPEN", priority: "LOW", updatedAt: now });

    const dashboard = await requesterDashboard(prisma as unknown as DashboardPrisma, { id: refs.requester.userId!, role: "REQUESTER" }, now);
    const [sqlMetrics] = await prisma.$queryRaw<Array<{ active: number; waiting: number; updated: number; resolved: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED'))::int AS active,
        COUNT(*) FILTER (WHERE t."currentStatus"='WAITING_FOR_REQUESTER')::int AS waiting,
        COUNT(*) FILTER (WHERE t."updatedAt">=(${windowStart} AT TIME ZONE 'UTC') AND t."updatedAt"<(${now} AT TIME ZONE 'UTC'))::int AS updated,
        COUNT(*) FILTER (WHERE t."currentStatus" IN ('RESOLVED','CLOSED') AND t."resolvedAt">=${windowStart} AND t."resolvedAt"<${now})::int AS resolved
      FROM "Ticket" t
      JOIN "Requester" r ON r."id"=t."requesterId"
      JOIN "User" ru ON ru."id"=t."requesterUserId"
      WHERE t."requesterId"=${refs.requester.id} AND t."requesterUserId"=${refs.requester.userId}
        AND r."isActive"=TRUE AND r."userId"=${refs.requester.userId} AND ru."isActive"=TRUE AND ru."role"='REQUESTER'
    `;
    expect(dashboard.metrics.activeTickets.value).toBe(sqlMetrics!.active);
    expect(dashboard.metrics.waitingForRequester.value).toBe(sqlMetrics!.waiting);
    expect(dashboard.metrics.updatedLast7Days.value).toBe(sqlMetrics!.updated);
    expect(dashboard.metrics.resolvedLast7Days.value).toBe(sqlMetrics!.resolved);
    expect(dashboard.metrics.activeTickets.drillDown).toBe("/tickets?statusGroup=active");
    expect(dashboard.metrics.resolvedLast7Days.drillDown).toContain("statusGroup=resolved");
    expect(dashboard.attentionTickets.some((ticket) => ticket.ticketNumber === boundaryWaiting.ticketNumber)).toBe(true);

    const separateConnection = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      const repeatableSnapshotPrisma = {
        $transaction: (callback: (tx: Prisma.TransactionClient) => Promise<unknown>, options?: Prisma.TransactionOptions) =>
          prisma.$transaction(async (tx) => {
            const wrappedTx = new Proxy(tx, {
              get(target, property, receiver) {
                if (property === "user") {
                  return new Proxy(target.user, {
                    get(userTarget, userProperty, userReceiver) {
                      const original = Reflect.get(userTarget, userProperty, userReceiver) as unknown;
                      if (userProperty !== "findFirst" || typeof original !== "function") return original;
                      return async (...args: unknown[]) => {
                        const identity = await (original as (...values: unknown[]) => Promise<unknown>).apply(userTarget, args);
                        await separateConnection.ticket.update({ where: { id: boundaryWaiting.id }, data: { currentStatus: "OPEN" } });
                        return identity;
                      };
                    },
                  });
                }
                return Reflect.get(target, property, receiver);
              },
            });
            return callback(wrappedTx);
          }, options),
      } as unknown as DashboardPrisma;
      const stable = await requesterDashboard(repeatableSnapshotPrisma, { id: refs.requester.userId!, role: "REQUESTER" }, now);
      const persisted = await prisma.ticket.findUnique({ where: { id: boundaryWaiting.id }, select: { currentStatus: true } });
      expect(persisted?.currentStatus).toBe("OPEN");
      expect(stable.metrics.waitingForRequester.value).toBe(sqlMetrics!.waiting);
      expect(stable.attentionTickets.some((ticket) => ticket.ticketNumber === boundaryWaiting.ticketNumber)).toBe(true);
    } finally {
      await separateConnection.$disconnect();
    }

    const staffDashboardData = await staffDashboard(prisma as unknown as DashboardPrisma, { id: refs.staffId, role: "IT_STAFF" }, 1, 5, now);
    const [staffMetrics] = await prisma.$queryRaw<Array<{ unassigned: number; owned: number; urgent: number; actions: number }>>`
      SELECT
        COUNT(*) FILTER (WHERE t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND t."assignedStaffId" IS NULL)::int AS unassigned,
        COUNT(*) FILTER (WHERE t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND t."assignedStaffId"=${refs.staffId})::int AS owned,
        COUNT(*) FILTER (WHERE t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND t."itPriority"='URGENT')::int AS urgent,
        (SELECT COUNT(*)::int FROM "ActionTaken" a JOIN "Ticket" at ON at."id"=a."ticketId" JOIN "Requester" ar ON ar."id"=at."requesterId" JOIN "User" aru ON aru."id"=at."requesterUserId"
          WHERE a."assigneeId"=${refs.staffId} AND a."state" IN ('PLANNED','IN_PROGRESS') AND at."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED') AND ar."isActive"=TRUE AND aru."isActive"=TRUE AND aru."role"='REQUESTER') AS actions
      FROM "Ticket" t
      JOIN "Requester" r ON r."id"=t."requesterId"
      JOIN "User" ru ON ru."id"=t."requesterUserId"
      WHERE r."isActive"=TRUE AND ru."isActive"=TRUE AND ru."role"='REQUESTER'
    `;
    expect(staffDashboardData.metrics.unassignedActive.value).toBe(staffMetrics!.unassigned);
    expect(staffDashboardData.metrics.ownedActive.value).toBe(staffMetrics!.owned);
    expect(staffDashboardData.metrics.urgentActive.value).toBe(staffMetrics!.urgent);
    expect(staffDashboardData.metrics.myUnfinishedActions.value).toBe(staffMetrics!.actions);
    expect(staffDashboardData.statusBuckets.reduce((sum, bucket) => sum + bucket.value, 0)).toBe(await prisma.ticket.count({ where: { requester: { is: { isActive: true, user: { is: { isActive: true, role: "REQUESTER" } } } } } }));
    expect(staffDashboardData.priorityBuckets.reduce((sum, bucket) => sum + bucket.value, 0)).toBe(await prisma.ticket.count({ where: { ...{ currentStatus: { in: ACTIVE_STATUSES } }, requester: { is: { isActive: true, user: { is: { isActive: true, role: "REQUESTER" } } } } } }));
    expect(RESOLVED_STATUSES).toEqual(["RESOLVED", "CLOSED"]);
  }, 60_000);

  it("T-PERF-01 stays within bounded query counts and p95 for 5,000 Tickets and 10,000 Actions", async () => {
    const refs = await references();
    const maxSequence = await prisma.$queryRaw<Array<{ value: bigint }>>`SELECT COALESCE(MAX("ticketSequence"),0)::bigint AS value FROM "Ticket"`;
    await prisma.$executeRaw`
      INSERT INTO "Ticket" (
        "ticketNumber","ticketSequence","requesterId","requesterUserId","assignedStaffId","categoryId","relatedSystemId",
        "summary","requestedPriority","description","itPriority","currentStatus","clientRequestId","createdAt","updatedAt"
      )
      SELECT 'TKT-2098-' || LPAD(g::text,6,'0'), ${maxSequence[0]!.value} + g,
        ${refs.requester.id},${refs.requester.userId},${refs.staffId},${refs.categoryId},${refs.relatedSystemId},
        'L4-07 performance fixture ' || g,'HIGH','Isolated performance fixture','URGENT','OPEN',
        'lab4-perf-ticket-' || g, CURRENT_TIMESTAMP - INTERVAL '1 day', CURRENT_TIMESTAMP - INTERVAL '1 day'
      FROM generate_series(1,5000) AS g
    `;
    await prisma.$executeRaw`
      INSERT INTO "ActionTaken" (
        "ticketId","clientRequestId","payloadFingerprint","createdById","assigneeId","description","state","createdAt","updatedAt"
      )
      SELECT t."id", MD5(t."id"::text || ':' || g)::uuid, REPEAT('a',64), ${refs.staffId},${refs.staffId},
        'L4-07 performance Action fixture','PLANNED',CURRENT_TIMESTAMP - INTERVAL '1 hour',CURRENT_TIMESTAMP - INTERVAL '1 hour'
      FROM "Ticket" t JOIN LATERAL generate_series(1,2) AS g ON TRUE
      WHERE t."clientRequestId" LIKE 'lab4-perf-ticket-%'
    `;
    const [fixtureCounts] = await prisma.$queryRaw<Array<{ tickets: bigint; actions: bigint }>>`
      SELECT (SELECT COUNT(*) FROM "Ticket" WHERE "clientRequestId" LIKE 'lab4-perf-ticket-%')::bigint AS tickets,
        (SELECT COUNT(*) FROM "ActionTaken" a JOIN "Ticket" t ON t."id"=a."ticketId" WHERE t."clientRequestId" LIKE 'lab4-perf-ticket-%')::bigint AS actions
    `;
    expect(fixtureCounts).toEqual({ tickets: 5000n, actions: 10000n });

    const queryStatements: string[] = [];
    prisma.$on("query", (event) => { queryStatements.push(event.query); });
    const queryCount = async (run: () => Promise<unknown>) => {
      const start = queryStatements.length;
      await run();
      return queryStatements.slice(start).filter((query) => /^\s*(SELECT|WITH)\b/i.test(query)).length;
    };
    const requesterRun = () => requesterDashboard(prisma as unknown as DashboardPrisma, { id: refs.requester.userId!, role: "REQUESTER" }, new Date());
    const staffRun = () => staffDashboard(prisma as unknown as DashboardPrisma, { id: refs.staffId, role: "IT_STAFF" }, 1, 5, new Date());
    let requesterQueries = 0;
    let staffQueries = 0;
    for (let index = 0; index < 5; index += 1) {
      requesterQueries = await queryCount(requesterRun);
      staffQueries = await queryCount(staffRun);
    }
    const requesterTimes: number[] = [];
    const staffTimes: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      let start = performance.now();
      requesterQueries = await queryCount(requesterRun);
      requesterTimes.push(performance.now() - start);
      start = performance.now();
      staffQueries = await queryCount(staffRun);
      staffTimes.push(performance.now() - start);
    }
    const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
    expect(requesterQueries).toBeLessThanOrEqual(8);
    expect(staffQueries).toBeLessThanOrEqual(14);
    expect(p95(requesterTimes)).toBeLessThanOrEqual(500);
    expect(p95(staffTimes)).toBeLessThanOrEqual(500);

    const [explain] = await prisma.$queryRaw<Array<{ "QUERY PLAN": unknown }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT a."id" FROM "ActionTaken" a JOIN "Ticket" t ON t."id"=a."ticketId"
      JOIN "Requester" r ON r."id"=t."requesterId" JOIN "User" ru ON ru."id"=t."requesterUserId"
      WHERE a."assigneeId"=${refs.staffId} AND a."state" IN ('PLANNED','IN_PROGRESS')
        AND t."currentStatus" IN ('NEW','OPEN','IN_PROGRESS','WAITING_FOR_REQUESTER','REOPENED')
        AND r."isActive"=TRUE AND ru."isActive"=TRUE AND ru."role"='REQUESTER'
      ORDER BY a."createdAt" ASC,a."id" ASC LIMIT 5
    `;
    console.info(`[T-PERF-01] ${JSON.stringify({ requesterQueryCount: requesterQueries, staffQueryCount: staffQueries, requesterP95Ms: Number(p95(requesterTimes).toFixed(2)), staffP95Ms: Number(p95(staffTimes).toFixed(2)), fixtureCounts: { tickets: fixtureCounts!.tickets.toString(), actions: fixtureCounts!.actions.toString() }, explain: explain!["QUERY PLAN"] })}`);
  }, 120_000);
});
