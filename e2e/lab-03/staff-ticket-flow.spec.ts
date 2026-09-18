import { expect, test } from "../../client/node_modules/@playwright/test/index.js";
import { API_BASE_URL, expectNoHorizontalOverflow, preflight, saveScreenshot, signIn } from "./support.js";

test.describe("Lab 3 IT Staff journey", () => {
  test("T-E2E-02 / AC-03, AC-05, AC-06, AC-07, AC-08, AC-09 validates queue/detail workflow and isolation", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await preflight(page);
    await signIn(page, "staff");
    await page.goto("/admin/users");
    await expect(page.getByRole("alert")).toHaveTextContent(/Access denied/i);
    await page.getByRole("link", { name: "Staff Tickets" }).click();
    await expect(page.getByRole("heading", { name: "Staff Ticket Queue" })).toBeVisible();
    await saveScreenshot(page, testInfo, "staff-queue", "success");
    await page.getByLabel("Search tickets").fill("TKT-");
    await page.getByLabel("Status").selectOption("NEW");
    await expectNoHorizontalOverflow(page);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();

    const ticketLink = page.locator("tbody tr").first().getByRole("link", { name: /TKT-/ });
    await expect(ticketLink).toBeVisible();
    await ticketLink.click();
    await expect(page.getByRole("heading", { name: "Staff Ticket Detail" })).toBeVisible();
    await saveScreenshot(page, testInfo, "staff-ticket-detail", "success");

    const claim = page.getByRole("button", { name: "Claim ticket" });
    if (await claim.isVisible()) {
      await claim.click();
      await expect(page.locator('p[role="status"]')).toContainText(/Assignment updated|claimed/i);
    }
    await page.getByLabel("Public comment").fill("Staff E2E public comment");
    await page.getByRole("button", { name: "Add public comment" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/Comment added/i);
    await page.getByLabel("Internal note").fill("Staff E2E internal note");
    await page.getByRole("button", { name: "Add internal note" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/Internal note added/i);

    const forbidden = await page.request.get(`${API_BASE_URL}/api/admin/users`);
    expect(forbidden.status()).toBe(403);
    await saveScreenshot(page, testInfo, "staff-ticket-detail", "workflow-complete");
  });
});
