import { expect, test, type Page, type TestInfo } from "../../client/node_modules/@playwright/test/index.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const API_BASE_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:3000";
const REPOSITORY_ROOT = path.basename(process.cwd()) === "client"
  ? path.resolve(process.cwd(), "..")
  : path.resolve(process.cwd());
const ARTIFACT_ROOT = path.join(REPOSITORY_ROOT, "artifacts/lab-02/screenshots");

const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function screenshot(page: Page, testInfo: TestInfo, area: string, state: string): Promise<void> {
  const project = testInfo.project.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const directory = path.join(ARTIFACT_ROOT, area);
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: path.join(directory, `${state}-${project}.png`),
    fullPage: true,
  });
}

async function selectRequester(page: Page, optionIndex: number): Promise<number> {
  const requester = page.locator("#development-requester");
  await expect(requester).toBeVisible();
  const options = requester.locator("option:not([value=''])");
  await expect.poll(() => options.count()).toBeGreaterThan(optionIndex);
  const option = options.nth(optionIndex);
  const optionValue = await option.getAttribute("value");
  expect(optionValue).not.toBeNull();
  await requester.selectOption(optionValue!);
  const value = await requester.inputValue();
  const requesterId = Number(value);
  expect(Number.isSafeInteger(requesterId)).toBeTruthy();
  await page.getByRole("button", { name: "Continue" }).click();
  return requesterId;
}

function primaryLink(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name });
}

async function clickPrimaryLink(page: Page, name: string): Promise<void> {
  const link = primaryLink(page, name);
  if (!(await link.isVisible())) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
  }
  await expect(link).toBeVisible();
  await link.click();
}

