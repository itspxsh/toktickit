import { describe, expect, it } from "vitest";
import {
  hashPassword,
  hashSessionToken,
  isSessionUsable,
  validatePasswordChange,
  verifyPassword,
} from "../../src/auth.js";

describe("Lab 3 authentication primitives", () => {
  it("T-UNIT-01 hashes passwords one-way and verifies only the matching value", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toContain("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("T-UNIT-02 creates expiry-aware session metadata and never treats invalid sessions as usable", () => {
    const now = new Date("2026-09-15T10:00:00.000Z");
    expect(isSessionUsable({ expiresAt: new Date("2026-09-15T22:00:00.000Z"), invalidatedAt: null, userActive: true }, now)).toBe(true);
    expect(isSessionUsable({ expiresAt: new Date("2026-09-15T09:59:59.000Z"), invalidatedAt: null, userActive: true }, now)).toBe(false);
    expect(isSessionUsable({ expiresAt: new Date("2026-09-15T22:00:00.000Z"), invalidatedAt: new Date(), userActive: true }, now)).toBe(false);
    expect(isSessionUsable({ expiresAt: new Date("2026-09-15T22:00:00.000Z"), invalidatedAt: null, userActive: false }, now)).toBe(false);
    expect(hashSessionToken("opaque-token")).toBe("84d3f23da9b5f51b3269566eff05d3fb23607eeef89567f9cd280b90ca0dbc5c");
    expect(hashSessionToken("opaque-token")).not.toBe("opaque-token");
  });

  it("T-UNIT-03 rejects blank/short/reused passwords without exposing secrets", () => {
    expect(validatePasswordChange("", "short", "existing-hash")).toMatchObject({ valid: false });
    expect(validatePasswordChange("old-password", "short", "existing-hash")).toMatchObject({ valid: false });
    expect(validatePasswordChange("same-password", "same-password", "same-password")).toMatchObject({ valid: false });
    const result = validatePasswordChange("current-password", "a-secure-password-12", "different-hash");
    expect(result).toEqual({ valid: true });
    expect(JSON.stringify(result)).not.toContain("password");
  });
});
