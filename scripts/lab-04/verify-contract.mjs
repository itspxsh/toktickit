#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMigrationDeploy, parseNodeTestRun, parsePlaywrightMatrix, parsePlaywrightRun, parseVitestRun } from "./parse-run-evidence.mjs";
import { evidenceHashMatches } from "./evidence-hash.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const defaultManifest = path.join(root, "artifacts/lab-04/validation/evidence-manifest.json");
const REQUIRED_ACS = ["AC-15", "AC-16", "AC-17", "AC-18", "AC-19", "AC-20", "AC-21", "AC-22"];
const REQUIRED_JOURNEYS = ["T-E2E-01", "T-E2E-02", "T-E2E-03"];
const REQUIRED_RUNS = ["migrationDeploy", "integration", "serverTests", "clientTests", "lab2E2E", "lab3E2E", "lab4E2E", "contractTests"];
const RUN_LOGS = {
  migrationDeploy: ["artifacts/lab-04/migration/migration.log", parseMigrationDeploy],
  integration: ["artifacts/lab-04/validation/integration.log", parseVitestRun],
  serverTests: ["artifacts/lab-04/validation/server-tests.log", parseVitestRun],
  clientTests: ["artifacts/lab-04/validation/client-tests.log", parseVitestRun],
  lab2E2E: ["artifacts/lab-04/validation/lab2-e2e.log", parsePlaywrightRun],
  lab3E2E: ["artifacts/lab-04/validation/lab3-e2e.log", parsePlaywrightRun],
  lab4E2E: ["artifacts/lab-04/validation/lab4-e2e.log", parsePlaywrightRun],
  contractTests: ["artifacts/lab-04/validation/contract-tests.log", parseNodeTestRun],
};
const RUN_COMMANDS = {
  migrationDeploy: "cd server && DATABASE_URL=<redacted; toktickit_l410_review_migration_test> ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma",
  integration: "cd server && DATABASE_URL_TEST=<redacted; toktickit_l410_final_integration_test> LAB3_INITIAL_PASSWORD=<redacted; synthetic local-only value> npm run test:integration -- --reporter=verbose",
  serverTests: "cd server && npm test -- --reporter=verbose",
  clientTests: "cd client && npm test -- --reporter=verbose",
  lab2E2E: "cd client && E2E_SUITE=lab2 npm run test:e2e -- --workers=1 --retries=0",
  lab3E2E: "cd client && E2E_SUITE=lab3 npm run test:e2e:lab3 -- --workers=1 --retries=0",
  lab4E2E: "cd client && npm run test:e2e:lab4 -- --workers=1 --retries=0",
  contractTests: "node --test scripts/lab-04/verify-contract.test.mjs",
};

function fail(message) { throw new Error(message); }

async function fileExists(relativePath) {
  if (typeof relativePath !== "string" || relativePath.startsWith("/") || relativePath.includes("..")) return false;
  try { return (await stat(path.join(root, relativePath))).isFile(); }
  catch { return false; }
}

async function resolveInventoryPath(candidate) {
  if (await fileExists(candidate)) return path.join(root, candidate);
  if (candidate.includes("*") || candidate.includes("{") || candidate.includes("existing L1")) return null;
  if (candidate.startsWith("lab-0")) {
    for (const prefix of ["server/tests", "client/tests", "e2e"]) if (await fileExists(`${prefix}/${candidate}`)) return path.join(root, `${prefix}/${candidate}`);
  }
  if (candidate.includes("/")) return null;
  const prefixes = ["server/tests/lab-01", "server/tests/lab-02", "server/tests/lab-03", "server/tests/lab-04", "client/tests/lab-01", "client/tests/lab-02", "client/tests/lab-03", "client/tests/lab-04", "e2e/lab-02", "e2e/lab-03", "e2e/lab-04", "scripts/lab-04"];
  for (const prefix of prefixes) {
    if (await fileExists(`${prefix}/${candidate}`)) return path.join(root, `${prefix}/${candidate}`);
    if (candidate.endsWith(".test.ts")) {
      const tsxPath = `${prefix}/${candidate}x`;
      if (await fileExists(tsxPath)) return path.join(root, tsxPath);
    }
  }
  return null;
}

