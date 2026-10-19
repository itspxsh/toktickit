import { test } from "../../client/node_modules/@playwright/test/index.js";
import { createRequesterTicket, csrfHeader, expect, expectResponsiveAndKeyboard, openStaffTicket, preflight, saveScreenshot, signIn } from "./support.js";

test("T-E2E-01 / AC-01..06,09,18 Actions lifecycle, ownership, read-only projection, and viewport evidence", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await preflight(page);
  await signIn(page, "requester");
  const summary = `L4-10 Actions ${testInfo.project.name} ${Date.now()}`;
  const ticketNumber = await createRequesterTicket(page, summary);

  const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
  try {
    const staff = await staffContext.newPage();
    await signIn(staff, "staff");
    await openStaffTicket(staff, summary);
    const actions = staff.getByRole("region", { name: "Actions Taken" });
    await expect(actions.getByText("No Actions have been recorded for this Ticket.")).toBeVisible();
    await expectResponsiveAndKeyboard(staff, testInfo);
    await saveScreenshot(staff, testInfo, "actions-taken", "support-empty");

    await actions.getByRole("button", { name: "Add action" }).click();
    const createForm = actions.locator("form.actions-taken__form");
    const firstDescription = `L4-10 completed action ${Date.now()}`;
    await createForm.getByLabel("Description").fill(firstDescription);
    await createForm.locator("select").selectOption({ label: "Support One (IT Staff)" });
    await createForm.getByRole("button", { name: "Create action" }).click();
    const firstAction = actions.getByRole("listitem").filter({ hasText: firstDescription });
    await expect(firstAction).toBeVisible();

    await actions.getByRole("button", { name: "Add action" }).click();
    const secondDescription = `L4-10 cancelled action ${Date.now()}`;
    const secondForm = actions.locator("form.actions-taken__form");
    await secondForm.getByLabel("Description").fill(secondDescription);
    await secondForm.locator("select").selectOption({ label: "Support One (IT Staff)" });
    await secondForm.getByRole("button", { name: "Create action" }).click();
    const secondAction = actions.getByRole("listitem").filter({ hasText: secondDescription });
    await expect(secondAction).toBeVisible();

    await firstAction.getByRole("button", { name: "Edit action" }).click();
    const updatedDescription = `${firstDescription} updated`;
    const editForm = firstAction.locator("form.actions-taken__form");
    await editForm.getByLabel("Description").fill(updatedDescription);
    await editForm.locator("select").selectOption({ label: "Support Two (IT Staff)" });
    await editForm.getByRole("button", { name: "Save action" }).click();
    const updatedAction = actions.getByRole("listitem").filter({ hasText: updatedDescription });
    await expect(updatedAction).toBeVisible();
    await updatedAction.getByRole("button", { name: "Start action" }).click();
    await expect(updatedAction.getByRole("status")).toContainText("IN PROGRESS");
    await updatedAction.getByRole("button", { name: "Complete action" }).click();
    const completeDialog = staff.getByRole("alertdialog", { name: "Complete Action" });
    await completeDialog.getByLabel("Result").fill("Verified the VPN configuration and documented the outcome.");
    await completeDialog.getByRole("button", { name: "Confirm completion" }).click();
    await expect(updatedAction.getByRole("status")).toContainText("COMPLETED");
    await saveScreenshot(staff, testInfo, "actions-taken", "completed");

    await secondAction.getByRole("button", { name: "Cancel action" }).click();
    const cancelDialog = staff.getByRole("alertdialog", { name: "Cancel Action" });
    await cancelDialog.getByLabel("Cancellation reason").fill("Superseded by the completed diagnostic action.");
    await cancelDialog.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(secondAction.getByRole("status")).toContainText("CANCELLED");

    const requesterContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
    try {
      const requester = await requesterContext.newPage();
      await signIn(requester, "requester");
      await requester.goto(`/tickets/${ticketNumber}`);
      await expect(requester.getByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeVisible();
      const requesterActions = requester.getByRole("region", { name: "Actions Taken" });
      await expect(requesterActions.getByText(updatedDescription)).toBeVisible();
      await expect(requesterActions.getByText("CANCELLED", { exact: true })).toBeVisible();
      await expect(requesterActions.getByRole("button", { name: "Add action" })).toHaveCount(0);
      await expect(requesterActions.getByRole("button", { name: "Edit action" })).toHaveCount(0);
      await expectResponsiveAndKeyboard(requester, testInfo);
      await saveScreenshot(requester, testInfo, "actions-taken", "requester-read-only");

      const csrfResponse = await requester.request.get(`${process.env.E2E_API_URL ?? "http://127.0.0.1:3301"}/api/auth/csrf`);
      expect(csrfResponse.ok()).toBeTruthy();
      const csrfBody = await csrfResponse.json() as { csrfToken: string };
      const denied = await requester.request.post(`${process.env.E2E_API_URL ?? "http://127.0.0.1:3301"}/api/staff/tickets/${ticketNumber}/actions`, {
        headers: { ...csrfHeader(csrfBody.csrfToken) }, data: {},
      });
      expect(denied.status()).toBe(403);
    } finally {
      await requesterContext.close();
    }
  } finally {
    await staffContext.close();
  }
});
