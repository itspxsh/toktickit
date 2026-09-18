import { expect, test } from "../../client/node_modules/@playwright/test/index.js";
import { API_BASE_URL, csrfToken, expectNoHorizontalOverflow, preflight, saveScreenshot, signIn } from "./support.js";

test.describe("Lab 3 requester authenticated journey", () => {
  test("T-E2E-01 / AC-01, AC-02, AC-04 exercises login, ownership, resolution indication, comment, and logout", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await preflight(page);
    await signIn(page, "requester");
    await saveScreenshot(page, testInfo, "authentication", "requester-signed-in");

    const rows = page.locator("tbody tr");
    await expect.poll(() => rows.count(), "seeded requester tickets are required").toBeGreaterThan(0);
    const ticketNumber = await rows.first().getByRole("link", { name: /TKT-/ }).textContent();
    expect(ticketNumber).toMatch(/^TKT-\d{4}-\d{6}$/);
    await rows.first().getByRole("link", { name: /Open ticket/i }).click();
    await expect(page.getByRole("heading", { name: new RegExp(`Ticket ${ticketNumber}`) })).toBeVisible();

    const token = await csrfToken(page);
    const comment = `Lab 3 requester evidence ${Date.now()}`;
    const commentResponse = await page.request.post(`${API_BASE_URL}/api/tickets/${encodeURIComponent(ticketNumber!)}/comments`, {
      headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
      data: { body: comment },
    });
    expect(commentResponse.status()).toBe(201);

    const resolution = page.getByRole("button", { name: /Problem appears resolved/i });
    await resolution.click();
    await expect(page.getByText("Problem appears resolved: Yes")).toBeVisible();
    await saveScreenshot(page, testInfo, "authentication", "requester-ticket-detail");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await saveScreenshot(page, testInfo, "authentication", "logged-out");
  });
});
