import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REFERENCE_SEED, seedReferenceData } from "../../src/data-foundation.js";
import { assertTestDatabaseUrl, createTestPrisma } from "../helpers/test-database.js";

const baselineMigration = readFileSync(
  new URL("../../prisma/migrations/20260816095224_init/migration.sql", import.meta.url),
  "utf8",
);
const lab2Migration = readFileSync(
  new URL("../../prisma/migrations/20260906010000_lab2_data_foundation/migration.sql", import.meta.url),
  "utf8",
);

async function executeMigration(prisma: ReturnType<typeof createTestPrisma>, sql: string) {
  const statements = sql
    .split(/;\s*(?=\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

describe("L2-02 migration safety (test database)", () => {
  it("preserves Lab 1 categories and advances the ticket sequence", async () => {
    const databaseUrl = assertTestDatabaseUrl();
    const prisma = createTestPrisma();

    try {
      await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
      await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
      await executeMigration(prisma, baselineMigration);

      for (const name of REFERENCE_SEED.categories) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Category" ("name") VALUES ('${name.replaceAll("'", "''")}')`,
        );
      }

      await executeMigration(prisma, lab2Migration);

      await seedReferenceData(prisma);
      await prisma.category.update({ where: { name: "Hardware" }, data: { isActive: false } });
      await prisma.relatedSystem.update({ where: { name: "Email" }, data: { isActive: false } });
      await prisma.requester.update({
        where: { email: "jennifer@example.test" },
        data: { isActive: false },
      });
      await seedReferenceData(prisma);

      await expect(
        prisma.category.findUnique({ where: { name: "Hardware" }, select: { isActive: true } }),
      ).resolves.toEqual({ isActive: false });
      await expect(
        prisma.relatedSystem.findUnique({ where: { name: "Email" }, select: { isActive: true } }),
      ).resolves.toEqual({ isActive: false });
      await expect(
        prisma.requester.findUnique({
          where: { email: "jennifer@example.test" },
          select: { isActive: true },
        }),
      ).resolves.toEqual({ isActive: false });

      const categories = await prisma.$queryRawUnsafe<Array<{ isActive: boolean; name: string }>>(
        'SELECT "name", "isActive" FROM "Category" ORDER BY "name" ASC',
      );
      expect(categories.map((category) => category.name)).toEqual(
        [...REFERENCE_SEED.categories].sort(),
      );
      expect(categories.filter((category) => category.isActive)).toHaveLength(3);

      const first = await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
        `SELECT nextval('ticket_number_seq') AS value`,
      );
      const second = await prisma.$queryRawUnsafe<Array<{ value: bigint }>>(
        `SELECT nextval('ticket_number_seq') AS value`,
      );
      expect(second[0].value).toBe(first[0].value + 1n);
      expect(databaseUrl).toMatch(/(?:_|-)test(?:\?|$)/i);
    } finally {
      await prisma.$disconnect();
    }
  });
});
