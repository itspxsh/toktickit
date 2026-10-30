import { test } from "../../client/node_modules/@playwright/test/index.js";
import { createRequesterTicket, expect, expectResponsiveAndKeyboard, openStaffTicket, preflight, saveScreenshot, signIn } from "./support.js";

async function setStaffStatus(page: import("../../client/node_modules/@playwright/test/index.js").Page, status: string): Promise<void> {
  const field = page.getByLabel("Status", { exact: true });
  await field.selectOption(status);
  await page.getByRole("button", { name: "Save status" }).click();
  if (status === "RESOLVED" || status === "CLOSED" || status === "CANCELLED") {
    const dialog = page.getByRole("alertdialog", { name: "Confirm status change" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Confirm status" }).click();
  }
  await expect(page.locator(".ticket-detail__badge-field").filter({ hasText: "Current Status" })).toContainText(status.replaceAll("_", " "));
}

test("T-E2E-02 / T-RESP-01 / AC-08,09,13,14,17 resolution gate, public comment visibility, close, cancel, and Admin reopen", async ({ page, browser }, testInfo) => {
  test.setTimeout(150_000);
  await preflight(page);
  await signIn(page, "requester");
  const summary = `L4-10 resolution ${testInfo.project.name} ${Date.now()}`;
  const ticketNumber = await createRequesterTicket(page, summary);

  const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
  try {
    const staff = await staffContext.newPage();
    await signIn(staff, "staff");
    await openStaffTicket(staff, summary);
    await setStaffStatus(staff, "OPEN");
    await setStaffStatus(staff, "IN_PROGRESS");
    const status = staff.getByLabel("Status", { exact: true });
    await status.selectOption("RESOLVED");
    await staff.getByRole("button", { name: "Save status" }).click();
    const blockedDialog = staff.getByRole("alertdialog", { name: "Confirm status change" });
    await blockedDialog.getByRole("button", { name: "Confirm status" }).click();
    await expect(staff.getByRole("alert")).toContainText(/truthful Action work/i);
    await saveScreenshot(staff, testInfo, "ticket-workflow", "resolution-blocked", { ac: ["AC-08", "AC-14", "AC-19", "AC-21"], testIds: ["T-E2E-02", "T-RESP-01"], loadedStateAssertions: ["resolution confirmation dialog closed", "truthful Action work gate alert visible", "responsive viewport and keyboard focus verified"], redactionReview: "Synthetic ticket summary and synthetic work text; no credentials." });

    const actions = staff.getByRole("region", { name: "Actions Taken" });
    await actions.getByRole("button", { name: "Add action" }).click();
    const form = actions.locator("form.actions-taken__form");
    const work = `L4-10 resolution work ${Date.now()}`;
    await form.getByLabel("Description").fill(work);
    await form.locator("select").selectOption({ label: "Support One (IT Staff)" });
    await form.getByRole("button", { name: "Create action" }).click();
    const action = actions.getByRole("listitem").filter({ hasText: work });
    await action.getByRole("button", { name: "Start action" }).click();
    await action.getByRole("button", { name: "Complete action" }).click();
    const completion = staff.getByRole("alertdialog", { name: "Complete Action" });
    await completion.getByLabel("Result").fill("Completed the requested verification.");
    await completion.getByRole("button", { name: "Confirm completion" }).click();
    await expect(action.getByRole("status")).toContainText("COMPLETED");
    await setStaffStatus(staff, "RESOLVED");
    const publicComment = `Public update ${Date.now()} for ${testInfo.project.name}`;
    await staff.getByRole("textbox", { name: "Public comment" }).fill(publicComment);
    await staff.getByRole("button", { name: "Add public comment" }).click();
    await expect(staff.locator("#public-comments-title").locator("xpath=following-sibling::ul")).toContainText(publicComment);
    await saveScreenshot(staff, testInfo, "ticket-workflow", "resolved", { ac: ["AC-08", "AC-13", "AC-19", "AC-21"], testIds: ["T-E2E-02", "T-RESP-01"], loadedStateAssertions: ["Current Status shows RESOLVED", "persisted public comment appears in staff comments list", "responsive viewport and keyboard focus verified"], redactionReview: "Synthetic ticket, comment, and Action text; seeded synthetic support account; no credentials." });

    const requesterContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
    try {
      const requester = await requesterContext.newPage();
      await signIn(requester, "requester");
      await requester.goto(`/tickets/${ticketNumber}`);
      await expect(requester.getByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeVisible();
      await expect(requester.getByText("Problem appears resolved: No")).toBeVisible();
      const statusHistory = requester.locator("#requester-status-history-title").locator("xpath=following-sibling::ol");
      await expect(statusHistory).toContainText("IN PROGRESS → RESOLVED");
      await expect(requester.locator("#requester-public-comments-title").locator("xpath=following-sibling::ol")).toContainText(publicComment);
      await requester.getByRole("button", { name: "Problem appears resolved" }).click();
      await expect(requester.getByText("Problem appears resolved: Yes")).toBeVisible();
      const requesterActions = requester.getByRole("region", { name: "Actions Taken" });
      await expect(requesterActions.getByText(work)).toBeVisible();
      await expect(requesterActions.getByRole("button", { name: "Start action" })).toHaveCount(0);
      await expectResponsiveAndKeyboard(requester, testInfo);
      await saveScreenshot(requester, testInfo, "ticket-workflow", "requester-resolution-advisory", { ac: ["AC-13", "AC-14", "AC-19", "AC-21"], testIds: ["T-E2E-02", "T-RESP-01"], loadedStateAssertions: ["Requester Ticket heading visible", "persisted status event visible", "public comment visible", "resolution advisory updates to Yes", "Action list is read-only", "responsive viewport and keyboard focus verified"], redactionReview: "Synthetic ticket, public comment, and Action text; no credentials or private notes." });
    } finally {
      await requesterContext.close();
    }

    await setStaffStatus(staff, "CLOSED");
    await saveScreenshot(staff, testInfo, "ticket-workflow", "closed", { ac: ["AC-08", "AC-19", "AC-21"], testIds: ["T-E2E-02", "T-RESP-01"], loadedStateAssertions: ["Current Status shows CLOSED after eligible completed work", "responsive viewport and keyboard focus verified"], redactionReview: "Synthetic ticket and work text; no credentials." });

    const secondSummary = `L4-10 cancellation ${testInfo.project.name} ${Date.now()}`;
    const requester2 = await browser.newPage({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175" });
    await signIn(requester2, "requester");
    await createRequesterTicket(requester2, secondSummary);
    await requester2.close();
    await openStaffTicket(staff, secondSummary);
    await setStaffStatus(staff, "CANCELLED");

    const adminContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
    try {
      const admin = await adminContext.newPage();
      await signIn(admin, "admin");
      await admin.goto(`/staff/tickets`);
      await admin.getByLabel("Search tickets").fill(secondSummary);
      const row = admin.locator("tbody tr").filter({ hasText: secondSummary });
      await expect(row).toBeVisible();
      await row.getByRole("link", { name: /TKT-/ }).click();
      await expect(admin.getByRole("heading", { name: "Staff Ticket Detail" })).toBeVisible();
      await expect(admin.getByLabel("Status", { exact: true })).toHaveValue("CANCELLED");
      await admin.getByLabel("Status", { exact: true }).selectOption("REOPENED");
      await admin.getByRole("button", { name: "Save status" }).click();
      // REOPENED is not in the Lab 4 confirm-required set; CANCELLED → REOPENED is an Admin-only guarded transition.
      await expect(admin.locator(".ticket-detail__badge-field").filter({ hasText: "Current Status" })).toContainText("REOPENED");
      await expectResponsiveAndKeyboard(admin, testInfo);
      await saveScreenshot(admin, testInfo, "ticket-workflow", "admin-reopened", { ac: ["AC-07", "AC-19", "AC-21"], testIds: ["T-E2E-02", "T-RESP-01"], loadedStateAssertions: ["Admin role signed in", "CANCELLED Ticket reopened and REOPENED status visible", "responsive viewport and keyboard focus verified"], redactionReview: "Synthetic ticket summary and seeded synthetic Admin account; no credentials." });
    } finally {
      await adminContext.close();
    }
  } finally {
    await staffContext.close();
  }
});
