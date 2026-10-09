import { PrismaClient } from "@prisma/client";

/**
 * Refuse destructive test operations unless the database name is explicitly
 * test-scoped. This guard is intentionally independent of NODE_ENV.
 */
export function assertTestDatabaseUrl(value = process.env.DATABASE_URL_TEST): string {
  if (!value?.trim()) {
    throw new Error("DATABASE_URL_TEST is required for database tests");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL_TEST must be a valid PostgreSQL URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error("DATABASE_URL_TEST must use a PostgreSQL URL");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!/(^|[_-])test$/i.test(databaseName)) {
    throw new Error("Refusing to use a non-test database; database name must end with test");
  }

  return value;
}

export function createTestPrisma(): PrismaClient {
  return new PrismaClient({
    datasources: { db: { url: assertTestDatabaseUrl() } },
  });
}

/** Reset only the database selected by DATABASE_URL_TEST, then reseed it. */
export async function resetTestDatabase(): Promise<void> {
  const prisma = createTestPrisma();

  try {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `;
    const lab4Tables = new Set(["ActionTaken", "ActionRevision", "TicketStatusEvent"]);
    const existingLab4Tables = tables.filter(({ table_name }) => lab4Tables.has(table_name)).map(({ table_name }) => table_name);
    if (existingLab4Tables.length > 0 && existingLab4Tables.length !== lab4Tables.size) {
      throw new Error("Refusing test reset: Lab 4 schema is only partially migrated");
    }
    if (existingLab4Tables.length === lab4Tables.size) {
      const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='Ticket'
          AND column_name IN ('workflowVersion','resolvedAt')
      `;
      if (columns.length !== 2) throw new Error("Refusing test reset: Lab 4 Ticket columns are incomplete");
    }
    if (tables.length > 0) {
      const quotedTables = tables
        .map(({ table_name }) => `"${table_name.replaceAll('"', '""')}"`)
        .join(", ");
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`
      );
    }

    const { seedLab3Data, seedLab4Data, seedReferenceData } = await import("../../src/data-foundation.js");
    const hasLab3UserTable = tables.some(({ table_name }) => table_name === "User");
    if (hasLab3UserTable) await seedLab3Data(prisma);
    else await seedReferenceData(prisma);

    if (existingLab4Tables.length === lab4Tables.size) {
      await seedLab4Data(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}
