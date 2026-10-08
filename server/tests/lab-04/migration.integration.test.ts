import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";
import {
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
      expect(columns.find(({ column_name }) => column_name === "workflowVersion")).toMatchObject({ is_nullable: "NO" });
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
    const beforeClient = createTestPrisma();
    let before: Record<string, string>;
    let maxTicketSequence: bigint;
    try {
      ({ maxTicketSequence } = await insertLab3PreservationFixture(beforeClient));
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
      const beforeRows = await snapshotLab3Rows(prisma);
      await prisma.$executeRawUnsafe(`UPDATE "User" SET "isActive"=false,"passwordHash"='changed-test-hash' WHERE "email"='support.one@example.test'`);
      await prisma.$executeRawUnsafe(`UPDATE "Ticket" SET "currentStatus"='CANCELLED',"workflowVersion"=9 WHERE "id"=(SELECT "id" FROM "Ticket" WHERE "clientRequestId" LIKE 'lab4-seed-%' ORDER BY "id" LIMIT 1)`);
      await prisma.$executeRawUnsafe(`UPDATE "ActionTaken" SET "description"='user-edited test fixture' WHERE "id"=(SELECT "id" FROM "ActionTaken" ORDER BY "id" LIMIT 1)`);
      const changed = await prisma.$queryRawUnsafe<Array<{ id: number; description: string }>>(`SELECT "id","description" FROM "ActionTaken" ORDER BY "id" LIMIT 1`);
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
      expect(await prisma.$queryRawUnsafe(`SELECT "currentStatus","workflowVersion" FROM "Ticket" WHERE "clientRequestId" LIKE 'lab4-seed-%' LIMIT 1`)).toEqual([{ currentStatus: "CANCELLED", workflowVersion: 9 }]);
      expect(beforeRows).toBeDefined();
    } finally {
      if (oldPassword === undefined) delete process.env.LAB3_TEST_INITIAL_PASSWORD;
      else process.env.LAB3_TEST_INITIAL_PASSWORD = oldPassword;
      await prisma.$disconnect();
    }
  });

  it("T-MIG-04 enforces child constraints and rolls back a failed multi-row write", async () => {
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
    } finally {
      await prisma.$disconnect();
    }
  });

  it("T-MIG-05 refuses missing or non-test database URLs independently of NODE_ENV", () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL_TEST is required/i);
      expect(() => assertTestDatabaseUrl("postgresql://localhost:5432/toktickit")).toThrow(/non-test database/i);
      expect(assertTestDatabaseUrl("postgresql://localhost:5432/toktickit_lab4_test")).toContain("toktickit_lab4_test");
    } finally {
      if (original === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = original;
    }
  });
});
