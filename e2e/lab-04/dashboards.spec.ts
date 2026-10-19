import { test } from "../../client/node_modules/@playwright/test/index.js";
import { API_BASE_URL, expect, expectResponsiveAndKeyboard, preflight, saveScreenshot, signIn } from "./support.js";

test("T-E2E-03 / AC-10..14,17 dashboard aggregates, owned isolation, drill-down, and current-user Actions", async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await preflight(page);
  await signIn(page, "requester");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "My Dashboard" })).toBeVisible();
  const requesterResponse = await page.request.get(`${API_BASE_URL}/api/dashboards/requester`);
  expect(requesterResponse.ok()).toBeTruthy();
  const requesterDashboard = await requesterResponse.json() as { metrics: Record<string, { value: number; drillDown: string }>; recentTickets: Array<{ ticketNumber: string }>; waitingTickets: Array<{ ticketNumber: string }> };
  for (const [label, metric] of Object.entries(requesterDashboard.metrics)) {
    const card = page.locator(".dashboard-metric").filter({ hasText: new RegExp(label.replace(/[A-Z]/g, " $&"), "i") });
    if (await card.count()) await expect(card).toContainText(String(metric.value));
  }
  const ownTicketsResponse = await page.request.get(`${API_BASE_URL}/api/tickets?page=1&pageSize=100`);
  expect(ownTicketsResponse.ok()).toBeTruthy();
  const ownTickets = await ownTicketsResponse.json() as { items: Array<{ currentStatus: string; ticketNumber: string }> };
  const independentlyActive = ownTickets.items.filter((ticket) => ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(ticket.currentStatus)).length;
  expect(requesterDashboard.metrics.activeTickets?.value).toBe(independentlyActive);
  await expectResponsiveAndKeyboard(page, testInfo);
  await saveScreenshot(page, testInfo, "requester-dashboard", "loaded");

  const dashboardLink = page.getByRole("link", { name: /Active tickets/ }).first();
  if (await dashboardLink.isVisible()) {
    const href = await dashboardLink.getAttribute("href");
    expect(href).toMatch(/^\/tickets(?:\?|$)/);
    await dashboardLink.click();
    await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "My Dashboard" })).toBeVisible();
  }

  const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
  try {
    const staff = await staffContext.newPage();
    await signIn(staff, "staff");
    await staff.goto("/staff/dashboard");
    await expect(staff.getByRole("heading", { name: "Support Dashboard" })).toBeVisible();
    const staffResponse = await staff.request.get(`${API_BASE_URL}/api/dashboards/staff`);
    expect(staffResponse.ok()).toBeTruthy();
    const staffDashboard = await staffResponse.json() as { metrics: Record<string, { value: number; drillDown: string }>; recentTickets: Array<unknown>; urgentTickets: Array<unknown>; myActions: { items: Array<unknown>; total: number; page: number; totalPages: number } };
    const queueResponse = await staff.request.get(`${API_BASE_URL}/api/staff/tickets?page=1&pageSize=100`);
    expect(queueResponse.ok()).toBeTruthy();
    const queue = await queueResponse.json() as { items: Array<{ currentStatus: string; itPriority: string | null; assignedStaff: { id: number } | null }> };
    const activeStatuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
    const sessionResponse = await staff.request.get(`${API_BASE_URL}/api/auth/me`);
    expect(sessionResponse.ok()).toBeTruthy();
    const session = await sessionResponse.json() as { user?: { id: number } };
    expect(staffDashboard.metrics.unassignedActive?.value).toBe(queue.items.filter((ticket) => activeStatuses.includes(ticket.currentStatus) && ticket.assignedStaff === null).length);
    expect(staffDashboard.metrics.ownedActive?.value).toBe(queue.items.filter((ticket) => activeStatuses.includes(ticket.currentStatus) && ticket.assignedStaff?.id === session.user?.id).length);
    expect(staffDashboard.metrics.urgentActive?.value).toBe(queue.items.filter((ticket) => activeStatuses.includes(ticket.currentStatus) && ticket.itPriority === "URGENT").length);
    await expectResponsiveAndKeyboard(staff, testInfo);
    await saveScreenshot(staff, testInfo, "staff-dashboard", "loaded");
    await expect(staffDashboard.recentTickets.length).toBeLessThanOrEqual(5);
    await expect(staffDashboard.urgentTickets.length).toBeLessThanOrEqual(5);
    await expect(staffDashboard.myActions.items.length).toBeLessThanOrEqual(5);
  } finally {
    await staffContext.close();
  }
});