async function sha256(relativePath) {
  return createHash("sha256").update(await readFile(path.join(root, relativePath))).digest("hex");
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") fail("Invalid PNG signature.");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export async function validateEvidenceManifest(manifest) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(manifest?.schemaVersion === 1, "schemaVersion must be 1.");
  require(/^[a-f0-9]{40}$/i.test(manifest?.sourceCommit ?? ""), "sourceCommit must be a full 40-character commit SHA.");
  require(/^[a-f0-9]{40}$/i.test(manifest?.validationCommit ?? ""), "validationCommit must identify the test/E2E harness tree with a full commit SHA.");
  require(manifest?.sourceCommit === manifest?.validationCommit, "sourceCommit compatibility field must match validationCommit.");
  require(/^[a-f0-9]{40}$/i.test(manifest?.productCommit ?? ""), "productCommit must identify the tested product source with a full commit SHA.");
  require(manifest?.productCommit === manifest?.validationCommit, "productCommit must match validationCommit so evidence identifies the exact tested source tree.");
  require(/^[a-f0-9]{40}$/i.test(manifest?.evidenceToolCommit ?? ""), "evidenceToolCommit must identify the evidence parser/verifier source with a full commit SHA.");
  require((manifest?.database?.name ?? "").toLowerCase().endsWith("_test"), "database.name must end in _test; never store its URL.");
  require(manifest?.database?.urlRecorded === false, "database.urlRecorded must be false.");

  const runs = manifest?.runs ?? {};
  require(REQUIRED_RUNS.every((name) => Object.hasOwn(runs, name)), `runs must include every required execution: ${REQUIRED_RUNS.join(", ")}.`);
  const executedTestIds = new Set();
  for (const [name, run] of Object.entries(runs)) {
    if (!run || typeof run !== "object") { errors.push(`${name} run metadata is missing.`); continue; }
    require(Number.isInteger(run.passed) && run.passed >= 0, `${name}.passed must be an actual non-negative integer.`);
    require(run.failed === 0, `${name}.failed must be zero.`);
    require(run.skipped === 0, `${name}.skipped must be zero.`);
    require(run.retries === 0, `${name}.retries must be zero.`);
    require(typeof run.command === "string" && run.command.length > 0, `${name}.command is required.`);
    require(run.command === RUN_COMMANDS[name], `${name}.command is not an approved reproducible command.`);
    require(!/postgres(?:ql)?:\/\/[^\s]+/i.test(run.command), `${name}.command must redact database URLs.`);
    require(Array.isArray(run.testIds), `${name}.testIds must list test IDs exercised by this run.`);
    if (name === "lab3E2E") require(run.testIds?.length === 0, "lab3E2E.testIds must not claim Lab 4 journey IDs for Lab 3 regression runs.");
    if (name === "contractTests") {
      const expectedContractIds = ["RELEASE-01", "T-CONTRACT-01", "T-EVID-01"];
      require(JSON.stringify(run.testIds) === JSON.stringify(expectedContractIds), `contractTests.testIds must contain only contract/evidence IDs: ${expectedContractIds.join(", ")}.`);
    }
    if (name === "migrationDeploy") require(run.testIds?.length === 0, "migrationDeploy.testIds must be empty; a migration command is not a test-runner execution.");
    const inventory = await loadTestInventory();
    for (const testId of run.testIds ?? []) {
      if (typeof testId === "string" && inventory.has(testId)) executedTestIds.add(testId);
      else errors.push(`${name}.testIds references ${String(testId)}, which is absent from the contract inventory and its test file.`);
    }
    const [logPath, parser] = RUN_LOGS[name] ?? [];
    if (logPath && parser) {
      try {
        const output = await readFile(path.join(root, logPath), "utf8");
        const actual = parser(output);
        const actualPassed = typeof actual === "number" ? actual : actual.passed;
        require(run.passed === actualPassed, `${name}.passed (${run.passed}) does not match retained run log (${actualPassed}).`);
        if (typeof actual === "object") {
          require(run.failed === actual.failed && run.skipped === actual.skipped && run.retries === actual.retries, `${name} failure/skip/retry metadata does not match its retained run log.`);
        }
        const observedIds = extractExecutedTestIds(output);
        for (const testId of run.testIds ?? []) {
          if (name === "migrationDeploy") continue; // Migrate deploy output has migration names, not test-runner IDs.
          require(observedIds.has(testId), `${name}.testIds claims ${testId}, but that ID is absent from the retained execution output.`);
        }
      } catch (error) {
        errors.push(`${name} could not be verified against ${logPath}: ${error.message}`);
      }
    }
  }

  const matrix = manifest?.browserMatrix;
  require(Array.isArray(matrix), "browserMatrix must be an array.");
  if (Array.isArray(matrix)) {
    const expected = new Set(REQUIRED_JOURNEYS.flatMap((journey) => ["desktop", "tablet", "mobile"].map((viewport) => `${journey}:${viewport}`)));
    const actual = new Set(matrix.map((row) => `${row?.testId}:${row?.project}`));
    require(actual.size === expected.size && [...expected].every((entry) => actual.has(entry)), "browserMatrix must contain exactly three journeys across desktop/tablet/mobile.");
    for (const row of matrix) {
      require(row.passed === 1 && row.failed === 0 && row.skipped === 0 && row.retries === 0, `${row.testId}/${row.project} must be one green, non-retried execution.`);
      if (typeof row.testId === "string") executedTestIds.add(row.testId);
    }
    try {
      const actual = parsePlaywrightMatrix(await readFile(path.join(root, RUN_LOGS.lab4E2E[0]), "utf8"));
      const key = ({ testId, project, passed, failed, skipped, retries }) => `${testId}:${project}:${passed}:${failed}:${skipped}:${retries}`;
      require([...matrix].map(key).sort().join("\n") === [...actual].map(key).sort().join("\n"), "browserMatrix does not match the retained Lab 4 Playwright run log.");
    } catch (error) {
      errors.push(`browserMatrix could not be verified against the Lab 4 run log: ${error.message}`);
    }
  }

  require(manifest?.traceability && REQUIRED_ACS.every((ac) => Array.isArray(manifest.traceability[ac]) && manifest.traceability[ac].length > 0), "AC-15..22 must each map to executed test IDs.");
  for (const ac of REQUIRED_ACS) {
    for (const testId of manifest?.traceability?.[ac] ?? []) {
      require(executedTestIds.has(testId), `${ac} maps to ${testId}, which is not present in any recorded executed run.`);
    }
  }
  require(manifest?.releaseGate?.id === "RELEASE-01" && ["awaiting_peer_review", "approved_for_staging", "pending_final_main_validation", "complete"].includes(manifest?.releaseGate?.status), "RELEASE-01 must record an explicit, recognized release-gate status.");
  if (manifest?.releaseGate?.status === "complete") {
    const evidence = manifest.releaseGate.completionEvidence;
    require(await fileExists(evidence?.finalMainValidationLog), "RELEASE-01 cannot be complete without retained final-main validation evidence.");
    require(typeof evidence?.docsOnlyCloseoutPr === "string" && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(evidence.docsOnlyCloseoutPr), "RELEASE-01 cannot be complete without a verifiable documentation-only closeout PR URL.");
    require(await fileExists(evidence?.kanbanEvidence), "RELEASE-01 cannot be complete without retained Kanban closeout evidence.");
    require(await fileExists(evidence?.reportPdf), "RELEASE-01 cannot be complete without the final report PDF evidence.");
  }
  for (const relativePath of [manifest?.migration?.log, manifest?.metrics?.report, manifest?.validation?.log]) {
    require(await fileExists(relativePath), `Required evidence file is missing: ${relativePath ?? "<unset>"}.`);
  }
  let migrationsFromLog = null;
  try { migrationsFromLog = parseMigrationDeploy(await readFile(path.join(root, RUN_LOGS.migrationDeploy[0]), "utf8")); }
  catch (error) { errors.push(`Migration count could not be verified from deploy log: ${error.message}`); }
  require(manifest?.migration?.appliedMigrations === 4 && migrationsFromLog === 4, "All four repository migrations must be verified on the isolated database.");
  require(manifest?.migration?.integrationPassed === runs.integration?.passed && runs.integration?.passed >= 20, "Integration count must match its log and include at least 20 passing tests.");
  require(manifest?.metrics?.fixtureTickets === 5000 && manifest?.metrics?.fixtureActions === 10000, "Performance fixture must be 5,000 Tickets and 10,000 Actions.");
  require(manifest?.metrics?.requesterQueries <= 8 && manifest?.metrics?.staffQueries <= 14, "Measured dashboard data-query counts exceed the contract limits.");
  require(manifest?.metrics?.p95Ms <= 500, "Measured p95 must meet the 500ms contract budget.");
  require(await fileExists(manifest?.metrics?.explainPlan), "EXPLAIN ANALYZE output is missing.");

  require(Array.isArray(manifest?.screenshots) && manifest.screenshots.length > 0, "At least one committed screenshot is required.");
  for (const shot of manifest?.screenshots ?? []) {
    const validPath = await fileExists(shot.path);
    require(validPath, `Screenshot is missing or outside the repository: ${shot.path}.`);
    require(/^[a-f0-9]{64}$/i.test(shot.sha256 ?? ""), `Screenshot SHA-256 is missing: ${shot.path}.`);
    require(Array.isArray(shot.ac) && shot.ac.length > 0 && Array.isArray(shot.testIds) && shot.testIds.length > 0, `Screenshot traceability is missing: ${shot.path}.`);
    require(Array.isArray(shot.loadedStateAssertions) && shot.loadedStateAssertions.length > 0, `Screenshot lacks caller-recorded loaded-state assertions: ${shot.path}.`);
    require(typeof shot.redactionReview === "string" && shot.redactionReview.trim().length >= 20, `Screenshot lacks a meaningful redaction review record: ${shot.path}.`);
    const captureExists = await fileExists(shot.captureEvidencePath);
    require(captureExists && /^[a-f0-9]{64}$/i.test(shot.captureEvidenceSha256 ?? ""), `Screenshot capture evidence is missing or unhashed: ${shot.path}.`);
    if (captureExists) {
      const captureBytes = await readFile(path.join(root, shot.captureEvidencePath));
      require(evidenceHashMatches(captureBytes, shot.captureEvidenceSha256), `Screenshot capture evidence hash does not match: ${shot.path}.`);
      try {
        const capture = JSON.parse(captureBytes.toString("utf8"));
        require(JSON.stringify(capture.ac) === JSON.stringify(shot.ac) && JSON.stringify(capture.testIds) === JSON.stringify(shot.testIds), `Screenshot traceability differs from caller capture evidence: ${shot.path}.`);
        require(JSON.stringify(capture.loadedStateAssertions) === JSON.stringify(shot.loadedStateAssertions) && capture.redactionReview === shot.redactionReview, `Screenshot state/redaction fields differ from caller capture evidence: ${shot.path}.`);
      } catch (error) { errors.push(`Screenshot capture evidence is invalid for ${shot.path}: ${error.message}`); }
    }
    for (const testId of shot.testIds ?? []) require((await loadTestInventory()).has(testId), `Screenshot ${shot.path} references test ID ${testId} absent from the contract inventory.`);
    if (validPath) {
      require(await sha256(shot.path) === shot.sha256, `Screenshot hash does not match: ${shot.path}.`);
      const dimensions = pngDimensions(await readFile(path.join(root, shot.path)));
      require(dimensions.width === shot.width && dimensions.height === shot.height, `Screenshot dimensions do not match the manifest: ${shot.path}.`);
      require(["desktop", "tablet", "mobile"].includes(shot.project), `Unknown screenshot viewport project: ${shot.path}.`);
    }
  }

  require(Array.isArray(manifest?.textEvidence) && manifest.textEvidence.length > 0, "textEvidence must enumerate retained text logs and metrics for privacy scanning.");
  for (const relativePath of manifest?.textEvidence ?? []) {
    const exists = await fileExists(relativePath);
    require(exists, `Text evidence is missing or outside the repository: ${relativePath}.`);
    if (exists) {
      const finding = scanSensitiveEvidenceText(await readFile(path.join(root, relativePath), "utf8"));
      require(finding === null, `${finding} in ${relativePath}.`);
    }
  }
  return errors;
}

