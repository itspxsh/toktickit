import { expect, test } from "../../client/node_modules/@playwright/test/index.js";
import { expectNoHorizontalOverflow, preflight, requiredEnv, saveScreenshot, signIn } from "./support.js";

test.describe("Lab 3 Administrator journey", () => {
  test("T-E2E-03 / AC-03, AC-10, AC-11 validates user safeguards and safe fields", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await preflight(page);
    await signIn(page, "admin");
    await page.goto("/tickets");
    await expect(page.getByRole("alert")).toHaveTextContent(/Access denied/i);
    await page.getByRole("link", { name: "User Management" }).click();
    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible();
    await saveScreenshot(page, testInfo, "user-management", "initial");

    const email = `e2e-${Date.now()}@example.test`;
    await page.getByRole("button", { name: "Create User" }).click();
    await page.getByLabel("Name").fill("Lab 3 E2E Requester");
    await page.getByLabel("Email").fill(email);
    await page.locator("#admin-user-role-select").selectOption("REQUESTER");
    await page.getByLabel("Initial password").fill(requiredEnv("E2E_CREATED_INITIAL_PASSWORD"));
    await page.getByRole("button", { name: "Create user" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/User saved/i);
    await expect(page.getByText(email)).toBeVisible();

    const row = page.locator("tbody tr").filter({ hasText: email });
    await row.getByRole("button", { name: /Edit/ }).click();
    await expect(page.getByRole("heading", { name: "Edit User" })).toBeVisible();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/User saved/i);
    await expectNoHorizontalOverflow(page);
    await saveScreenshot(page, testInfo, "user-management", "created-and-edited");
  });
});
