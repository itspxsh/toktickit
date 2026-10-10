import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLab3Data, seedLab4Data } from "../../src/data-foundation.js";
import { ActionRuleError } from "../../src/lab-04/action-rules.js";
import { updateAction } from "../../src/lab-04/action-service.js";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";
import { deployMigrationHistory, resetGuardedTestDatabase } from "../helpers/lab4-migration-fixture.js";

describe.sequential("L4-04 PostgreSQL Action concurrency", () => {
  let url: string;
  let prisma: PrismaClient;
  let previousPassword: string | undefined;

  beforeAll(async () => {
    // Fail before any reset/deploy unless the configured DB is explicitly
    // test-scoped; this suite never falls back to DATABASE_URL.
    url = assertTestDatabaseUrl();
    previousPassword = process.env.LAB3_TEST_INITIAL_PASSWORD;
    process.env.LAB3_TEST_INITIAL_PASSWORD ??= randomBytes(32).toString("base64url");
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

  it("T-ACT-08 rolls back Action and Ticket versions when revision insertion fails", async () => {
    const ticket = await prisma.ticket.findUnique({
      where: { clientRequestId: "lab4-seed-ticket-open" },
      select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
    });
    expect(ticket).not.toBeNull();
    const action = await prisma.actionTaken.findFirst({ where: { ticketId: ticket!.id, state: "PLANNED" }, orderBy: { id: "asc" } });
    expect(action).not.toBeNull();
    const beforeRevisionCount = await prisma.actionRevision.count({ where: { actionId: action!.id } });
    const ctx = {
      ticket: ticket!,
      ticketNumber: ticket!.ticketNumber,
      // Stay within PostgreSQL INT4 while using an ID guaranteed not to exist.
      actorId: 2_147_483_647,
    };

    await expect(updateAction(prisma, ctx, action!.id, {
      expectedTicketVersion: ticket!.workflowVersion,
      expectedVersion: action!.version,
      changes: { description: "This edit must roll back with its revision" },
    })).rejects.toMatchObject({ code: "P2003" });

    const [afterAction, afterTicket, afterRevisionCount] = await Promise.all([
      prisma.actionTaken.findUnique({ where: { id: action!.id } }),
      prisma.ticket.findUnique({ where: { id: ticket!.id }, select: { workflowVersion: true } }),
      prisma.actionRevision.count({ where: { actionId: action!.id } }),
    ]);
    expect(afterAction).toMatchObject({ description: action!.description, version: action!.version });
    expect(afterTicket?.workflowVersion).toBe(ticket!.workflowVersion);
    expect(afterRevisionCount).toBe(beforeRevisionCount);
  });

  it("T-RACE-01 serializes concurrent edits to one Action across independent PostgreSQL connections", async () => {
    const ticket = await prisma.ticket.findUnique({
      where: { clientRequestId: "lab4-seed-ticket-open" },
      select: { id: true, ticketNumber: true, workflowVersion: true, currentStatus: true, assignedStaffId: true },
    });
    expect(ticket).not.toBeNull();
    const action = await prisma.actionTaken.findFirst({ where: { ticketId: ticket!.id, state: "PLANNED" }, orderBy: { id: "asc" } });
    expect(action).not.toBeNull();
    const actor = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, select: { id: true } });
    expect(actor).not.toBeNull();

    const connectionA = new PrismaClient({ datasources: { db: { url } } });
    const connectionB = new PrismaClient({ datasources: { db: { url } } });
    const context = {
      ticket: ticket!,
      ticketNumber: ticket!.ticketNumber,
      actorId: actor!.id,
    };
    const revisionsBefore = await prisma.actionRevision.count({ where: { actionId: action!.id } });
    try {
      const outcomes = await Promise.allSettled([
        updateAction(connectionA, context, action!.id, {
          expectedTicketVersion: ticket!.workflowVersion,
          expectedVersion: action!.version,
          changes: { description: "Concurrent edit from connection A" },
        }),
        updateAction(connectionB, context, action!.id, {
          expectedTicketVersion: ticket!.workflowVersion,
          expectedVersion: action!.version,
          changes: { description: "Concurrent edit from connection B" },
        }),
      ]);
      expect(outcomes.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find(({ status }) => status === "rejected");
      expect(rejected?.status).toBe("rejected");
      if (rejected?.status === "rejected") {
        expect(rejected.reason).toBeInstanceOf(ActionRuleError);
        expect(rejected.reason).toMatchObject({ status: 409, code: "STALE_WRITE" });
      }

      const [afterAction, afterTicket, revisionsAfter] = await Promise.all([
        prisma.actionTaken.findUnique({ where: { id: action!.id } }),
        prisma.ticket.findUnique({ where: { id: ticket!.id }, select: { workflowVersion: true } }),
        prisma.actionRevision.count({ where: { actionId: action!.id } }),
      ]);
      expect(afterAction?.version).toBe(action!.version + 1);
      expect(["Concurrent edit from connection A", "Concurrent edit from connection B"]).toContain(afterAction?.description);
      expect(afterTicket?.workflowVersion).toBe(ticket!.workflowVersion + 1);
      expect(revisionsAfter).toBe(revisionsBefore + 1);
    } finally {
      await Promise.all([connectionA.$disconnect(), connectionB.$disconnect()]);
    }
  });
});
