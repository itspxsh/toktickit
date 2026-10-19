import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { validateEvidenceManifest } from "./verify-contract.mjs";

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
  assert.match(source, /databaseName\.endsWith\("_test"\)/);
});