function extractExecutedTestIds(output) {
  return new Set(output.match(/\b(?:T-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}|RELEASE-01)\b/g) ?? []);
}

async function loadTestInventory() {
  const source = await readFile(path.join(root, "docs/lab-04/tests.md"), "utf8");
  const inventorySection = source.split("## 6. AC crosswalk")[0];
  return new Set([...inventorySection.matchAll(/^\|\s*((?:T-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}|RELEASE-01))\s*\|/gm)].map((match) => match[1]));
}

export async function validateContractInventory() {
  const errors = [];
  const source = await readFile(path.join(root, "docs/lab-04/tests.md"), "utf8");
  const inventorySection = source.split("## 6. AC crosswalk")[0];
  const rows = [...inventorySection.matchAll(/^\|\s*((?:T-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}|RELEASE-01))\s*\|([^\n]*)$/gm)];
  const seen = new Set();
  for (const [, id, body] of rows) {
    if (seen.has(id)) errors.push(`Duplicate test ID in inventory: ${id}.`);
    seen.add(id);
    const pathCell = body.split("|").at(-2) ?? "";
    const candidates = pathCell.match(/[a-zA-Z0-9_./*-]+\.(?:spec\.ts|test\.tsx?|test\.mjs|mjs|ts|tsx)/g) ?? [];
    if (!candidates.length) { errors.push(`${id} has no concrete test or evidence file path.`); continue; }
    let foundIdInSource = false;
    for (const candidate of candidates) {
      if (candidate.includes("*") || candidate.includes("existing L1")) continue;
      const resolvedPath = await resolveInventoryPath(candidate);
      if (!resolvedPath) { errors.push(`${id} maps to a nonexistent path: ${candidate}.`); continue; }
      if ((await readFile(resolvedPath, "utf8")).includes(id)) foundIdInSource = true;
    }
    if (id !== "RELEASE-01" && !foundIdInSource) errors.push(`${id} is listed but not present in any mapped test/evidence file.`);
  }
  for (const id of seen) {
    if (id === "RELEASE-01") continue;
    if (!new RegExp(`\\b${id}\\b`).test(inventorySection)) errors.push(`${id} is not resolvable in the contract inventory.`);
  }
  const mappingSection = source.split("## 6.1 Contract implementation index")[1]?.split("## 6. AC crosswalk")[0] ?? "";
  const reviewer = await readFile(path.join(root, "docs/lab-04/reviewer.md"), "utf8");
  const mappingRows = [...mappingSection.matchAll(/^\|\s*([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|\s*$/gm)];
  const mappedRequirements = new Set();
  const expand = (value) => value.trim().split(/[,; ]+/).flatMap((token) => {
    const range = token.match(/^(FR|BR|AC)-(\d{2})\.\.(?:FR|BR|AC)-(\d{2})$/);
    if (range) return Array.from({ length: Number(range[3]) - Number(range[2]) + 1 }, (_, index) => `${range[1]}-${String(Number(range[2]) + index).padStart(2, "0")}`);
    return token.match(/^(?:FR|BR|AC)-\d{2}$/) ? [token] : [];
  });
  for (const [, ids, issue, files, tests, status] of mappingRows) {
    if (ids.trim() === "Requirement ID" || /^-+$/.test(ids.trim())) continue;
    if (!/#\d+/.test(issue)) errors.push(`Contract mapping ${ids.trim()} has no implementation Issue.`);
    for (const issueNumber of issue.match(/#\d+/g) ?? []) if (!reviewer.includes(issueNumber)) errors.push(`Contract mapping ${ids.trim()} references Issue ${issueNumber} absent from reviewer.md history.`);
    if (!status.trim()) errors.push(`Contract mapping ${ids.trim()} has no status.`);
    const filePaths = [...files.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    if (!filePaths.length) errors.push(`Contract mapping ${ids.trim()} has no implementation file.`);
    for (const file of filePaths) if (!await fileExists(file)) errors.push(`Contract mapping ${ids.trim()} maps to nonexistent file ${file}.`);
    const testIds = tests.match(/T-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{2}/g) ?? [];
    if (!testIds.length) errors.push(`Contract mapping ${ids.trim()} has no test IDs.`);
    for (const testId of testIds) if (!seen.has(testId)) errors.push(`Contract mapping ${ids.trim()} references unknown test ${testId}.`);
    for (const id of expand(ids)) {
      if (mappedRequirements.has(id)) errors.push(`Duplicate requirement mapping: ${id}.`);
      mappedRequirements.add(id);
    }
  }
  const specification = await readFile(path.join(root, "docs/lab-04/specification.md"), "utf8");
  for (const kind of ["FR", "BR", "AC"]) {
    const expected = new Set([...specification.matchAll(new RegExp(`\\b${kind}-\\d{2}\\b`, "g"))].map((match) => match[0]));
    for (const id of expected) if (!mappedRequirements.has(id)) errors.push(`${id} has no implementation Issue/file/test/status mapping.`);
  }
  return errors;
}

export function scanSensitiveEvidenceText(contents) {
  if (/(?:postgres(?:ql)?:\/\/)[^\s]+/i.test(contents) || /\bDATABASE_URL(?:_TEST)?\s*=\s*(?!<redacted\b)\S+/i.test(contents)) {
    return "Raw database URL found";
  }
  if (/\b(?:E2E_(?:REQUESTER|STAFF|ADMIN)_(?:PASSWORD|NEW_PASSWORD)|[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN))\s*=\s*(?!<redacted\b)\S+/i.test(contents)) {
    return "Credential found";
  }
  return null;
}

async function main() {
  const manifestPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultManifest;
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch { fail(`Cannot read a valid evidence manifest at ${path.relative(root, manifestPath)}.`); }
  const errors = await validateEvidenceManifest(manifest);
  if (errors.length) {
    console.error(`L4-10 evidence verification failed (${errors.length} issue${errors.length === 1 ? "" : "s"}):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`L4-10 evidence verified for product ${manifest.productCommit}, Playwright tree ${manifest.validationCommit}, and evidence tools ${manifest.evidenceToolCommit}: ${manifest.browserMatrix.length} browser runs, ${manifest.screenshots.length} traceable screenshots, migration/security/responsive/performance evidence present.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
