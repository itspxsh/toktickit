import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { scanSensitiveEvidenceText, validateEvidenceManifest, validateContractInventory } from "./verify-contract.mjs";
import { parseNodeTestRun, parsePlaywrightMatrix, parseVitestRun, parseMigrationDeploy } from "./parse-run-evidence.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("T-CONTRACT-01: Lab 4 has an explicit Playwright suite selector and reproducible command", async () => {
  const config = await readFile(path.join(repositoryRoot, "client/playwright.config.ts"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "client/package.json"), "utf8"));
  assert.match(config, /E2E_SUITE\s*===\s*["']lab4["']/);
  assert.match(config, /lab-04/);
  assert.equal(typeof packageJson.scripts?.["test:e2e:lab4"], "string");
  assert.match(packageJson.scripts["test:e2e:lab4"], /lab-04/);
});

test("T-EVID-01: evidence verifier is present at the contract's canonical path", async () => {
  const verifier = path.join(repositoryRoot, "scripts/lab-04/verify-contract.mjs");
  const source = await readFile(verifier, "utf8");
  assert.match(source, /manifest/i);
  assert.match(source, /sha256/i);
  assert.match(source, /AC-21|T-EVID-01/);
});

test("T-EVID-01 rejects manifests that do not record executed suite runs", async () => {
  const manifest = {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    database: { name: "toktickit_lab4_test", urlRecorded: false },
    runs: {},
    browserMatrix: [],
    traceability: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`AC-${index + 15}`, ["T-CONTRACT-01"]])),
    migration: { log: "missing-migration.log", appliedMigrations: 4, integrationPassed: 20 },
    metrics: { report: "missing-metrics.md", explainPlan: "missing-explain.json", fixtureTickets: 5000, fixtureActions: 10000, requesterQueries: 8, staffQueries: 11, p95Ms: 50 },
    validation: { log: "missing-validation.log" },
    screenshots: [],
  };

  const errors = await validateEvidenceManifest(manifest);
  assert.ok(errors.some((error) => error.includes("runs must include")), errors.join("\n"));
});

test("T-EVID-01 rejects AC mappings to test IDs absent from all executed runs", async () => {
  const manifest = {
    schemaVersion: 1,
    sourceCommit: "a".repeat(40),
    database: { name: "toktickit_lab4_test", urlRecorded: false },
    runs: { server: { passed: 1, failed: 0, skipped: 0, retries: 0, command: "npm test", testIds: ["T-MIG-01"] } },
    browserMatrix: [],
    traceability: Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`AC-${index + 15}`, ["T-NOT-EXECUTED"]])),
    migration: { log: "missing-migration.log", appliedMigrations: 4, integrationPassed: 20 },
    metrics: { report: "missing-metrics.md", explainPlan: "missing-explain.json", fixtureTickets: 5000, fixtureActions: 10000, requesterQueries: 8, staffQueries: 11, p95Ms: 50 },
    validation: { log: "missing-validation.log" },
    screenshots: [],
  };

  const errors = await validateEvidenceManifest(manifest);
  assert.ok(errors.some((error) => error.includes("T-NOT-EXECUTED")), errors.join("\n"));
});

test("T-EVID-01 database preparation guard requires the literal _test suffix", async () => {
  const source = await readFile(path.join(repositoryRoot, "scripts/lab-04/prepare-test-database.mjs"), "utf8");
  assert.match(source, /databaseName\.toLowerCase\(\)\.endsWith\("_test"\)/);
});

test("T-EVID-01 scans retained logs for raw database URLs and credentials", () => {
  assert.match(scanSensitiveEvidenceText("DATABASE_URL=postgresql://private/db"), /database URL/i);
  assert.match(scanSensitiveEvidenceText("E2E_REQUESTER_PASSWORD=private-value"), /credential/i);
  assert.equal(scanSensitiveEvidenceText("DATABASE_URL=<redacted; isolated_test>"), null);
  assert.equal(scanSensitiveEvidenceText("all fixtures use synthetic .test identities"), null);
});

test("T-EVID-01 derives Vitest pass/fail/skip counts from its completed summary", () => {
  assert.deepEqual(parseVitestRun("Test Files  24 passed (24)\n      Tests  175 passed (175)\n"), {
    passed: 175, failed: 0, skipped: 0, retries: 0,
  });
  assert.throws(() => parseVitestRun("Tests 174 passed | 1 failed (175)"), /failed/i);
  assert.throws(() => parseVitestRun("Tests 174 passed | 1 skipped (175)"), /skipped/i);
});

test("T-EVID-01 derives Node test-run counts from the TAP summary", () => {
  assert.deepEqual(parseNodeTestRun("ℹ tests 6\nℹ pass 6\nℹ fail 0\nℹ skipped 0\nℹ todo 0\n"), {
    passed: 6, failed: 0, skipped: 0, retries: 0,
  });
  assert.throws(() => parseNodeTestRun("ℹ tests 6\nℹ pass 5\nℹ fail 1\nℹ skipped 0\n"), /failed/i);
});

test("T-EVID-01 derives exactly one non-retried run per Lab 4 journey and viewport", () => {
  const rows = ["T-E2E-01", "T-E2E-02", "T-E2E-03"].flatMap((testId) => ["desktop", "tablet", "mobile"].map((viewport) => `✓ 1 [${viewport}] › ${testId} journey`));
  const log = `${rows.join("\n")}\n9 passed (1m)\n`;
  assert.equal(parsePlaywrightMatrix(log).length, 9);
  assert.throws(() => parsePlaywrightMatrix(log.replace("9 passed", "8 passed")), /summary/i);
  assert.throws(() => parsePlaywrightMatrix(`${log}  1 flaky\n`), /retry|flaky/i);
});

