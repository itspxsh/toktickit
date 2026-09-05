import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "../helpers/test-database.js";
import { readFileSync } from "node:fs";
import { REFERENCE_SEED, seedReferenceData } from "../../src/data-foundation.js";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../prisma/migrations/20260906010000_lab2_data_foundation/migration.sql", import.meta.url),
  "utf8"
);

describe("L2-02 data foundation", () => {
  it("accepts only an explicitly test-scoped database URL", () => {
    const testUrl = "postgresql://localhost:5432/toktickit_test";

    expect(assertTestDatabaseUrl(testUrl)).toBe(testUrl);
    expect(() =>
      assertTestDatabaseUrl("postgresql://localhost:5432/toktickit")
    ).toThrow(/test database/i);
  });

  it("keeps the required repeatable reference seed counts", () => {
    expect(REFERENCE_SEED.categories).toHaveLength(4);
    expect(REFERENCE_SEED.relatedSystems).toHaveLength(7);
    expect(REFERENCE_SEED.requesters.filter((requester) => requester.isActive)).toHaveLength(4);
    expect(REFERENCE_SEED.requesters.filter((requester) => !requester.isActive)).toHaveLength(1);
  });

  it("declares the ownership and attachment models required by the contract", () => {
    for (const model of ["model Requester", "model RelatedSystem", "model Ticket", "model Attachment"]) {
      expect(schema).toContain(model);
    }
    for (const enumName of ["enum RequestedPriority", "enum CurrentStatus", "enum AttachmentStatus"]) {
      expect(schema).toContain(enumName);
    }
    expect(schema).toMatch(/clientRequestId\s+String\s+@unique/);
    expect(schema).toContain("ticketSequence    BigInt            @unique");
    expect(schema).toContain("@@index([requesterId, updatedAt, id])");
    expect(schema).toContain("@@index([ticketId, status, createdAt])");
  });

  it("preserves Lab 1 categories and creates the ticket sequence in the migration", () => {
    expect(migration).toContain('ALTER TABLE "Category"');
    expect(migration).toContain('ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true');
    expect(migration).toContain('CREATE SEQUENCE "ticket_number_seq"');
    expect(migration).toContain('"ticketSequence" BIGINT NOT NULL,');
    expect(migration).not.toContain('"ticketSequence" BIGINT NOT NULL DEFAULT');
    expect(migration).toContain('CREATE UNIQUE INDEX "Ticket_clientRequestId_key"');
    expect(migration).toContain('CREATE INDEX "Ticket_requesterId_updatedAt_id_idx"');
  });

  it("upserts every stable reference key through one transaction", async () => {
    const calls = {
      category: { upsert: [] as unknown[] },
      relatedSystem: { upsert: [] as unknown[] },
      requester: { upsert: [] as unknown[] },
    };
    const transaction = {
      category: { upsert: async (args: unknown) => calls.category.upsert.push(args) },
      relatedSystem: { upsert: async (args: unknown) => calls.relatedSystem.upsert.push(args) },
      requester: { upsert: async (args: unknown) => calls.requester.upsert.push(args) },
    };
    const prisma = {
      $transaction: async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction),
    } as never;

    await seedReferenceData(prisma);

    expect(calls.category.upsert).toHaveLength(4);
    expect(calls.relatedSystem.upsert).toHaveLength(7);
    expect(calls.requester.upsert).toHaveLength(5);
    expect(calls.requester.upsert[4]).toMatchObject({ where: { email: "taylor@example.test" } });
  });

  it("does not reactivate or mutate existing reference rows on rerun", async () => {
    const updates: unknown[] = [];
    const transaction = {
      category: { upsert: async (args: { update: unknown }) => updates.push(args.update) },
      relatedSystem: { upsert: async (args: { update: unknown }) => updates.push(args.update) },
      requester: { upsert: async (args: { update: unknown }) => updates.push(args.update) },
    };
    const prisma = {
      $transaction: async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction),
    } as never;

    await seedReferenceData(prisma);

    expect(updates).toHaveLength(
      REFERENCE_SEED.categories.length +
        REFERENCE_SEED.relatedSystems.length +
        REFERENCE_SEED.requesters.length,
    );
    expect(updates.every((update) => Object.keys(update as object).length === 0)).toBe(true);
  });
});
