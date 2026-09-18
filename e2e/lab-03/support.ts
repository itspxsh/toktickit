import { expect, type Page, type TestInfo } from "../../client/node_modules/@playwright/test/index.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const API_BASE_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:3000";
const REPOSITORY_ROOT = path.basename(process.cwd()) === "client"
  ? path.resolve(process.cwd(), "..")
  : path.resolve(process.cwd());
const ARTIFACT_ROOT = path.join(REPOSITORY_ROOT, "artifacts/lab-03/screenshots");

export type E2ERole = "requester" | "staff" | "admin";

const ROLE_ENV: Record<E2ERole, { email: string; password: string; newPassword: string }> = {
  requester: {
    email: "E2E_REQUESTER_EMAIL",
    password: "E2E_REQUESTER_PASSWORD",
    newPassword: "E2E_REQUESTER_NEW_PASSWORD",
  },
  staff: {
    email: "E2E_STAFF_EMAIL",
    password: "E2E_STAFF_PASSWORD",
    newPassword: "E2E_STAFF_NEW_PASSWORD",
  },
  admin: {
    email: "E2E_ADMIN_EMAIL",
    password: "E2E_ADMIN_PASSWORD",
    newPassword: "E2E_ADMIN_NEW_PASSWORD",
  },
};

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}; provide fake local-only E2E credentials before running Lab 3 E2E.`);
  return value;
}

export async function preflight(page: Page): Promise<void> {
  try {
    const response = await page.request.get(`${API_BASE_URL}/api/health`, { timeout: 5_000 });
    const body = await response.text();
    expect(response.ok(), `API preflight failed (${response.status()}): ${body}`).toBeTruthy();
  } catch (error) {
    throw new Error(
      `Lab 3 E2E requires a live API and seeded PostgreSQL database at ${API_BASE_URL}. ` +
      `Apply migrations and seed before running; original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function signIn(page: Page, role: E2ERole): Promise<void> {
  const credentials = ROLE_ENV[role];
  const email = requiredEnv(credentials.email);
  const password = requiredEnv(credentials.password);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const changePassword = page.getByRole("heading", { name: "Change Password" });
  if (await changePassword.isVisible({ timeout: 2_000 }).catch(() => false)) {
    const nextPassword = requiredEnv(credentials.newPassword);
    await page.getByLabel("Current password").fill(password);
    await page.getByLabel("New password").fill(nextPassword);
    await page.getByLabel("Confirm new password").fill(nextPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(changePassword).toHaveCount(0);
  }

  const destination = role === "requester" ? "My Tickets" : role === "staff" ? "Staff Tickets" : "User Management";
  await expect(page.getByRole("link", { name: destination })).toBeVisible();
}

export async function saveScreenshot(page: Page, testInfo: TestInfo, area: string, state: string): Promise<void> {
  const project = testInfo.project.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const directory = path.join(ARTIFACT_ROOT, area);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${state}-${project}.png`), fullPage: true });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

export async function csrfToken(page: Page): Promise<string> {
  const response = await page.request.get(`${API_BASE_URL}/api/auth/csrf`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as { csrfToken?: unknown };
  if (typeof body.csrfToken !== "string") throw new Error("CSRF preflight did not return a token.");
  return body.csrfToken;
}
