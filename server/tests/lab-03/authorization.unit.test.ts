import { describe, expect, it } from "vitest";
import { roleAllowed } from "../../src/authorization.js";

describe("Lab 3 authorization predicates", () => {
  it("T-UNIT-04 allows only the explicitly granted roles", () => {
    expect(roleAllowed("REQUESTER", ["REQUESTER"])).toBe(true);
    expect(roleAllowed("REQUESTER", ["IT_STAFF", "ADMIN"])).toBe(false);
    expect(roleAllowed("IT_STAFF", ["IT_STAFF", "ADMIN"])).toBe(true);
    expect(roleAllowed("ADMIN", ["IT_STAFF", "ADMIN"])).toBe(true);
  });
});
