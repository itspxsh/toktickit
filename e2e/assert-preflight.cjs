const net = require("node:net");

function isLoopbackHostname(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return true;
  if (net.isIP(host) === 4) return Number(host.split(".")[0]) === 127;
  return false;
}

function preflightError(env = process.env) {
  try {
    const database = new URL(env.E2E_DATABASE_URL || "");
    const databaseName = decodeURIComponent(database.pathname.split("/").pop() || "");
    const client = new URL(env.E2E_BASE_URL || "");
    const auth = new URL(env.E2E_AUTH_ORIGIN || "");
    const secureCookie = env.E2E_SESSION_COOKIE_SECURE;
    if (!["postgres:", "postgresql:"].includes(database.protocol)) return "E2E_DATABASE_URL must use PostgreSQL.";
    if (!/_test$/i.test(databaseName)) return "E2E_DATABASE_URL must name a database ending in _test.";
    if (!["http:", "https:"].includes(client.protocol)) return "E2E_BASE_URL must use HTTP or HTTPS.";
    if (client.origin !== auth.origin) return "E2E_BASE_URL and E2E_AUTH_ORIGIN must have the same origin.";
    if (client.protocol === "http:") {
      const loopback = isLoopbackHostname(client.hostname);
      if (loopback && secureCookie !== "false") {
        return "SESSION_COOKIE_SECURE=false is required for local HTTP E2E.";
      }
      if (!loopback && secureCookie === "false") {
        return "SESSION_COOKIE_SECURE=false is only allowed for local HTTP origins.";
      }
    }
    if (client.protocol === "https:" && secureCookie === "false") {
      return "SESSION_COOKIE_SECURE=false is not allowed for HTTPS E2E.";
    }
    return null;
  } catch {
    return "E2E database and origin settings must be valid URLs.";
  }
}

if (require.main === module) {
  const error = preflightError();
  if (error) {
    console.error(`E2E preflight failed: ${error}`);
    process.exitCode = 1;
  }
}

module.exports = { preflightError };
