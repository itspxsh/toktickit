const path = require("node:path");

const REPOSITORY_ROOT = path.resolve(__dirname, "..");

/** Resolve E2E artifacts from the repository, independent of the caller's cwd. */
function resolveArtifactRoot(defaultRoot, configuredRoot = process.env.E2E_ARTIFACT_ROOT) {
  const root = configuredRoot?.trim() || defaultRoot;
  return path.resolve(REPOSITORY_ROOT, root);
}

module.exports = { REPOSITORY_ROOT, resolveArtifactRoot };