test("T-EVID-01 derives migration count only from successful deploy output", () => {
  const applied = "4 migrations found in prisma/migrations\nApplying migration `20260816095224_init`\nApplying migration `20260906010000_lab2_data_foundation`\nThe following migration(s) have been applied:\nmigrations/\n  └─ 20260816095224_init/\n    └─ migration.sql\n  └─ 20260906010000_lab2_data_foundation/\n    └─ migration.sql\nAll migrations have been successfully applied.\n";
  assert.equal(parseMigrationDeploy(applied), 2);
  assert.equal(parseMigrationDeploy("4 migrations found in prisma/migrations\nNo pending migrations to apply.\n"), 0);
  assert.throws(() => parseMigrationDeploy("4 migrations found\nMigration failed\n"), /success/i);
});

test("T-EVID-01 accepts the canonical manifest and rejects counts that disagree with retained output", async () => {
  const manifestPath = path.join(repositoryRoot, "artifacts/lab-04/validation/evidence-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const canonicalErrors = await validateEvidenceManifest(manifest);
  assert.deepEqual(canonicalErrors, [], canonicalErrors.join("\n"));

  manifest.runs.clientTests.passed += 1;
  const errors = await validateEvidenceManifest(manifest);
  assert.ok(errors.some((error) => error.includes("clientTests.passed") && error.includes("retained run log")), errors.join("\n"));
});

test("T-CONTRACT-01 rejects invented test IDs and unrecognized validation commands", async () => {
  const manifestPath = path.join(repositoryRoot, "artifacts/lab-04/validation/evidence-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.runs.serverTests.testIds = ["T-TOTALLY-INVENTED"];
  manifest.runs.serverTests.command = "totally invented command";
  const errors = await validateEvidenceManifest(manifest);
  assert.ok(errors.some((error) => error.includes("T-TOTALLY-INVENTED") && /contract inventory|test file/i.test(error)), errors.join("\n"));
  assert.ok(errors.some((error) => /command.*not.*allow|unrecognized command/i.test(error)), errors.join("\n"));
});

test("T-CONTRACT-01 resolves each requirement and test inventory row to an existing file and Issue status", async () => {
  const errors = await validateContractInventory();
  assert.deepEqual(errors, [], errors.join("\n"));
  const source = await readFile(path.join(repositoryRoot, "docs/lab-04/tests.md"), "utf8");
  assert.match(source, /\| Requirement ID \| Issue \| Implementation files \| Test IDs \| Status \|/);
  for (const id of ["FR-01", "BR-01", "AC-01", "T-ACT-01", "RELEASE-01"]) assert.match(source, new RegExp(`\\b${id}\\b`));
});

test("T-EVID-01 screenshot manifest consumes capture assertions and review metadata instead of asserting them itself", async () => {
  const writer = await readFile(path.join(repositoryRoot, "scripts/lab-04/write-evidence-manifest.mjs"), "utf8");
  const support = await readFile(path.join(repositoryRoot, "e2e/lab-04/support.ts"), "utf8");
  assert.doesNotMatch(writer, /redacted:\s*true|loadedState:\s*true/);
  assert.match(writer, /\.evidence\.json/);
  assert.match(support, /loadedStateAssertions/);
  assert.match(support, /redactionReview/);
});

test("T-EVID-01 screenshot traceability is state-specific rather than assigning every journey AC to every image", async () => {
  const writer = await readFile(path.join(repositoryRoot, "scripts/lab-04/write-evidence-manifest.mjs"), "utf8");
  assert.match(writer, /function classifyScreenshot\(file, capture\)/);
  assert.match(writer, /capture\.ac/);
  assert.match(writer, /capture\.testIds/);
});

test("T-CONTRACT-01 verifies an explicit RELEASE-01 state", async () => {
  const manifestPath = path.join(repositoryRoot, "artifacts/lab-04/validation/evidence-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.ok(manifest.releaseGate, "canonical evidence must state RELEASE-01 status");
  const errors = await validateEvidenceManifest({ ...manifest, releaseGate: undefined });
  assert.ok(errors.some((error) => /RELEASE-01/.test(error)), errors.join("\n"));
});

test("T-E2E-02 includes a persisted public comment in the Requester-visible resolution journey", async () => {
  const source = await readFile(path.join(repositoryRoot, "e2e/lab-04/ticket-resolution.spec.ts"), "utf8");
  assert.match(source, /Add public comment/);
  assert.match(source, /requester\.getByText\(.*public comment/i);
});

test("T-E2E-03 dashboard metric links use an unambiguous first match", async () => {
  const source = await readFile(path.join(repositoryRoot, "e2e/lab-04/dashboards.spec.ts"), "utf8");
  assert.match(source, /getByRole\("link", \{ name: `\$\{label\}: \$\{metric\.value\}`, exact: true \}\)\.first\(\)/);
});

test("T-UI-ACT-05 proves the refreshed Action version is used by the next mutation", async () => {
  const source = await readFile(path.join(repositoryRoot, "client/tests/lab-04/ActionsTaken.test.tsx"), "utf8");
  assert.match(source, /refreshed.*ticketVersion|ticketVersion.*refreshed/i);
  assert.match(source, /expectedVersion.*4|expectedTicketVersion.*4/);
});
