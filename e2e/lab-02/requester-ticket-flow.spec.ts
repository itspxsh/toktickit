import { expect, test, type Page, type TestInfo } from "../../client/node_modules/@playwright/test/index.js";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { API_BASE_URL, expectNoHorizontalOverflow, preflight, signIn } from "../lab-03/support.js";

const REPOSITORY_ROOT = path.basename(process.cwd()) === "client"
  ? path.resolve(process.cwd(), "..")
  : path.resolve(process.cwd());
const ARTIFACT_ROOT = process.env.E2E_ARTIFACT_ROOT
  ? path.resolve(REPOSITORY_ROOT, process.env.E2E_ARTIFACT_ROOT)
  : path.join(REPOSITORY_ROOT, "artifacts/lab-04/regression");
const ONE_BY_ONE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function screenshot(page: Page, testInfo: TestInfo, area: string, state: string): Promise<void> {
  const project = testInfo.project.name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const directory = path.join(ARTIFACT_ROOT, "lab-02", area);
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, `${state}-${project}.png`), fullPage: true });
}

async function clickPrimaryLink(page: Page, name: string): Promise<void> {
  const link = page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name });
  if (!(await link.isVisible())) await page.getByRole("button", { name: "Open navigation menu" }).click();
  await expect(link).toBeVisible();
  await link.click();
}

test.describe("Authenticated Lab 2 requester regression", () => {
  test("T-UI-REG-01 / AC-13, AC-17 preserves create/list/detail/resolution/attachment/dirty-form/owner-isolation", async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000);
    await preflight(page);
    await signIn(page, "requester", testInfo);
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await screenshot(page, testInfo, "my-tickets", "initial");

    await clickPrimaryLink(page, "Create Ticket");
    await expect(page.getByRole("heading", { name: "Create Ticket" })).toBeVisible();
    await page.getByLabel("Summary").fill("Unsaved authenticated regression draft");
    await clickPrimaryLink(page, "My Tickets");
    await expect(page.getByRole("alertdialog", { name: "Discard changes?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).last().click();
    await expect(page.getByLabel("Summary")).toHaveValue("Unsaved authenticated regression draft");
    await clickPrimaryLink(page, "My Tickets");
    await page.getByRole("button", { name: "Confirm" }).last().click();

    await clickPrimaryLink(page, "Create Ticket");
    const projectName = testInfo.project.name.replace(/[^a-z0-9-]+/gi, "-");
    const summary = `L4-09 requester regression ${projectName} ${Date.now()}`.slice(0, 120);
    await page.getByLabel("Category").selectOption({ label: "Hardware" });
    await page.getByLabel("Related System").selectOption({ label: "Corporate Laptop" });
    await page.getByLabel("Requested Priority").selectOption("HIGH");
    await page.getByLabel("Summary").fill(summary);
    await page.getByLabel("Description").fill("Authenticated regression ticket for the Lab 2 requester flow.");
    await page.getByLabel("Attachments").setInputFiles([
      { name: "blocked.txt", mimeType: "text/plain", buffer: Buffer.from("not permitted") },
      { name: "regression.png", mimeType: "image/png", buffer: ONE_BY_ONE_PNG },
    ]);
    await page.getByRole("button", { name: "Submit Ticket" }).click();
    await expect(page.getByRole("heading", { name: "Ticket created successfully" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "regression.png" })).toContainText(/Uploaded successfully/);
    await screenshot(page, testInfo, "create-ticket", "success");
    const numberText = await page.getByText(/Official Ticket Number:/).textContent();
    const ticketNumber = numberText?.match(/TKT-\d{4}-\d{6}/)?.[0];
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);

    await page.getByRole("link", { name: "View Ticket" }).click();
    await expect(page.getByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeVisible();
    await expect(page.getByLabel("Summary")).toHaveValue(summary);
    await expect(page.getByRole("button", { name: "Download regression.png" })).toBeVisible();
    await screenshot(page, testInfo, "ticket-detail", "success");

    const resolution = page.getByRole("button", { name: "Problem appears resolved" });
    await resolution.click();
    await expect(page.getByText("Problem appears resolved: Yes")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark problem unresolved" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Mark problem unresolved" }).click();
    await expect(page.getByText("Problem appears resolved: No")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download regression.png" }).click();
    expect((await downloadPromise).suggestedFilename()).toBe("regression.png");
    await page.getByRole("button", { name: "Remove regression.png" }).click();
    const removalDialog = page.getByRole("alertdialog", { name: "Remove Attachment?" });
    await expect(removalDialog).toBeVisible();
    await removalDialog.getByLabel("Removal reason").fill("Lab 4 regression cleanup");
    await removalDialog.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(/regression\.png — Removed/)).toBeVisible();

    const detailResponse = await page.request.get(`${API_BASE_URL}/api/tickets/${encodeURIComponent(ticketNumber!)}`);
    expect(detailResponse.ok()).toBeTruthy();
    const detail = await detailResponse.json() as { data?: { attachments?: Array<{ id: number; originalName: string; status: string }> } };
    const removed = detail.data?.attachments?.find((item) => item.originalName === "regression.png");
    expect(removed?.status).toBe("REMOVED");
    const blocked = await page.request.get(`${API_BASE_URL}/api/tickets/${encodeURIComponent(ticketNumber!)}/attachments/${removed?.id}/download`);
    expect(blocked.status()).toBe(404);

    const secondContext = await browser.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    });
    try {
      const otherRequester = await secondContext.newPage();
      await signIn(otherRequester, "requesterB");
      await expect(otherRequester.getByRole("heading", { name: "My Tickets" })).toBeVisible();
      await expect(otherRequester.getByText(summary)).toHaveCount(0);
      await otherRequester.goto(`/tickets/${encodeURIComponent(ticketNumber!)}`);
      await expect(otherRequester.getByRole("heading", { name: "Ticket not found" })).toBeVisible();
      await expect(otherRequester.getByText(summary)).toHaveCount(0);
    } finally {
      await secondContext.close();
    }

    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();
    await screenshot(page, testInfo, "responsive", "final");
  });
});
