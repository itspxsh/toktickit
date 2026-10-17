import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const suite = process.env.E2E_SUITE === "lab3" ? "lab-03" : "lab-02";
const artifactRoot = path.resolve(process.cwd(), "..", process.env.E2E_ARTIFACT_ROOT ?? `artifacts/${suite}`);
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173";
const baseUrl = new URL(baseURL);
const clientPort = baseUrl.port || (baseUrl.protocol === "https:" ? "443" : "80");
const apiURL = process.env.E2E_API_URL ?? "http://127.0.0.1:3000";
const apiUrl = new URL(apiURL);
const apiPort = apiUrl.port || (apiUrl.protocol === "https:" ? "443" : "80");

/**
 * The release suite intentionally runs against the real local API and Vite
 * servers. A missing database therefore produces a visible test failure; no
 * mock or skip path is configured here.
 */
export default defineConfig({
  testDir: `../e2e/${suite}`,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: `${artifactRoot}/playwright-report`, open: "never" }]],
  outputDir: `${artifactRoot}/playwright-results`,
  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    // Use Chromium at the mobile viewport so the suite is reproducible without
    // requiring a second browser binary merely for responsive assertions.
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 800 } } },
  ],
  webServer: [
    {
      command: `set -a; . server/.env; set +a; if [ -n "\${E2E_DATABASE_URL:-}" ]; then export DATABASE_URL="$E2E_DATABASE_URL"; fi; if [ -n "\${E2E_AUTH_ORIGIN:-}" ]; then export AUTH_ORIGIN="$E2E_AUTH_ORIGIN"; fi; if [ -n "\${E2E_SESSION_COOKIE_SECURE:-}" ]; then export SESSION_COOKIE_SECURE="$E2E_SESSION_COOKIE_SECURE"; fi; export PORT='${apiPort}'; npm --prefix server run build && npm --prefix server run start`,
      cwd: "..",
      url: `${apiURL}/api/health`,
      timeout: 30_000,
      reuseExistingServer: false,
    },
    {
      command: `VITE_API_URL='${apiURL}' npm --prefix client run dev -- --host 127.0.0.1 --port ${clientPort} --strictPort`,
      cwd: "..",
      url: baseURL,
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
