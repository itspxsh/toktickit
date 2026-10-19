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
  const requesterDashboard = await requesterResponse.json() as {
    asOf: string; windowStart: string;
    metrics: Record<string, { value: number; drillDown: string }>;
    recentTickets: Array<{ ticketNumber: string; currentStatus: string; updatedAt: string; resolvedAt: string | null }>;
    attentionTickets: Array<{ ticketNumber: string; currentStatus: string }>;
  };
  const ownTicketsResponse = await page.request.get(`${API_BASE_URL}/api/tickets?page=1&pageSize=100`);
  expect(ownTicketsResponse.ok()).toBeTruthy();
  const ownTickets = await ownTicketsResponse.json() as {
    data: Array<{ currentStatus: string; ticketNumber: string }>;
    pagination: { totalItems: number };
  };
  expect(ownTickets.pagination.totalItems).toBe(ownTickets.data.length);
  const activeStatuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"];
  const countForDrillDown = async (key: "updatedLast7Days" | "resolvedLast7Days") => {
    const drillDown = new URL(requesterDashboard.metrics[key].drillDown, "http://local.invalid");
    const response = await page.request.get(`${API_BASE_URL}/api/tickets${drillDown.search}`);
    expect(response.ok(), `${key} drill-down must be an authenticated Ticket list`).toBeTruthy();
    const body = await response.json() as { pagination: { totalItems: number } };
    return body.pagination.totalItems;
  };
  const expectedRequesterMetrics = {
    activeTickets: ownTickets.data.filter((ticket) => activeStatuses.includes(ticket.currentStatus)).length,
    waitingForRequester: ownTickets.data.filter((ticket) => ticket.currentStatus === "WAITING_FOR_REQUESTER").length,
    updatedLast7Days: await countForDrillDown("updatedLast7Days"),
    resolvedLast7Days: await countForDrillDown("resolvedLast7Days"),
  };
  const requesterLabels: Record<string, string> = {
    activeTickets: "Active tickets",
    waitingForRequester: "Waiting for you",
    updatedLast7Days: "Updated in the last 7 days",
    resolvedLast7Days: "Resolved in the last 7 days",
  };
  expect(Object.keys(requesterDashboard.metrics).sort()).toEqual(Object.keys(expectedRequesterMetrics).sort());
  for (const [key, expectedValue] of Object.entries(expectedRequesterMetrics)) {
    const metric = requesterDashboard.metrics[key];
    expect(metric.value, `${key} must reconcile against the authenticated Ticket list`).toBe(expectedValue);
    await expect(page.getByRole("link", { name: `${requesterLabels[key]}: ${expectedValue}`, exact: true })).toBeVisible();
  }
  expect(requesterDashboard.attentionTickets.length).toBeLessThanOrEqual(5);
  expect(requesterDashboard.recentTickets.length).toBeLessThanOrEqual(5);
  for (const ticket of [...requesterDashboard.attentionTickets, ...requesterDashboard.recentTickets]) {
    expect(ownTickets.data.some((owned) => owned.ticketNumber === ticket.ticketNumber)).toBeTruthy();
  }
  await expectResponsiveAndKeyboard(page, testInfo);
  await saveScreenshot(page, testInfo, "requester-dashboard", "loaded");

  const dashboardLink = page.getByRole("link", { name: /^Active tickets:/ }).first();
  const href = await dashboardLink.getAttribute("href");
  expect(href).toMatch(/^\/tickets(?:\?|$)/);
  await dashboardLink.click();
  await expect(page.getByRole("heading", { name: "My Tickets" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "My Dashboard" })).toBeVisible();

  const staffContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
  const adminContext = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5175", viewport: testInfo.project.use.viewport });
  const assertStaffDashboard = async (staffPage: typeof page, role: "staff" | "admin", screenshot: boolean) => {
    await signIn(staffPage, role);
    await staffPage.goto("/staff/dashboard");
    await expect(staffPage.getByRole("heading", { name: "Support Dashboard" })).toBeVisible();
    const staffResponse = await staffPage.request.get(`${API_BASE_URL}/api/dashboards/staff`);
    expect(staffResponse.ok()).toBeTruthy();
    const staffDashboard = await staffResponse.json() as {
      metrics: Record<string, { value: number; drillDown: string }>;
      statusBuckets: Array<{ status: string; value: number }>;
      priorityBuckets: Array<{ priority: string; value: number }>;
      recentTickets: Array<unknown>; urgentTickets: Array<unknown>;
      myActions: { items: Array<{ description: string }>; total: number; page: number; totalPages: number };
    };
    const queueResponse = await staffPage.request.get(`${API_BASE_URL}/api/staff/tickets?page=1&pageSize=100`);
    expect(queueResponse.ok()).toBeTruthy();
    const queue = await queueResponse.json() as { items: Array<{ currentStatus: string; itPriority: string | null; assignedStaff: { id: number } | null }>; total: number };
    expect(queue.total).toBe(queue.items.length);
    const active = queue.items.filter((ticket) => activeStatuses.includes(ticket.currentStatus));
    const sessionResponse = await staffPage.request.get(`${API_BASE_URL}/api/auth/me`);
    expect(sessionResponse.ok()).toBeTruthy();
    const session = await sessionResponse.json() as { user?: { id: number } };
    const expectedMetrics = {
      unassignedActive: active.filter((ticket) => ticket.assignedStaff === null).length,
      ownedActive: active.filter((ticket) => ticket.assignedStaff?.id === session.user?.id).length,
      urgentActive: active.filter((ticket) => ticket.itPriority === "URGENT").length,
    };
    for (const [key, value] of Object.entries(expectedMetrics)) expect(staffDashboard.metrics[key]?.value, `${role} ${key}`).toBe(value);
    for (const [key, metric] of Object.entries(staffDashboard.metrics)) {
      expect(metric.value).toBeGreaterThanOrEqual(0);
      const label = key === "unassignedActive" ? "Unassigned active tickets"
        : key === "ownedActive" ? "My active tickets"
          : key === "urgentActive" ? "Urgent active tickets" : "My unfinished actions";
      await expect(staffPage.getByRole("link", { name: `${label}: ${metric.value}`, exact: true })).toBeVisible();
    }
    expect(staffDashboard.statusBuckets).toHaveLength(8);
    expect(staffDashboard.priorityBuckets).toHaveLength(5);
    const statusCounts = new Map<string, number>();
    for (const ticket of queue.items) statusCounts.set(ticket.currentStatus, (statusCounts.get(ticket.currentStatus) ?? 0) + 1);
    for (const bucket of staffDashboard.statusBuckets) expect(bucket.value, `${role} status ${bucket.status}`).toBe(statusCounts.get(bucket.status) ?? 0);
    const priorityCounts = new Map<string, number>();
    for (const ticket of active) {
      const priority = ticket.itPriority ?? "UNPRIORITIZED";
      priorityCounts.set(priority, (priorityCounts.get(priority) ?? 0) + 1);
    }
    for (const bucket of staffDashboard.priorityBuckets) expect(bucket.value, `${role} priority ${bucket.priority}`).toBe(priorityCounts.get(bucket.priority) ?? 0);
    expect(staffDashboard.recentTickets.length).toBeLessThanOrEqual(5);
    expect(staffDashboard.urgentTickets.length).toBeLessThanOrEqual(5);
    expect(staffDashboard.myActions.items.length).toBeLessThanOrEqual(5);
    await expect(staffPage.locator("#my-actions")).toContainText(`Page ${staffDashboard.myActions.page} of ${staffDashboard.myActions.totalPages}`);
    for (const action of staffDashboard.myActions.items) await expect(staffPage.locator("#my-actions")).toContainText(action.description);
    await expectResponsiveAndKeyboard(staffPage, testInfo);
    if (screenshot) await saveScreenshot(staffPage, testInfo, "staff-dashboard", "loaded");
  };
  try {
    const staff = await staffContext.newPage();
    await assertStaffDashboard(staff, "staff", true);
    const admin = await adminContext.newPage();
    await assertStaffDashboard(admin, "admin", false);
  } finally {
    await staffContext.close();
    await adminContext.close();
  }
});
