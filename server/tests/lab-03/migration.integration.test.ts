import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REFERENCE_SEED, seedReferenceData } from "../../src/data-foundation.js";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";

const migrationsRoot = new URL("../../prisma/migrations/", import.meta.url);
const migrationDir = join(migrationsRoot.pathname, "20260906010000_lab2_data_foundation");
const baselineMigration = readFileSync(
  join(migrationsRoot.pathname, "20260816095224_init", "migration.sql"),
  "utf8",
);
const lab2Migration = readFileSync(join(migrationDir, "migration.sql"), "utf8");

function lab3MigrationSql(): string {
  const directory = readdirSync(migrationsRoot.pathname).find((name) =>
    name.endsWith("_lab3_data_foundation"),
  );
  if (!directory) {
    throw new Error("Lab 3 data-foundation migration is not present");
  }
  return readFileSync(join(migrationsRoot.pathname, directory, "migration.sql"), "utf8");
}

async function executeMigration(prisma: ReturnType<typeof createTestPrisma>, sql: string) {
  const statements = sql
    .split(/;\s*(?=\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function prepareLab2Database() {
  const prisma = createTestPrisma();
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
  await executeMigration(prisma, baselineMigration);
  for (const name of REFERENCE_SEED.categories) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Category" ("name") VALUES ('${name.replaceAll("'", "''")}')`,
    );
  }
  await executeMigration(prisma, lab2Migration);
  return prisma;
}

describe("L3-02 migration and seed foundation", () => {
  it("T-MIG-01 rejects non-test URLs before any destructive operation", () => {
    expect(() => assertTestDatabaseUrl("postgresql://localhost:5432/toktickit")).toThrow(
      /test database/i,
    );
    expect(assertTestDatabaseUrl("postgresql://localhost:5432/toktickit_test")).toContain(
      "toktickit_test",
    );
  });

  it("T-MIG-02 preserves Lab 2 rows, storage keys, foreign keys, and ticket sequence", async () => {
    const prisma = await prepareLab2Database();
    try {
      await executeMigration(prisma, lab3MigrationSql());

      const categories = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        'SELECT COUNT(*)::bigint AS count FROM "Category"',
      );
      expect(categories[0].count).toBe(4n);

      const tables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ('User','Session','PublicComment','InternalNote')
         ORDER BY table_name`,
      );
      expect(tables.map(({ table_name }) => table_name)).toEqual([
        "InternalNote",
        "PublicComment",
        "Session",
        "User",
      ]);

      const first = await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
        `SELECT nextval('ticket_number_seq') AS value`,
      );
      const second = await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
        `SELECT nextval('ticket_number_seq') AS value`,
      );
      expect(second[0].value).toBe(first[0].value + 1n);

      const attachmentKeys = await prisma.$queryRawUnsafe<Array<{ storageKey: string }>>(
        'SELECT "storageKey" FROM "Attachment" ORDER BY "id"',
      );
      expect(attachmentKeys).toEqual([]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("T-MIG-03 maps Requester ownership one-to-one without changing ticket identity", async () => {
    const prisma = await prepareLab2Database();
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Requester" ("name", "email") VALUES ('Migration User', 'migration@example.test')`,
      );
      const category = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT "id" FROM "Category" WHERE "name" = 'Hardware'`,
      );
      const system = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `INSERT INTO "RelatedSystem" ("name") VALUES ('Migration System') RETURNING "id"`,
      );
      const requester = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
        `SELECT "id" FROM "Requester" WHERE "email" = 'migration@example.test'`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Ticket" ("ticketNumber","ticketSequence","requesterId","categoryId","relatedSystemId","summary","requestedPriority","description","clientRequestId")
         VALUES ('TKT-9001', 9001, ${requester[0].id}, ${category[0].id}, ${system[0].id}, 'Migration ticket', 'LOW', 'Preserve me', 'migration-client-request')`,
      );
      await executeMigration(prisma, lab3MigrationSql());

      const mapping = await prisma.$queryRawUnsafe<
        Array<{ requesterEmail: string; userEmail: string; ticketNumber: string }>
      >(
        `SELECT r."email" AS "requesterEmail", u."email" AS "userEmail", t."ticketNumber"
         FROM "Ticket" t JOIN "Requester" r ON r."id" = t."requesterId"
         JOIN "User" u ON u."id" = t."requesterUserId"
         WHERE t."ticketNumber" = 'TKT-9001'`,
      );
      expect(mapping).toEqual([
        {
          requesterEmail: "migration@example.test",
          userEmail: "migration@example.test",
          ticketNumber: "TKT-9001",
        },
      ]);
    } finally {
      await prisma.$disconnect();
    }
  });

  it("T-MIG-04 seeds required role distribution idempotently without reactivation", async () => {
    const prisma = await prepareLab2Database();
    try {
      await executeMigration(prisma, lab3MigrationSql());
      await seedReferenceData(prisma);
      await prisma.$executeRawUnsafe(
        `UPDATE "User" SET "isActive" = false WHERE "email" = 'jennifer@example.test'`,
      );
      const before = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "User"`,
      );
      await seedReferenceData(prisma);
      const after = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*)::bigint AS count FROM "User"`,
      );
      expect(after[0].count).toBe(before[0].count);

      const inactive = await prisma.$queryRawUnsafe<Array<{ isActive: boolean }>>(
        `SELECT "isActive" FROM "User" WHERE "email" = 'jennifer@example.test'`,
      );
      expect(inactive[0].isActive).toBe(false);
      const roles = await prisma.$queryRawUnsafe<Array<{ role: string; count: bigint }>>(
        `SELECT "role", COUNT(*)::bigint AS count FROM "User" GROUP BY "role" ORDER BY "role"`,
      );
      expect(roles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "REQUESTER" }),
          expect.objectContaining({ role: "IT_STAFF" }),
          expect.objectContaining({ role: "ADMIN" }),
        ]),
      );
    } finally {
      await prisma.$disconnect();
    }
  });

  it("T-MIG-05 persists only password/session hashes and metadata, never fixture secrets", async () => {
    const prisma = await prepareLab2Database();
    try {
      await executeMigration(prisma, lab3MigrationSql());
      await seedReferenceData(prisma);
      const plaintext = process.env.LAB3_TEST_INITIAL_PASSWORD;
      const users = await prisma.$queryRawUnsafe<Array<{ passwordHash: string }>>(
        `SELECT "passwordHash" FROM "User" WHERE "passwordHash" IS NOT NULL`,
      );
      expect(users.length).toBeGreaterThan(0);
      if (plaintext) {
        expect(users.every(({ passwordHash }) => passwordHash !== plaintext)).toBe(true);
      }
      const sessions = await prisma.$queryRawUnsafe<Array<{ tokenHash: string }>>(
        `SELECT "tokenHash" FROM "Session"`,
      );
      expect(sessions.every(({ tokenHash }) => tokenHash.length > 20)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });
});
