import { defineConfig, devices } from "@playwright/test";

const suite = process.env.E2E_SUITE === "lab3" ? "lab-03" : "lab-02";

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
  reporter: [["list"], ["html", { outputFolder: `../artifacts/${suite}/playwright-report`, open: "never" }]],
  outputDir: `../artifacts/${suite}/playwright-results`,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
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
      command: "set -a; . server/.env; set +a; npm --prefix server run build && npm --prefix server run start",
      cwd: "..",
      url: "http://127.0.0.1:3000/api/health",
      timeout: 30_000,
      reuseExistingServer: true,
    },
    {
      command: "npm --prefix client run dev -- --host 127.0.0.1",
      cwd: "..",
      url: "http://127.0.0.1:5173",
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
});
