import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl } from "../helpers/test-database.js";
import { REFERENCE_SEED } from "../../src/data-foundation.js";

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
});
