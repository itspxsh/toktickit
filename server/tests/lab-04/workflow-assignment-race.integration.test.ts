import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Request } from "express";
import { seedLab3Data, seedLab4Data } from "../../src/data-foundation.js";
import { assignTicket } from "../../src/lab-04/workflow-service.js";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";
import { deployMigrationHistory, resetGuardedTestDatabase } from "../helpers/lab4-migration-fixture.js";

describe.sequential("L4-06 PostgreSQL assignment/deactivation race", () => {
  let url: string;
  let prisma: PrismaClient;
  let previousPassword: string | undefined;

  beforeAll(async () => {
    url = assertTestDatabaseUrl();
    previousPassword = process.env.LAB3_TEST_INITIAL_PASSWORD;
    process.env.LAB3_TEST_INITIAL_PASSWORD ??= "test-only-initial-password";
    await resetGuardedTestDatabase();
    deployMigrationHistory(url, true);
    prisma = createTestPrisma();
    await seedLab3Data(prisma);
    await seedLab4Data(prisma);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (previousPassword === undefined) delete process.env.LAB3_TEST_INITIAL_PASSWORD;
    else process.env.LAB3_TEST_INITIAL_PASSWORD = previousPassword;
  });

  it("T-RACE-03 waits for candidate deactivation and never assigns an inactive support user", async () => {
    const candidate = await prisma.user.findFirst({
      where: { role: "IT_STAFF", isActive: true },
      select: { id: true },
    });
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    const ticketSeed = await prisma.ticket.findUnique({
      where: { clientRequestId: "lab4-seed-ticket-open" },
      select: { id: true, ticketNumber: true },
    });
    expect(candidate).not.toBeNull();
    expect(admin).not.toBeNull();
    expect(ticketSeed).not.toBeNull();
    const ticket = await prisma.ticket.update({
      where: { id: ticketSeed!.id },
      data: { currentStatus: "OPEN", assignedStaffId: null, workflowVersion: 40 },
      select: { id: true, ticketNumber: true, workflowVersion: true },
    });

    const blocker = new PrismaClient({ datasources: { db: { url } } });
    const assigner = new PrismaClient({ datasources: { db: { url } } });
    let releaseDeactivation!: () => void;
    let locked!: () => void;
    const deactivationReady = new Promise<void>((resolve) => { releaseDeactivation = resolve; });
    const lockReady = new Promise<void>((resolve) => { locked = resolve; });
    const deactivation = blocker.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate!.id} FOR UPDATE`;
      await tx.user.update({ where: { id: candidate!.id }, data: { isActive: false } });
      locked();
      await deactivationReady;
    });
    await lockReady;

    const request = { auth: { user: { id: admin!.id, role: "ADMIN" } } } as unknown as Request;
    const assignment = assignTicket(assigner, request, {
      ticketNumber: ticket.ticketNumber,
      assignedStaffId: candidate!.id,
      role: "ADMIN",
      expectedTicketVersion: ticket.workflowVersion,
    });

    try {
      // Observe PostgreSQL's lock wait instead of relying on a timing-only sleep.
      let waitingForUserLock = false;
      for (let attempt = 0; attempt < 100 && !waitingForUserLock; attempt += 1) {
        const sessions = await prisma.$queryRaw<Array<{ wait_event_type: string | null; query: string }>>`
          SELECT wait_event_type, query
          FROM pg_stat_activity
          WHERE datname = current_database()
            AND pid <> pg_backend_pid()
            AND state = 'active'
            AND query ILIKE '%FROM "User"%FOR UPDATE%'
        `;
        waitingForUserLock = sessions.some((session) => session.wait_event_type === "Lock");
        if (!waitingForUserLock) await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waitingForUserLock).toBe(true);
    } finally {
      releaseDeactivation();
    }

    await deactivation;
    await expect(assignment).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fieldErrors: { assigneeId: "Choose an active support user." },
    });
    const [afterTicket, afterCandidate] = await Promise.all([
      prisma.ticket.findUnique({ where: { id: ticket.id }, select: { assignedStaffId: true, workflowVersion: true } }),
      prisma.user.findUnique({ where: { id: candidate!.id }, select: { isActive: true } }),
    ]);
    expect(afterCandidate?.isActive).toBe(false);
    expect(afterTicket).toEqual({ assignedStaffId: null, workflowVersion: ticket.workflowVersion });
    await Promise.all([blocker.$disconnect(), assigner.$disconnect()]);
  });
});
