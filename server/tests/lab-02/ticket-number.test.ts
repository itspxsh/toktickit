import { describe, expect, it } from "vitest";
import { allocateTicketNumber, formatTicketNumber } from "../../src/ticket-number.js";

describe("Lab 2 ticket number allocation", () => {
  it("formats one canonical official number from a sequence value", () => {
    expect(formatTicketNumber(42n, new Date("2026-09-06T12:00:00.000Z"))).toBe("TKT-2026-000042");
  });

  it("allocates the sequence and formatted number together through one query", async () => {
    const queries: unknown[] = [];
    const prisma = {
      $queryRaw: async (query: unknown) => {
        queries.push(query);
        return [{ sequence: 42n }];
      },
    };

    await expect(
      allocateTicketNumber(prisma, new Date("2026-09-06T12:00:00.000Z")),
    ).resolves.toEqual({
      ticketSequence: 42n,
      ticketNumber: "TKT-2026-000042",
    });
    expect(queries).toHaveLength(1);
  });

  it("rejects invalid sequence values instead of creating an ambiguous number", () => {
    expect(() => formatTicketNumber(0n)).toThrow(/positive/i);
    expect(() => formatTicketNumber(1_000_000n)).toThrow(/six digits/i);
  });
});
