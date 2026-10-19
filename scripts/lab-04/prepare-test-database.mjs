#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function guardedDatabaseUrl(value, variableName) {
  if (!value) throw new Error(`${variableName} is required; no database action was run.`);
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new Error(`${variableName} must be a valid PostgreSQL URL; no database action was run.`); }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) throw new Error(`${variableName} must use PostgreSQL; no database action was run.`);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!/(^|[_-])test$/i.test(databaseName)) throw new Error(`${variableName} must name an isolated database ending in _test; no database action was run.`);
  return { value, databaseName };
}

function run(args, env) {
  const result = spawnSync("npm", args, { cwd: process.cwd(), env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const testDb = guardedDatabaseUrl(process.env.DATABASE_URL_TEST, "DATABASE_URL_TEST");
const reset = process.argv.includes("--reset");
const env = {
  ...process.env,
  DATABASE_URL: testDb.value,
  DATABASE_URL_TEST: testDb.value,
};
console.log(`Preparing isolated PostgreSQL database: ${testDb.databaseName}`);
run(["--prefix", "server", "run", "prisma:migrate"], env);
if (reset) {
  if (!env.LAB3_INITIAL_PASSWORD) throw new Error("LAB3_INITIAL_PASSWORD is required for --reset; the migration step has completed but no reset was run.");
  run(["--prefix", "server", "run", "db:test:reset"], env);
}
