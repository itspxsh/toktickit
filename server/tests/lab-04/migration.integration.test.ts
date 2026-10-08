import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";
import {
  cloneGuardedTestDatabase,
  createAttachmentFixtureFile,
  deployMigrationHistory,
  insertLab3PreservationFixture,
  lab4MigrationPath,
  resetGuardedTestDatabase,
  snapshotLab3Rows,
} from "../helpers/lab4-migration-fixture.js";

const testDatabaseUrl = () => assertTestDatabaseUrl();

async function tableNames(): Promise<string[]> {
  const prisma = createTestPrisma();
  try {
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name
    `;
    return rows.map(({ table_name }) => table_name);
  } finally {
    await prisma.$disconnect();
  }
}

describe.sequential("L4-03 migration and deterministic seed foundation", () => {
  it("T-MIG-01 deploys the full unchanged migration chain on a fresh guarded database", async () => {
    const url = testDatabaseUrl();
    await resetGuardedTestDatabase();
    deployMigrationHistory(url, true);
    const prisma = createTestPrisma();
    try {
      const names = await tableNames();
      expect(names).toEqual(expect.arrayContaining(["ActionTaken", "ActionRevision", "TicketStatusEvent"]));
      const columns = await prisma.$queryRaw<Array<{ column_name: string; column_default: string | null; is_nullable: string }>>`
        SELECT column_name, column_default, is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Ticket' AND column_name IN ('workflowVersion','resolvedAt')
        ORDER BY column_name
      `;
      expect(columns).toHaveLength(2);
      expect(columns.find(({ column_name }) => column_name === "workflowVersion")).toMatchObject({
        is_nullable: "NO",
        column_default: "1",
      });
      expect(columns.find(({ column_name }) => column_name === "resolvedAt")).toMatchObject({ is_nullable: "YES" });
      const enums = await prisma.$queryRaw<Array<{ type_name: string; enumlabel: string }>>`
        SELECT t.typname AS type_name, e.enumlabel
        FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
        WHERE t.typname IN ('ActionState','ActionRevisionKind')
        ORDER BY t.typname, e.enumsortorder
      `;
      expect(enums).toEqual([
        ...["CREATE", "EDIT", "ASSIGN", "START", "COMPLETE", "CANCEL"].map((enumlabel) => ({ type_name: "ActionRevisionKind", enumlabel })),
        ...["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].map((enumlabel) => ({ type_name: "ActionState", enumlabel })),
      ]);
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes WHERE schemaname='public'
          AND tablename IN ('Ticket','ActionTaken','ActionRevision','TicketStatusEvent')
      `;
      expect(indexes.map(({ indexname }) => indexname)).toEqual(expect.arrayContaining([
        "Ticket_requesterUserId_resolvedAt_id_idx",
        "Ticket_currentStatus_resolvedAt_id_idx",
        "ActionTaken_ticketId_clientRequestId_key",
        "ActionTaken_ticketId_createdAt_id_idx",
        "ActionTaken_assigneeId_state_createdAt_id_idx",
        "ActionRevision_actionId_version_key",
        "TicketStatusEvent_ticketId_createdAt_id_idx",
      ]));
      const constraints = await prisma.$queryRaw<Array<{ conname: string; contype: string; confdeltype: string; confupdtype: string }>>`
        SELECT conname, contype, confdeltype::text, confupdtype::text
        FROM pg_constraint WHERE conrelid IN ('"ActionTaken"'::regclass, '"ActionRevision"'::regclass, '"TicketStatusEvent"'::regclass)
      `;
      expect(constraints.map(({ conname }) => conname)).toEqual(expect.arrayContaining([
        "ActionTaken_version_positive_check",
        "ActionTaken_description_bounds_check",
        "ActionTaken_followUpRequired_note_check",
        "ActionTaken_terminal_metadata_check",
        "ActionRevision_version_positive_check",
        "ActionRevision_snapshot_object_check",
        "TicketStatusEvent_distinct_status_check",
        "ActionTaken_ticketId_fkey",
        "ActionTaken_createdById_fkey",
        "ActionTaken_assigneeId_fkey",
        "ActionTaken_performedById_fkey",
        "ActionRevision_actionId_fkey",
        "ActionRevision_actorId_fkey",
        "TicketStatusEvent_ticketId_fkey",
        "TicketStatusEvent_actorId_fkey",
      ]));
      for (const foreignKey of constraints.filter(({ contype }) => contype === "f")) {
        expect(foreignKey).toMatchObject({ confdeltype: "r", confupdtype: "c" });
      }
      const migration = lab4MigrationPath();
      expect(migration).toBeTruthy();
    } finally {
      await prisma.$disconnect();
    }
  });

  it("T-MIG-02 upgrades through Lab 3 without changing earlier rows, relations, sequence, or attachment bytes", async () => {
    const url = testDatabaseUrl();
    await resetGuardedTestDatabase();
    deployMigrationHistory(url, false);
    const file = createAttachmentFixtureFile();
    const fileHashBefore = file.hashNow();
    const beforeClient = createTestPrisma();
    let before: Record<string, string>;
    let maxTicketSequence: bigint;
    try {
      ({ maxTicketSequence } = await insertLab3PreservationFixture(beforeClient, file.storageKey));
      before = await snapshotLab3Rows(beforeClient);
    } finally {
      await beforeClient.$disconnect();
    }
    try {
      deployMigrationHistory(url, true);
      const afterClient = createTestPrisma();
      try {
        const after = await snapshotLab3Rows(afterClient);
        expect(after).toEqual(before!);
        expect(file.hash).toMatch(/^[a-f0-9]{64}$/);
        expect(file.hashNow()).toBe(fileHashBefore);
        const actionCount = await afterClient.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`;
        const eventCount = await afterClient.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TicketStatusEvent"`;
        expect(actionCount[0].count).toBe(0n);
        expect(eventCount[0].count).toBe(0n);
        const next = await afterClient.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('ticket_number_seq') AS value`;
        expect(next[0].value).toBeGreaterThan(maxTicketSequence!);
      } finally {
        await afterClient.$disconnect();
      }
    } finally {
      file.cleanup();
    }
  });

  it("T-MIG-03 reruns create-only fixtures without duplicates or overwriting existing identity or work", async () => {
    const url = testDatabaseUrl();
    await resetGuardedTestDatabase();
    deployMigrationHistory(url, true);
    const oldPassword = process.env.LAB3_TEST_INITIAL_PASSWORD;
    process.env.LAB3_TEST_INITIAL_PASSWORD ??= randomBytes(32).toString("base64url");
    const prisma = createTestPrisma();
    try {
      const foundation = await import("../../src/data-foundation.js") as unknown as Record<string, unknown>;
      const seedLab3Data = foundation.seedLab3Data as (client: typeof prisma) => Promise<void>;
      const seedLab4Data = foundation.seedLab4Data as (client: typeof prisma) => Promise<void>;
      expect(seedLab4Data).toBeTypeOf("function");
      await seedLab3Data(prisma);
      await seedLab4Data(prisma);
      const users = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "User"`;
      const tickets = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "Ticket"`;
      const actions = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`;
      const statusRows = await prisma.$queryRaw<Array<{ currentStatus: string }>>`SELECT DISTINCT "currentStatus" FROM "Ticket" ORDER BY "currentStatus"`;
      expect(statusRows.map(({ currentStatus }) => currentStatus)).toEqual([
        "NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED",
      ]);
      const priorityRows = await prisma.$queryRaw<Array<{ itPriority: string | null }>>`SELECT DISTINCT "itPriority" FROM "Ticket" ORDER BY "itPriority" NULLS FIRST`;
      expect(priorityRows.map(({ itPriority }) => itPriority)).toEqual([null, "LOW", "MEDIUM", "HIGH", "URGENT"]);
      const actionCounts = await prisma.$queryRaw<Array<{ state: string; count: bigint }>>`SELECT "state", COUNT(*)::bigint AS count FROM "ActionTaken" GROUP BY "state" ORDER BY "state"`;
      expect(actionCounts).toEqual([
        { state: "PLANNED", count: 1n },
        { state: "IN_PROGRESS", count: 1n },
        { state: "COMPLETED", count: 1n },
        { state: "CANCELLED", count: 1n },
      ]);
      const actionRevisions = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionRevision"`;
      expect(actionRevisions[0].count).toBe(4n);
      const actionDistribution = await prisma.$queryRaw<Array<{ clientRequestId: string; count: bigint }>>`
        SELECT t."clientRequestId", COUNT(a."id")::bigint AS count
        FROM "Ticket" t LEFT JOIN "ActionTaken" a ON a."ticketId"=t."id"
        WHERE t."clientRequestId" IN ('lab4-seed-ticket-new','lab4-seed-ticket-open','lab4-seed-ticket-in_progress')
        GROUP BY t."clientRequestId" ORDER BY t."clientRequestId"
      `;
      expect(actionDistribution).toEqual([
        { clientRequestId: "lab4-seed-ticket-in_progress", count: 1n },
        { clientRequestId: "lab4-seed-ticket-new", count: 0n },
        { clientRequestId: "lab4-seed-ticket-open", count: 3n },
      ]);
      const openTicketOwner = await prisma.$queryRaw<Array<{ requesterUserId: number; assignedStaffId: number | null }>>`
        SELECT "requesterUserId","assignedStaffId" FROM "Ticket" WHERE "clientRequestId"='lab4-seed-ticket-open'
      `;
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "isActive"=false,"passwordHash"='changed-test-hash' WHERE "email"='support.one@example.test'`);
      await prisma.$executeRawUnsafe(`UPDATE "Ticket" SET "currentStatus"='CANCELLED',"workflowVersion"=9 WHERE "clientRequestId"='lab4-seed-ticket-open'`);
      const actionKey = (await prisma.$queryRaw<Array<{ clientRequestId: string }>>`SELECT "clientRequestId" FROM "ActionTaken" WHERE "ticketId"=(SELECT id FROM "Ticket" WHERE "clientRequestId"='lab4-seed-ticket-open') ORDER BY id LIMIT 1`)[0]!.clientRequestId;
      await prisma.$executeRawUnsafe(`UPDATE "ActionTaken" SET "description"='user-edited test fixture' WHERE "clientRequestId"='${actionKey}'`);
      const changed = await prisma.$queryRawUnsafe<Array<{ id: number; description: string }>>(`SELECT "id","description" FROM "ActionTaken" WHERE "clientRequestId"='${actionKey}'`);
      await seedLab3Data(prisma);
      await seedLab4Data(prisma);
      const afterUsers = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "User"`;
      const afterTickets = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "Ticket"`;
      const afterActions = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`;
      expect(afterUsers).toEqual(users);
      expect(afterTickets).toEqual(tickets);
      expect(afterActions).toEqual(actions);
      expect(await prisma.$queryRawUnsafe(`SELECT "id","description" FROM "ActionTaken" WHERE "id"=${changed[0]?.id}`)).toEqual(changed);
      expect(await prisma.$queryRawUnsafe(`SELECT "isActive","passwordHash" FROM "User" WHERE "email"='support.one@example.test'`)).toEqual([{ isActive: false, passwordHash: "changed-test-hash" }]);
      expect(await prisma.$queryRawUnsafe(`SELECT "currentStatus","workflowVersion" FROM "Ticket" WHERE "clientRequestId"='lab4-seed-ticket-open'`)).toEqual([{ currentStatus: "CANCELLED", workflowVersion: 9 }]);
      expect(await prisma.$queryRawUnsafe(`SELECT "requesterUserId","assignedStaffId" FROM "Ticket" WHERE "clientRequestId"='lab4-seed-ticket-open'`)).toEqual(openTicketOwner);
    } finally {
      if (oldPassword === undefined) delete process.env.LAB3_TEST_INITIAL_PASSWORD;
      else process.env.LAB3_TEST_INITIAL_PASSWORD = oldPassword;
      await prisma.$disconnect();
    }
  });

  it("T-MIG-04 enforces child constraints, rolls back failed writes, and restores a guarded snapshot", async () => {
    const url = testDatabaseUrl();
    await resetGuardedTestDatabase();
    deployMigrationHistory(url, true);
    const prisma = createTestPrisma();
    try {
      const foundation = await import("../../src/data-foundation.js") as unknown as Record<string, unknown>;
      process.env.LAB3_TEST_INITIAL_PASSWORD ??= randomBytes(32).toString("base64url");
      await (foundation.seedLab3Data as (client: typeof prisma) => Promise<void>)(prisma);
      const ticket = await prisma.$queryRaw<Array<{ id: number }>>`SELECT id FROM "Ticket" ORDER BY id LIMIT 1`;
      const user = await prisma.$queryRaw<Array<{ id: number }>>`SELECT id FROM "User" WHERE role='ADMIN' ORDER BY id LIMIT 1`;
      const invalidInsert = `INSERT INTO "ActionTaken" ("ticketId","clientRequestId","payloadFingerprint","createdById","assigneeId","description","followUpRequired","followUpNote","state","version") VALUES (${ticket[0].id},'${randomUUID()}','fingerprint',${user[0].id},${user[0].id},'',true,'','PLANNED',0)`;
      await expect(prisma.$executeRawUnsafe(invalidInsert)).rejects.toThrow();
      const before = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`;
      await expect(prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `INSERT INTO "ActionTaken" ("ticketId","clientRequestId","payloadFingerprint","createdById","assigneeId","description","state") VALUES (${ticket[0].id},'${randomUUID()}','fingerprint',${user[0].id},${user[0].id},'Rollback fixture','PLANNED')`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO "ActionRevision" ("actionId","version","actorId","kind","snapshot") VALUES (-1,1,${user[0].id},'CREATE','{}'::jsonb)`);
      })).rejects.toThrow();
      const after = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`;
      expect(after).toEqual(before);

      const preservedRows = await snapshotLab3Rows(prisma);
      const preservedActions = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`;
      const preservedRevisions = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionRevision"`;
      const preservedEvents = await prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TicketStatusEvent"`;
      await prisma.$disconnect();

      const originalTestUrl = process.env.DATABASE_URL_TEST;
      const recovery = await cloneGuardedTestDatabase(url);
      try {
        process.env.DATABASE_URL_TEST = recovery.url;
        const restored = createTestPrisma();
        try {
          const database = await restored.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
          expect(database[0]?.current_database).toBe(decodeURIComponent(new URL(recovery.url).pathname.slice(1)));
          expect(await snapshotLab3Rows(restored)).toEqual(preservedRows);
          expect(await restored.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionTaken"`).toEqual(preservedActions);
          expect(await restored.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "ActionRevision"`).toEqual(preservedRevisions);
          expect(await restored.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "TicketStatusEvent"`).toEqual(preservedEvents);
          const migration = await restored.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
            SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1
          `;
          expect(migration[0]).toMatchObject({ migration_name: expect.stringMatching(/_lab4_actions_workflow$/), finished_at: expect.any(Date) });
        } finally {
          await restored.$disconnect();
        }
      } finally {
        if (originalTestUrl === undefined) delete process.env.DATABASE_URL_TEST;
        else process.env.DATABASE_URL_TEST = originalTestUrl;
        await recovery.cleanup();
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it("T-MIG-05 refuses missing or non-test database URLs independently of NODE_ENV", () => {
    const original = process.env.NODE_ENV;
    const originalDatabaseUrl = process.env.DATABASE_URL_TEST;
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL_TEST;
    try {
      expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL_TEST is required/i);
      expect(() => assertTestDatabaseUrl("postgresql://localhost:5432/toktickit")).toThrow(/non-test database/i);
      expect(assertTestDatabaseUrl("postgresql://localhost:5432/toktickit_lab4_test")).toContain("toktickit_lab4_test");
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL_TEST;
      else process.env.DATABASE_URL_TEST = originalDatabaseUrl;
    }
  });
});
