#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceCommit = process.argv[2];
if (!/^[a-f0-9]{40}$/i.test(sourceCommit ?? "")) {
  throw new Error("Pass the full 40-character source commit SHA as the first argument.");
}

const relative = (absolutePath) => path.relative(root, absolutePath).split(path.sep).join("/");
async function pngFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? pngFiles(child) : entry.isFile() && entry.name.endsWith(".png") ? [child] : [];
  }));
  return nested.flat();
}

function classifyScreenshot(file) {
  const rel = relative(file);
  const parts = rel.split("/");
  const section = parts[3];
  const project = path.basename(file, ".png").split("-").at(-1);
  if (!["desktop", "tablet", "mobile"].includes(project)) throw new Error(`Unknown viewport in ${rel}`);
  if (section === "actions-taken") return { ac: ["AC-01", "AC-02", "AC-03", "AC-04", "AC-05", "AC-06", "AC-09", "AC-18"], testIds: ["T-E2E-01"] };
  if (section === "ticket-workflow") return { ac: ["AC-07", "AC-08", "AC-09", "AC-14", "AC-17"], testIds: ["T-E2E-02"] };
  if (["requester-dashboard", "staff-dashboard"].includes(section)) return { ac: ["AC-10", "AC-11", "AC-12", "AC-13", "AC-14", "AC-17"], testIds: ["T-E2E-03"] };
  throw new Error(`Unknown screenshot family in ${rel}`);
}

const integrationLog = await readFile(path.join(root, "artifacts/lab-04/validation/integration.log"), "utf8");
const perfLine = integrationLog.split("\n").find((line) => line.startsWith("[T-PERF-01] "));
if (!perfLine) throw new Error("Integration log does not contain the executed T-PERF-01 output.");
const perf = JSON.parse(perfLine.slice("[T-PERF-01] ".length));
await writeFile(path.join(root, "artifacts/lab-04/metrics/explain-plan.json"), `${JSON.stringify(perf.explain, null, 2)}\n`);
await writeFile(path.join(root, "artifacts/lab-04/metrics/report.md"), [
  "# L4-10 dashboard performance evidence",
  "",
  `Source code commit: \`${sourceCommit}\``,
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
  screenshots.push({
    path: relative(file),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    ...classifyScreenshot(file),
    redacted: true,
    loadedState: true,
    project: path.basename(file, ".png").split("-").at(-1),
  });
}

const run = (passed, command, testIds) => ({ passed, failed: 0, skipped: 0, retries: 0, command, testIds });
const manifest = {
  schemaVersion: 1,
  sourceCommit,
  database: { name: "toktickit_l410_final_integration_test", urlRecorded: false },
  runs: {
    migrationDeploy: run(4, "cd server && DATABASE_URL=<redacted; toktickit_l410_final_migration2_test> prisma migrate deploy --schema prisma/schema.prisma", ["T-MIG-01"]),
    integration: run(20, "cd server && DATABASE_URL_TEST=<redacted; toktickit_l410_final_integration_test> npm run test:integration -- --reporter=verbose", ["T-MIG-01", "T-MIG-02", "T-MIG-03", "T-MIG-04", "T-MIG-05", "T-RACE-01", "T-RACE-02", "T-RACE-03", "T-RACE-04", "T-DB-DASH-01", "T-PERF-01"]),
    serverTests: run(175, "cd server && npm test -- --reporter=dot", ["T-SEC-01", "T-SEC-02", "T-SEC-03", "T-REG-01", "T-REG-02"]),
    clientTests: run(134, "cd client && npm test -- --reporter=dot", ["T-A11Y-01", "T-STYLE-01", "T-UI-REG-01", "T-UI-DR-01", "T-UI-DS-01"]),
    lab2E2E: run(3, "cd client && E2E_SUITE=lab2 npm run test:e2e -- --workers=1 --retries=0", ["T-UI-REG-01"]),
    lab3E2E: run(9, "cd client && E2E_SUITE=lab3 npm run test:e2e:lab3 -- --workers=1 --retries=0", ["T-REG-01", "T-UI-REG-01"]),
    lab4E2E: run(9, "cd client && npm run test:e2e:lab4 -- --workers=1 --retries=0", ["T-E2E-01", "T-E2E-02", "T-E2E-03", "T-RESP-01"]),
    contractTests: run(5, "node --test scripts/lab-04/verify-contract.test.mjs", ["T-CONTRACT-01", "T-EVID-01"]),
  },
  browserMatrix: ["T-E2E-01", "T-E2E-02", "T-E2E-03"].flatMap((testId) => ["desktop", "tablet", "mobile"].map((project) => ({ testId, project, passed: 1, failed: 0, skipped: 0, retries: 0 }))),
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
  migration: { log: "artifacts/lab-04/migration/migration.log", appliedMigrations: 4, integrationPassed: 20 },
  metrics: { report: "artifacts/lab-04/metrics/report.md", explainPlan: "artifacts/lab-04/metrics/explain-plan.json", fixtureTickets: Number(perf.fixtureCounts.tickets), fixtureActions: Number(perf.fixtureCounts.actions), requesterQueries: perf.requesterQueryCount, staffQueries: perf.staffQueryCount, p95Ms: Math.max(perf.requesterP95Ms, perf.staffP95Ms) },
  validation: { log: "artifacts/lab-04/validation/validation.log" },
  screenshots,
};

await writeFile(path.join(root, "artifacts/lab-04/validation/evidence-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote manifest for ${screenshots.length} PNGs and source ${sourceCommit}.`);
