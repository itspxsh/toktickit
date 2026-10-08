import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";
import { assertTestDatabaseUrl, createTestPrisma } from "./test-database.js";

const migrationsRoot = new URL("../../prisma/migrations/", import.meta.url);
const schemaPath = new URL("../../prisma/schema.prisma", import.meta.url);
const prismaBin = resolve(dirname(new URL(import.meta.url).pathname), "../../node_modules/.bin/prisma");

export function lab4MigrationPath(): string | undefined {
  return readdirSync(migrationsRoot).find((name) => name.endsWith("_lab4_actions_workflow"));
}

export async function resetGuardedTestDatabase(): Promise<void> {
  const guardedUrl = assertTestDatabaseUrl();
  const parsed = new URL(guardedUrl);
  const expectedName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const prisma = createTestPrisma();
  try {
    const rows = await prisma.$queryRaw<Array<{ current_database: string }>>`SELECT current_database()`;
    if (rows[0]?.current_database !== expectedName) {
      throw new Error("Connected database does not match guarded DATABASE_URL_TEST");
    }
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "public" CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA "public"');
  } finally {
    await prisma.$disconnect();
  }
}

/** Use Prisma's migration engine against only the explicitly guarded test URL. */
export function deployMigrationHistory(databaseUrl: string, includeLab4: boolean): string {
  assertTestDatabaseUrl(databaseUrl);
  const tempProject = mkdtempSync(join(tmpdir(), "toktickit-lab4-migrations-"));
  const tempSchema = join(tempProject, "schema.prisma");
  const tempMigrations = join(tempProject, "migrations");
  mkdirSync(tempMigrations);
  copyFileSync(schemaPath, tempSchema);
  const migrationNames = readdirSync(migrationsRoot).sort();
  for (const name of migrationNames) {
    if (!includeLab4 && name.endsWith("_lab4_actions_workflow")) continue;
    cpSync(new URL(name, migrationsRoot), join(tempMigrations, name), { recursive: true });
  }
  const lockPath = new URL("migration_lock.toml", migrationsRoot);
  if (existsSync(lockPath)) copyFileSync(lockPath, join(tempMigrations, "migration_lock.toml"));

  try {
    return execFileSync(prismaBin, ["migrate", "deploy", "--schema", tempSchema], {
      cwd: tempProject,
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const output = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr)
      : String(error);
    throw new Error(output.replaceAll(databaseUrl, "[redacted DATABASE_URL_TEST]"));
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }
}

const legacyColumns: Record<string, string[]> = {
  Category: ["id", "name", "isActive", "createdAt", "updatedAt"],
  Requester: ["id", "name", "email", "isActive", "createdAt", "updatedAt", "userId"],
  RelatedSystem: ["id", "name", "isActive", "createdAt", "updatedAt"],
  Ticket: ["id", "ticketNumber", "ticketSequence", "ticketDate", "requesterId", "requesterUserId", "assignedStaffId", "categoryId", "relatedSystemId", "summary", "requestedPriority", "description", "itPriority", "currentStatus", "requesterResolvedAt", "clientRequestId", "createdAt", "updatedAt"],
  Attachment: ["id", "ticketId", "originalName", "storageKey", "mimeType", "sizeBytes", "status", "removedAt", "removalReason", "removedByRequesterId", "removedByUserId", "createdAt", "updatedAt"],
  User: ["id", "name", "email", "passwordHash", "role", "isActive", "mustChangePassword", "createdAt", "updatedAt"],
  Session: ["id", "userId", "tokenHash", "expiresAt", "invalidatedAt", "createdAt"],
  PublicComment: ["id", "ticketId", "authorUserId", "body", "createdAt"],
  InternalNote: ["id", "ticketId", "authorUserId", "body", "createdAt"],
};

export async function snapshotLab3Rows(prisma: PrismaClient): Promise<Record<string, string>> {
  const snapshots: Record<string, string> = {};
  for (const [table, columns] of Object.entries(legacyColumns)) {
    const select = columns.map((column) => `"${column}"`).join(", ");
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      `SELECT COALESCE(json_agg(to_jsonb(t) ORDER BY t."id"), '[]'::json)::text AS value FROM (SELECT ${select} FROM "${table}") t`,
    );
    snapshots[table] = rows[0].value;
  }
  return snapshots;
}

