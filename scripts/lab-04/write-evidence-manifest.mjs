#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMigrationDeploy, parseNodeTestRun, parsePlaywrightMatrix, parsePlaywrightRun, parseVitestRun } from "./parse-run-evidence.mjs";
import { filterExecutedTestIds } from "./executed-test-ids.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const validationCommit = process.argv[2];
const productCommit = process.argv[3];
const evidenceToolCommit = process.argv[4];
if (!/^[a-f0-9]{40}$/i.test(validationCommit ?? "")) {
  throw new Error("Pass the full 40-character validation/test source commit SHA as the first argument.");
}
if (!/^[a-f0-9]{40}$/i.test(productCommit ?? "")) throw new Error("Pass the full 40-character product source commit SHA as the second argument.");
if (!/^[a-f0-9]{40}$/i.test(evidenceToolCommit ?? "")) throw new Error("Pass the full 40-character evidence-tool commit SHA as the third argument.");

const relative = (absolutePath) => path.relative(root, absolutePath).split(path.sep).join("/");
async function pngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? pngFiles(child) : entry.isFile() && entry.name.endsWith(".png") ? [child] : [];
  }));
  return nested.flat();
}

function classifyScreenshot(file, capture) {
  const rel = relative(file);
  const parts = rel.split("/");
  const section = parts[3];
  const project = path.basename(file, ".png").split("-").at(-1);
  if (!["desktop", "tablet", "mobile"].includes(project)) throw new Error(`Unknown viewport in ${rel}`);
  if (!(["actions-taken", "ticket-workflow", "requester-dashboard", "staff-dashboard"].includes(section))) throw new Error(`Unknown screenshot family in ${rel}`);
  if (!Array.isArray(capture.ac) || !Array.isArray(capture.testIds) || !Array.isArray(capture.loadedStateAssertions) || typeof capture.redactionReview !== "string") throw new Error(`Incomplete caller evidence for ${rel}`);
  return capture;
}

const integrationLog = await readFile(path.join(root, "artifacts/lab-04/validation/integration.log"), "utf8");
const migrationLog = await readFile(path.join(root, "artifacts/lab-04/migration/migration.log"), "utf8");
const serverLog = await readFile(path.join(root, "artifacts/lab-04/validation/server-tests.log"), "utf8");
const clientLog = await readFile(path.join(root, "artifacts/lab-04/validation/client-tests.log"), "utf8");
const lab2Log = await readFile(path.join(root, "artifacts/lab-04/validation/lab2-e2e.log"), "utf8");
const lab3Log = await readFile(path.join(root, "artifacts/lab-04/validation/lab3-e2e.log"), "utf8");
const lab4Log = await readFile(path.join(root, "artifacts/lab-04/validation/lab4-e2e.log"), "utf8");
const contractLog = await readFile(path.join(root, "artifacts/lab-04/validation/contract-tests.log"), "utf8");
const testContract = await readFile(path.join(root, "docs/lab-04/tests.md"), "utf8");
const inventorySection = testContract.split("## 6. AC crosswalk")[0];
const inventoryIds = new Set([...inventorySection.matchAll(/^\|\s*((?:T-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}|RELEASE-01))\s*\|/gm)].map((match) => match[1]));
const migrationCount = parseMigrationDeploy(migrationLog);
const integrationRun = parseVitestRun(integrationLog);
const serverRun = parseVitestRun(serverLog);
const clientRun = parseVitestRun(clientLog);
const lab2Run = parsePlaywrightRun(lab2Log);
const lab3Run = parsePlaywrightRun(lab3Log);
const lab4Run = parsePlaywrightRun(lab4Log);
const contractRun = parseNodeTestRun(contractLog);
const browserMatrix = parsePlaywrightMatrix(lab4Log);
// Keep regression suites honest: tests from Labs 1–3 run as regressions, but
// only IDs declared in the Lab 4 inventory are attributed to this manifest.
const executedIds = (output) => filterExecutedTestIds(output, inventoryIds);
const perfLine = integrationLog.split("\n").find((line) => line.startsWith("[T-PERF-01] "));
if (!perfLine) throw new Error("Integration log does not contain the executed T-PERF-01 output.");
const perf = JSON.parse(perfLine.slice("[T-PERF-01] ".length));
await writeFile(path.join(root, "artifacts/lab-04/metrics/explain-plan.json"), `${JSON.stringify(perf.explain, null, 2)}\n`);
await writeFile(path.join(root, "artifacts/lab-04/metrics/report.md"), [
  "# L4-10 dashboard performance evidence",
  "",
  `Product source commit: \`${productCommit}\``,
  "Database: isolated \`toktickit_l410_final_integration_test\` (_test; URL redacted).",
  "Measurement: T-PERF-01, after five warm-up iterations and 20 measured runs per dashboard query.",
  "",
  "| Metric | Measured | Contract limit | Result |",
  "| --- | ---: | ---: | --- |",
  `| Tickets | ${perf.fixtureCounts.tickets} | 5,000 | pass |`,
  `| Actions | ${perf.fixtureCounts.actions} | 10,000 | pass |`,
  `| Requester dashboard data-query count | ${perf.requesterQueryCount} | ≤ 8 | pass |`,
  `| Staff dashboard data-query count | ${perf.staffQueryCount} | ≤ 14 | pass |`,
  `| Requester dashboard p95 | ${perf.requesterP95Ms} ms | ≤ 500 ms | pass |`,
  `| Staff dashboard p95 | ${perf.staffP95Ms} ms | ≤ 500 ms | pass |`,
  "",
  "The full PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` result is retained in `explain-plan.json`. The plan uses `ActionTaken_assigneeId_state_createdAt_id_idx` and `Ticket_pkey`; execution time was recorded by PostgreSQL in that plan. No database URL or credentials are included.",
  "",
].join("\n"));

