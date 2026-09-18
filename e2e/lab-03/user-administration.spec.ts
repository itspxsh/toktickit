import { expect, test } from "../../client/node_modules/@playwright/test/index.js";
import { expectNoHorizontalOverflow, preflight, requiredEnv, saveScreenshot, signIn } from "./support.js";

test.describe("Lab 3 Administrator journey", () => {
  test("T-E2E-03 / AC-03, AC-10, AC-11 validates create/edit, activation, reset, and Admin safeguards", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await preflight(page);
    await signIn(page, "admin", testInfo);
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
    await page.getByRole("button", { name: "Reset initial password" }).click();
    await page.getByLabel("New initial password").fill(requiredEnv("E2E_CREATED_RESET_PASSWORD"));
    await page.getByRole("button", { name: "Reset initial password" }).last().click();
    await expect(page.getByRole("status")).toContainText(/Initial password reset/i);
    await page.getByLabel("Active").uncheck();
    await page.getByRole("button", { name: "Deactivate user" }).click();
    await expect(page.getByRole("status")).toContainText(/deactivated/i);
    await page.getByRole("button", { name: "Cancel" }).click();
    await row.getByRole("button", { name: /Edit/ }).click();
    await page.getByLabel("Active").check();
    await page.getByRole("button", { name: "Activate user" }).click();
    await expect(page.getByRole("status")).toContainText(/activated/i);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('p[role="status"]')).toContainText(/User saved/i);

    const adminEmail = requiredEnv("E2E_ADMIN_EMAIL");
    const adminRow = page.locator("tbody tr").filter({ hasText: adminEmail });
    await adminRow.getByRole("button", { name: /Edit/ }).click();
    await page.getByLabel("Active").uncheck();
    await page.getByRole("button", { name: "Deactivate user" }).click();
    await expect(page.getByRole("status")).toContainText(/cannot deactivate|last active Administrator/i);
    await page.getByRole("button", { name: "Cancel" }).last().click();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expectNoHorizontalOverflow(page);
    await saveScreenshot(page, testInfo, "user-management", "created-and-edited");
  });
});
