import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import { REPOSITORY_ROOT, resolveArtifactRoot } from "../../../e2e/artifact-path.cjs";
import { preflightError } from "../../../e2e/assert-preflight.cjs";

describe("E2E artifact root resolution", () => {
  it("resolves a relative override against the repository root", () => {
    expect(resolveArtifactRoot("artifacts/default", "artifacts/custom"))
      .toBe(path.join(REPOSITORY_ROOT, "artifacts/custom"));
  });

  it("preserves an absolute override instead of nesting it under the repository", () => {
    const absoluteRoot = path.join(os.tmpdir(), "toktickit-e2e-artifacts");
    expect(resolveArtifactRoot("artifacts/default", absoluteRoot)).toBe(absoluteRoot);
  });

  it("allows an explicitly insecure cookie only for matching-origin local HTTP", () => {
    expect(preflightError({
      E2E_DATABASE_URL: "postgresql://localhost/toktickit_test",
      E2E_BASE_URL: "http://127.0.0.1:5173",
      E2E_AUTH_ORIGIN: "http://127.0.0.1:5173",
      E2E_SESSION_COOKIE_SECURE: "false",
    })).toBeNull();
  });

  it("rejects insecure cookies for HTTPS while allowing the secure default", () => {
    const config = {
      E2E_DATABASE_URL: "postgresql://localhost/toktickit_test",
      E2E_BASE_URL: "https://e2e.example.test",
      E2E_AUTH_ORIGIN: "https://e2e.example.test",
    };
    expect(preflightError({ ...config, E2E_SESSION_COOKIE_SECURE: "false" }))
      .toContain("not allowed for HTTPS");
    expect(preflightError(config)).toBeNull();
  });

  it("rejects insecure cookies for non-local HTTP origins", () => {
    expect(preflightError({
      E2E_DATABASE_URL: "postgresql://localhost/toktickit_test",
      E2E_BASE_URL: "http://e2e.example.test",
      E2E_AUTH_ORIGIN: "http://e2e.example.test",
      E2E_SESSION_COOKIE_SECURE: "false",
    })).toContain("only allowed for local HTTP");
  });
});
