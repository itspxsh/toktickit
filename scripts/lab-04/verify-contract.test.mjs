import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

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
