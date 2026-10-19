function requireMatch(match, label) {
  if (!match) throw new Error(`Could not derive a completed ${label} summary from retained output.`);
  return match;
}

function requireCleanCounts(passed, failed, skipped, total, label) {
  if (passed + failed + skipped !== total) throw new Error(`${label} summary counts do not add up to the executed total.`);
  if (failed !== 0) throw new Error(`${label} run contains failed tests.`);
  if (skipped !== 0) throw new Error(`${label} run contains skipped tests.`);
  return { passed, failed, skipped, retries: 0 };
}

export function parseVitestRun(output) {
  const line = output.match(/^\s*Tests\s+(.+)$/m)?.[1];
  const summary = requireMatch(line, "Vitest");
  const passed = Number(summary.match(/(\d+)\s+passed/)?.[1] ?? 0);
  const failed = Number(summary.match(/(\d+)\s+failed/)?.[1] ?? 0);
  const skipped = Number(summary.match(/(\d+)\s+(?:skipped|pending|todo)/)?.[1] ?? 0);
  const total = Number(summary.match(/\((\d+)\)/)?.[1] ?? passed + failed + skipped);
  return requireCleanCounts(passed, failed, skipped, total, "Vitest");
}

export function parseNodeTestRun(output) {
  const count = (name) => Number(output.match(new RegExp(`^ℹ ${name} (\\d+)$`, "m"))?.[1] ?? NaN);
  const total = count("tests");
  const passed = count("pass");
  const failed = count("fail");
  const skipped = count("skipped");
  requireMatch(Number.isInteger(total) && Number.isInteger(passed) && Number.isInteger(failed) && Number.isInteger(skipped), "Node test");
  if (/^ℹ todo [1-9]\d*$/m.test(output)) throw new Error("Node test run contains todo tests.");
  return requireCleanCounts(passed, failed, skipped, total, "Node test");
}

export function parsePlaywrightRun(output) {
  if (/\b(?:failed|skipped|flaky|retry(?:ing)? #)\b/i.test(output)) throw new Error("Playwright output reports failed, skipped, flaky, or retried tests.");
  const match = output.match(/^\s*(\d+) passed\b/m);
  return requireCleanCounts(Number(requireMatch(match, "Playwright")[1]), 0, 0, Number(match[1]), "Playwright");
}

export function parsePlaywrightMatrix(output) {
  const run = parsePlaywrightRun(output);
  const matrix = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*✓\s+\d+\s+\[(desktop|tablet|mobile)\]\s+›.*?\b(T-E2E-0[123])\b/);
    if (match) matrix.push({ testId: match[2], project: match[1], passed: 1, failed: 0, skipped: 0, retries: 0 });
  }
  const keys = matrix.map(({ testId, project }) => `${testId}:${project}`);
  if (run.passed !== 9 || matrix.length !== 9 || new Set(keys).size !== 9) {
    throw new Error("Playwright summary does not match one completed run for every Lab 4 journey and viewport.");
  }
  return matrix;
}

export function parseMigrationDeploy(output) {
  const migrations = Number(requireMatch(output.match(/^\s*(\d+) migrations found(?: in .+)?\s*$/m), "migration deploy")[1]);
  if (!/All migrations have been successfully applied\./.test(output)) {
    throw new Error("Migration deploy output does not confirm successful application.");
  }
  return migrations;
}