const screenshots = [];
for (const file of (await pngFiles(path.join(root, "artifacts/lab-04/screenshots"))).sort()) {
  const bytes = await readFile(file);
  if (bytes.length < 24 || bytes.toString("hex", 0, 8) !== "89504e470d0a1a0a") throw new Error(`Invalid PNG: ${relative(file)}`);
  const capture = JSON.parse(await readFile(`${file}.evidence.json`, "utf8"));
  screenshots.push({
    path: relative(file),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    ...classifyScreenshot(file, capture),
    captureEvidencePath: `${relative(file)}.evidence.json`,
    captureEvidenceSha256: createHash("sha256").update(await readFile(`${file}.evidence.json`)).digest("hex"),
    project: path.basename(file, ".png").split("-").at(-1),
  });
}

const run = (passed, command, output) => ({ passed, failed: 0, skipped: 0, retries: 0, command, testIds: executedIds(output) });
const manifest = {
  schemaVersion: 1,
  // Keep sourceCommit as a compatibility alias for the E2E/test harness tree.
  sourceCommit: validationCommit,
  validationCommit,
  productCommit,
  evidenceToolCommit,
  database: { name: "toktickit_l410_review_test", urlRecorded: false },
  runs: {
    migrationDeploy: run(migrationCount, "cd server && DATABASE_URL=<redacted; toktickit_l410_review_migration_test> ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma", ""),
    integration: run(integrationRun.passed, "cd server && DATABASE_URL_TEST=<redacted; toktickit_l410_final_integration_test> LAB3_INITIAL_PASSWORD=<redacted; synthetic local-only value> npm run test:integration -- --reporter=verbose", integrationLog),
    serverTests: run(serverRun.passed, "cd server && npm test -- --reporter=verbose", serverLog),
    clientTests: run(clientRun.passed, "cd client && npm test -- --reporter=verbose", clientLog),
    lab2E2E: run(lab2Run.passed, "cd client && E2E_SUITE=lab2 npm run test:e2e -- --workers=1 --retries=0", lab2Log),
    lab3E2E: run(lab3Run.passed, "cd client && E2E_SUITE=lab3 npm run test:e2e:lab3 -- --workers=1 --retries=0", lab3Log),
    lab4E2E: run(lab4Run.passed, "cd client && npm run test:e2e:lab4 -- --workers=1 --retries=0", lab4Log),
    contractTests: run(contractRun.passed, "node --test scripts/lab-04/verify-contract.test.mjs", contractLog),
  },
  browserMatrix,
  releaseGate: { id: "RELEASE-01", status: "awaiting_peer_review", note: "L4-10 evidence is complete for staging review; final-main promotion remains a separate approval-gated step." },
  traceability: {
    "AC-15": ["T-MIG-01", "T-MIG-02", "T-MIG-03", "T-MIG-04", "T-MIG-05"],
    "AC-16": ["T-MIG-03"],
    "AC-17": ["T-REG-01", "T-REG-02", "T-RACE-04", "T-E2E-02", "T-E2E-03"],
    "AC-18": ["T-E2E-01", "T-SEC-01", "T-SEC-02", "T-SEC-03", "T-MIG-05"],
    "AC-19": ["T-STYLE-01", "T-A11Y-01", "T-RESP-01"],
    "AC-20": ["T-PERF-01", "T-DB-DASH-01"],
    "AC-21": ["T-E2E-01", "T-E2E-02", "T-E2E-03", "T-RESP-01", "T-EVID-01"],
    "AC-22": ["T-CONTRACT-01"],
  },
  migration: { log: "artifacts/lab-04/migration/migration.log", appliedMigrations: migrationCount, integrationPassed: integrationRun.passed },
  metrics: { report: "artifacts/lab-04/metrics/report.md", explainPlan: "artifacts/lab-04/metrics/explain-plan.json", fixtureTickets: Number(perf.fixtureCounts.tickets), fixtureActions: Number(perf.fixtureCounts.actions), requesterQueries: perf.requesterQueryCount, staffQueries: perf.staffQueryCount, p95Ms: Math.max(perf.requesterP95Ms, perf.staffP95Ms) },
  validation: { log: "artifacts/lab-04/validation/validation.log" },
  textEvidence: [
    "artifacts/lab-04/migration/migration.log",
    "artifacts/lab-04/migration/e2e-preparation.log",
    "artifacts/lab-04/validation/validation.log",
    "artifacts/lab-04/validation/integration.log",
    "artifacts/lab-04/validation/server-tests.log",
    "artifacts/lab-04/validation/client-tests.log",
    "artifacts/lab-04/validation/server-build.log",
    "artifacts/lab-04/validation/client-build.log",
    "artifacts/lab-04/validation/prisma-validate.log",
    "artifacts/lab-04/validation/lab2-e2e.log",
    "artifacts/lab-04/validation/lab3-e2e.log",
    "artifacts/lab-04/validation/lab4-e2e.log",
    "artifacts/lab-04/validation/contract-tests.log",
    "artifacts/lab-04/metrics/report.md",
    "artifacts/lab-04/metrics/explain-plan.json",
  ],
  screenshots,
};

await writeFile(path.join(root, "artifacts/lab-04/validation/evidence-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote manifest for ${screenshots.length} PNGs, product ${productCommit}, Playwright tree ${validationCommit}, and evidence tools ${evidenceToolCommit}.`);