test.describe("Lab 2 requester release flow", () => {
  test("E2E-01/02/03, RESP-01/02/03, A11Y-01: exercises the integrated requester journey", async ({ page }, testInfo) => {
    test.setTimeout(90_000);

    // Fail fast with an actionable message when the required seeded database
    // is unavailable. This is intentionally a failure, never a skipped test.
    try {
      const preflight = await page.request.get(`${API_BASE_URL}/api/requesters`, { timeout: 5_000 });
      const responseBody = await preflight.text();
      expect(preflight.ok(), `Integrated API preflight failed (${preflight.status()}): ${responseBody}`).toBeTruthy();
    } catch (error) {
      throw new Error(
        `Integrated API preflight could not reach a seeded database at ${API_BASE_URL}. ` +
        "Start PostgreSQL, apply migrations, and run db:seed before E2E. " +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // E2E-01/02: active requester selection and testing-context semantics.
    await page.goto("/select-requester");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(page.getByRole("heading", { name: "Choose a Development Requester" })).toBeVisible();
    await expect(page.getByText("Authentication arrives in Lab 3; this is a testing context only.")).toBeVisible();
    const requesterId = await selectRequester(page, 0);
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await screenshot(page, testInfo, "my-tickets", "initial");

    // E2E-02: dirty-form navigation must be cancellable and then confirmable.
    await clickPrimaryLink(page, "Create Ticket");
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await expect(page.getByLabel("Summary")).toBeVisible();
    await page.getByLabel("Summary").fill("Unsaved release-readiness draft");
    await clickPrimaryLink(page, "My Tickets");
    await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).last().click();
    await expect(page).toHaveURL(/\/create-ticket$/);
    await expect(page.getByLabel("Summary")).toHaveValue("Unsaved release-readiness draft");
    await clickPrimaryLink(page, "My Tickets");
    await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm" }).last().click();
    await expect(page).toHaveURL(/\/tickets$/);

    // Return to requester selection before creating the release evidence Ticket.
    await page.getByRole("button", { name: "Change Requester" }).click();
    await expect(page).toHaveURL(/\/select-requester$/);
    await selectRequester(page, 0);
    await clickPrimaryLink(page, "Create Ticket");
    await expect(page.getByLabel("Summary")).toBeVisible();

    const projectName = testInfo.project.name.replace(/[^a-z0-9-]+/gi, "-");
    const summary = `L2-09 release evidence ${projectName} ${Date.now()}`.slice(0, 120);
    const description = "Integrated Lab 2 release-readiness evidence created by Playwright.";
    await page.getByRole("button", { name: "Submit Ticket" }).click();
    await expect(page.getByText("Category is required.")).toBeVisible();
    await expect(page.getByText("Summary must contain 5-120 characters.")).toBeVisible();
    await screenshot(page, testInfo, "create-ticket", "validation");
    await page.getByLabel("Category").selectOption({ label: "Hardware" });
    await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
    await page.getByLabel("Requested Priority").selectOption("HIGH");
    await page.getByLabel("Summary").fill(summary);
    await page.getByLabel("Description").fill(description);
    await page.getByLabel("Attachments").setInputFiles([
      { name: "release-note.txt", mimeType: "text/plain", buffer: Buffer.from("not an allowed attachment") },
      { name: "release-proof.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG },
    ]);
    await screenshot(page, testInfo, "create-ticket", "filled");

    await page.getByRole("button", { name: "Submit Ticket" }).click();
    await expect(page.getByRole("heading", { name: "Ticket created successfully" })).toBeVisible();
    const ticketSummary = await page.getByText(/Official Ticket Number:/).textContent();
    const ticketNumber = ticketSummary?.match(/TKT-\d{4}-\d{6}/)?.[0];
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    await expect(page.getByRole("listitem").filter({ hasText: "release-note.txt" })).toContainText(/not supported|not allowed|invalid/i);
    await expect(page.getByRole("listitem").filter({ hasText: "release-proof.png" })).toContainText(/Uploaded successfully/);
    await screenshot(page, testInfo, "create-ticket", "success");

    // E2E-01/AC-12: the generated number links to the owned read-only detail.
    await page.getByRole("link", { name: "View Ticket" }).click();
    await expect(page).toHaveURL(new RegExp(`/tickets/${ticketNumber}$`));
    await expect(page.getByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeVisible();
    await expect(page.getByLabel("Summary")).toHaveValue(summary);
    await expect(page.getByLabel("Description")).toHaveValue(description);
    await expect(page.getByLabel("Ticket Number")).toHaveValue(ticketNumber!);
    await screenshot(page, testInfo, "ticket-detail", "success");

    // E2E-03: active attachment actions, download, soft removal, and blocked content.
    await expect(page.getByRole("button", { name: "Download release-proof.png" })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download release-proof.png" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("release-proof.png");
    await page.getByRole("button", { name: "Remove release-proof.png" }).click();
    const removalDialog = page.getByRole("alertdialog", { name: "Remove Attachment?" });
    await expect(removalDialog).toBeVisible();
    await removalDialog.getByLabel("Removal reason").fill("Release evidence cleanup");
    await removalDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/release-proof\.png — Removed/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Download release-proof.png" })).toHaveCount(0);

    const detailResponse = await page.request.get(`${API_BASE_URL}/api/tickets/${encodeURIComponent(ticketNumber!)}`, {
      headers: { "X-Development-Requester-Id": String(requesterId) },
    });
    expect(detailResponse.ok()).toBeTruthy();
    const detailPayload = await detailResponse.json() as { data?: { attachments?: Array<{ id: number; originalName: string; status: string }> } };
    const removedAttachment = detailPayload.data?.attachments?.find((attachment) => attachment.originalName === "release-proof.png");
    expect(removedAttachment?.status).toBe("REMOVED");
    const blockedResponse = await page.request.get(`${API_BASE_URL}/api/tickets/${encodeURIComponent(ticketNumber!)}/attachments/${removedAttachment?.id}/download`, {
      headers: { "X-Development-Requester-Id": String(requesterId) },
    });
    expect(blockedResponse.status()).toBe(404);

    // E2E-02/AC-13: switching to requester B cannot enumerate or open A's Ticket.
    await page.getByRole("button", { name: "Change Requester" }).click();
    await selectRequester(page, 1);
    await expect(page).toHaveURL(/\/tickets$/);
    await expect(page.getByText(summary)).toHaveCount(0);
    await page.goto(`/tickets/${encodeURIComponent(ticketNumber!)}`);
    await expect(page.getByRole("heading", { name: "Ticket not found" })).toBeVisible();
    await expect(page.getByText(summary)).toHaveCount(0);
    await screenshot(page, testInfo, "ticket-detail", "cross-requester-not-found");

    // RESP-01/02/03 and A11Y-01: no horizontal overflow and keyboard focus remains visible.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
    await screenshot(page, testInfo, "responsive", "final");
  });
});
