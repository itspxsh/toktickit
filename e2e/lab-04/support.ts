import { expect, type Page, type TestInfo } from "../../client/node_modules/@playwright/test/index.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expectNoHorizontalOverflow, preflight, signIn } from "../lab-03/support.js";
import { resolveArtifactRoot } from "../artifact-path.cjs";
import { writeFile } from "node:fs/promises";

export const API_BASE_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:3000";
const SCREENSHOT_ROOT = path.join(resolveArtifactRoot("artifacts/lab-04"), "screenshots");

export { expect, expectNoHorizontalOverflow, preflight, signIn };

export interface ScreenshotEvidence {
  ac: string[];
  testIds: string[];
  loadedStateAssertions: string[];
  redactionReview: string;
}

export async function saveScreenshot(page: Page, testInfo: TestInfo, area: string, state: string, evidence: ScreenshotEvidence): Promise<string> {
  if (!evidence.ac.length || !evidence.testIds.length || !evidence.loadedStateAssertions.length || !evidence.redactionReview.trim()) {
    throw new Error(`Screenshot ${area}/${state} requires explicit traceability, loaded-state assertions, and redaction review.`);
  }
  const project = testInfo.project.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const directory = path.join(SCREENSHOT_ROOT, area);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${state}-${project}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await writeFile(`${file}.evidence.json`, `${JSON.stringify({ ...evidence, project }, null, 2)}\n`, { mode: 0o600 });
  return file;
}

export async function createRequesterTicket(page: Page, summary: string): Promise<string> {
  await page.goto("/create-ticket");
  await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
  await page.getByLabel("Category").selectOption({ label: "Hardware" });
  await page.getByLabel("Related System").selectOption({ label: "VPN" });
  await page.getByLabel("Requested Priority").selectOption("HIGH");
  await page.getByLabel("Summary").fill(summary);
  await page.getByLabel("Description").fill(`Live Lab 4 evidence for ${summary}.`);
  await page.getByRole("button", { name: "Submit Ticket" }).click();
  await expect(page.getByRole("heading", { name: "Ticket created successfully" })).toBeVisible();
  const confirmation = await page.getByText(/Official Ticket Number:/).textContent();
  const ticketNumber = confirmation?.match(/TKT-\d{4}-\d{6}/)?.[0];
  expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
  return ticketNumber!;
}

export async function openStaffTicket(page: Page, summary: string): Promise<void> {
  await page.goto("/staff/tickets");
  await expect(page.getByRole("heading", { name: "Staff Ticket Queue" })).toBeVisible();
  await page.getByLabel("Search tickets").fill(summary);
  const row = page.locator("tbody tr").filter({ hasText: summary });
  await expect(row).toBeVisible();
  await row.getByRole("link", { name: /TKT-/ }).click();
  await expect(page.getByRole("heading", { name: "Staff Ticket Detail" })).toBeVisible();
  await expect(page.getByLabel("Ticket Number")).toBeVisible();
}

export async function expectResponsiveAndKeyboard(page: Page, testInfo: TestInfo): Promise<void> {
  const viewport = testInfo.project.use.viewport;
  if (!viewport) throw new Error("Responsive evidence requires an explicit viewport per project.");
  await expect.poll(() => page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))).toEqual(viewport);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toBeVisible();
}

export function csrfHeader(token: string): Record<string, string> {
  return { "x-csrf-token": token, origin: process.env.E2E_AUTH_ORIGIN ?? "http://127.0.0.1:5175" };
}