export function createAttachmentFixtureFile(): { path: string; hash: string; cleanup: () => void } {
  const directory = mkdtempSync(join(tmpdir(), "toktickit-lab4-attachment-"));
  const path = join(directory, "legacy-attachment.bin");
  const bytes = Buffer.from("Lab 2 attachment fixture bytes\n");
  writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  return { path, hash, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

export async function insertLab3PreservationFixture(prisma: PrismaClient): Promise<{ maxTicketSequence: bigint }> {
  await prisma.$executeRawUnsafe(`INSERT INTO "Category" ("name") VALUES ('Hardware'),('Software'),('Network'),('Account and Access')`);
  await prisma.$executeRawUnsafe(`INSERT INTO "RelatedSystem" ("name") VALUES ('VPN')`);
  const user = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO "User" ("name","email","passwordHash","role","isActive","mustChangePassword") VALUES ('Migration Requester','migration.requester@example.test','test-hash-only','REQUESTER',true,false) RETURNING "id"`,
  );
  const staff = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO "User" ("name","email","passwordHash","role","isActive","mustChangePassword") VALUES ('Migration Staff','migration.staff@example.test','test-hash-only','IT_STAFF',false,true) RETURNING "id"`,
  );
  const admin = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO "User" ("name","email","passwordHash","role","isActive","mustChangePassword") VALUES ('Migration Admin','migration.admin@example.test','test-hash-only','ADMIN',true,false) RETURNING "id"`,
  );
  const requester = await prisma.$queryRawUnsafe<Array<{ id: number }>>(
    `INSERT INTO "Requester" ("name","email","isActive","userId") VALUES ('Migration Requester','migration.requester@example.test',true,${user[0].id}) RETURNING "id"`,
  );
  const category = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "Category" WHERE "name"='Hardware'`);
  const system = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "RelatedSystem" WHERE "name"='VPN'`);
  const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
  for (let index = 0; index < statuses.length; index += 1) {
    const sequence = BigInt(100 + index);
    const ticketNumber = `TKT-2026-${String(index + 1).padStart(6, "0")}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Ticket" ("ticketNumber","ticketSequence","requesterId","requesterUserId","assignedStaffId","categoryId","relatedSystemId","summary","requestedPriority","description","itPriority","currentStatus","clientRequestId") VALUES ('${ticketNumber}',${sequence},${requester[0].id},${user[0].id},${index % 2 === 0 ? staff[0].id : admin[0].id},${category[0].id},${system[0].id},'Legacy ${statuses[index]}','HIGH','Preserve Lab 3 ticket','URGENT','${statuses[index]}','migration-${statuses[index].toLowerCase()}')`,
    );
  }
  await prisma.$executeRawUnsafe(`SELECT setval('ticket_number_seq', 107, true)`);
  const ticket = await prisma.$queryRawUnsafe<Array<{ id: number }>>(`SELECT "id" FROM "Ticket" WHERE "ticketNumber"='TKT-2026-000001'`);
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Session" ("userId","tokenHash","expiresAt") VALUES (${user[0].id},'test-session-hash-only',CURRENT_TIMESTAMP + INTERVAL '1 day')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "Attachment" ("ticketId","originalName","storageKey","mimeType","sizeBytes","status","removedAt","removalReason","removedByUserId") VALUES (${ticket[0].id},'legacy.pdf','legacy-storage-key','application/pdf',31,'REMOVED',CURRENT_TIMESTAMP,'Legacy removal',${admin[0].id})`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "PublicComment" ("ticketId","authorUserId","body") VALUES (${ticket[0].id},${user[0].id},'Legacy public comment')`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "InternalNote" ("ticketId","authorUserId","body") VALUES (${ticket[0].id},${admin[0].id},'Legacy internal note')`,
  );
  return { maxTicketSequence: 107n };
}
