import { expect, test, type Page } from "../../client/node_modules/@playwright/test/index.js";
import { API_BASE_URL, expectNoHorizontalOverflow, preflight, saveScreenshot, signIn } from "./support.js";

const nextStatusByCurrent: Record<string, string> = {
  NEW: "OPEN",
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "WAITING_FOR_REQUESTER",
  WAITING_FOR_REQUESTER: "IN_PROGRESS",
  REOPENED: "IN_PROGRESS",
};

async function firstEditableQueueRow(page: Page) {
  for (const row of await page.locator("tbody tr").all()) {
    const label = await row.locator('[data-label="Status"] [role="status"]').getAttribute("aria-label");
    const currentStatus = label?.replace(/^Status:\s*/i, "").trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (currentStatus && nextStatusByCurrent[currentStatus]) return row;
  }
  return null;
}

test.describe("Lab 3 IT Staff journey", () => {
  test("T-E2E-02 / AC-03, AC-05, AC-06, AC-07, AC-08, AC-09 validates filters, pagination controls, priority/status updates, workflow, and isolation", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await preflight(page);
    await signIn(page, "staff", testInfo);
    await page.goto("/admin/users");
    await expect(page.getByRole("alert")).toContainText(/Access denied/i);
    const menu = page.getByRole("button", { name: "Open navigation menu" });
    if (await menu.isVisible({ timeout: 1_000 }).catch(() => false)) await menu.click();
    await page.getByRole("link", { name: "Staff Tickets" }).click();
    await expect(page.getByRole("heading", { name: "Staff Ticket Queue" })).toBeVisible();
    await page.getByLabel("Search tickets").fill("TKT-");
    await page.getByLabel("Status", { exact: true }).selectOption("NEW");
    await page.getByLabel("Page size").selectOption("50");
    await expect(page.getByLabel("Page size")).toHaveValue("50");
    const filteredRows = page.locator("tbody tr");
    const emptyFilteredState = page.getByRole("heading", { name: "Nothing here yet" });
    await expect.poll(async () => (await filteredRows.count()) > 0 || await emptyFilteredState.isVisible()).toBe(true);
    const nextPage = page.getByRole("button", { name: "Next" });
    if (await nextPage.isEnabled()) {
      await nextPage.click();
      await expect(page.getByRole("button", { name: "Previous" })).toBeEnabled();
      await page.getByRole("button", { name: "Previous" }).click();
    } else {
      await expect(nextPage).toBeDisabled();
    }
    // Resolve the editable row after paging so an index-based row locator can
    // never silently retarget a different page when the workflow is changed.
    // The three viewport projects share one seeded database, so earlier
    // journeys may have transitioned every NEW seed ticket. Keep proving the
    // filter control, then search the full queue for any editable workflow row.
    let editableRow = await firstEditableQueueRow(page);
    if (!editableRow) {
      await page.getByRole("button", { name: "Status: NEW ×" }).click();
      editableRow = await firstEditableQueueRow(page);
    }
    if (!editableRow) throw new Error("The seeded Staff queue contains no Ticket with an editable workflow status.");
    await expect(editableRow).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toBeVisible();

    const ticketLink = editableRow.getByRole("link", { name: /TKT-/ });
    await expect(ticketLink).toBeVisible();
    await saveScreenshot(page, testInfo, "staff-queue", "success");
    await ticketLink.click();
    await expect(page.getByRole("heading", { name: "Staff Ticket Detail" })).toBeVisible();
    await expect(page.getByLabel("IT Priority")).toBeVisible();
    await saveScreenshot(page, testInfo, "staff-ticket-detail", "success");

    const claim = page.getByRole("button", { name: "Claim ticket" });
    if (await claim.isVisible()) {
      await claim.click();
      await expect(page.locator('p[role="status"]')).toContainText(/Assignment updated|claimed/i);
      await expect(page.getByLabel("IT Priority")).toBeVisible();
    }
    const currentPriority = await page.getByLabel("IT Priority").inputValue();
    await page.getByLabel("IT Priority").selectOption(currentPriority);
    await page.getByRole("button", { name: "Save priority" }).click();
    await expect(page.getByText("Priority updated.", { exact: true })).toBeVisible();
    const statusSelect = page.getByLabel("Status", { exact: true });
    const currentStatus = await statusSelect.inputValue();
    const nextStatus = nextStatusByCurrent[currentStatus];
    if (!nextStatus) throw new Error(`Expected an editable seeded ticket status, got ${currentStatus}`);
    await statusSelect.selectOption(nextStatus);
    await page.getByRole("button", { name: "Save status" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/Status updated/i);
    await page.getByRole("textbox", { name: "Public comment", exact: true }).fill("Staff E2E public comment");
    await page.getByRole("button", { name: "Add public comment" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/Comment added/i);
    await page.getByRole("textbox", { name: "Internal note", exact: true }).fill("Staff E2E internal note");
    await page.getByRole("button", { name: "Add internal note" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/Internal note added/i);

    const forbidden = await page.request.get(`${API_BASE_URL}/api/admin/users`);
    expect(forbidden.status()).toBe(403);
    await saveScreenshot(page, testInfo, "staff-ticket-detail", "workflow-complete");
  });
});
