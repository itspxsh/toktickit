import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { StaffTicketDetail } from "../../src/staff-ticket-detail.tsx";

const ticketNumber = "TKT-2026-000051";
const detail: api.StaffTicketDetailView = {
  ticketNumber,
  summary: "VPN access",
  description: "Cannot connect to VPN.",
  ticketDate: "2026-10-15T00:00:00.000Z",
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "OPEN",
  workflowVersion: 8,
  resolvedAt: null,
  allowedTransitions: ["IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  resolutionGate: { canResolve: false, blockers: ["UNFINISHED_ACTIONS"] },
  statusEvents: [{ id: 1, fromStatus: "NEW", toStatus: "OPEN", createdAt: "2026-10-15T00:00:00.000Z", actor: { id: 41, name: "Alex Support", role: "IT_STAFF" } }],
  appearsResolved: false,
  requester: { id: 7, name: "Requester", email: "requester@example.test" },
  assignedStaff: null,
  attachments: [],
  publicComments: [],
  internalNotes: [],
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setupFetch(overrides: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const result = overrides(url, init);
    if (result) return result;
    if (url.includes("/api/auth/csrf")) return response({ csrfToken: "csrf" });
    if (url.includes("/api/staff/assignees")) return response({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
    if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`)) return response({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0, ticketVersion: 8 });
    return response({});
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(detail);
  return fetchMock;
}

describe("L4-06 Ticket workflow UI (T-UI-WF-01..02)", () => {
  beforeEach(() => { vi.restoreAllMocks(); setupFetch(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("offers only server-approved transitions and displays the resolution blockers and status history", async () => {
    render(<StaffTicketDetail ticketNumber={ticketNumber} />);
    const select = await screen.findByRole("combobox", { name: "Status" });
    expect([...select.querySelectorAll("option")].map((option) => option.textContent)).toEqual([
      "OPEN", "IN PROGRESS", "WAITING FOR REQUESTER", "RESOLVED", "CANCELLED",
    ]);
    expect(screen.getByText("Finish or cancel all planned and in-progress Actions.")).toBeInTheDocument();
    expect(screen.getByText(/NEW → OPEN · Alex Support/)).toBeInTheDocument();
  });

  it("confirms resolution and sends the current Ticket workflow version", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch((url, init) => {
      if (url.includes("/api/staff/tickets/") && url.endsWith("/status") && init?.method === "PATCH") {
        return response({ currentStatus: "RESOLVED", ticketVersion: 9, allowedTransitions: ["CLOSED", "REOPENED"], resolutionGate: { canResolve: true, blockers: [] }, noOp: false });
      }
      return undefined;
    });
    render(<StaffTicketDetail ticketNumber={ticketNumber} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Status" }), "RESOLVED");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    const dialog = screen.getByRole("alertdialog", { name: "Confirm status change" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm status" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/status") && init?.method === "PATCH");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ expectedTicketVersion: 8, currentStatus: "RESOLVED", confirm: true });
    });
  });

  it("sends the selected assignee instead of claiming an unassigned Ticket", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch((url, init) => {
      if (url.endsWith("/assignment") && init?.method === "PATCH") {
        return response({ assignedStaff: { id: 77, name: "Second Support Agent" }, ticketVersion: 9 });
      }
      return undefined;
    });
    render(<StaffTicketDetail ticketNumber={ticketNumber} staffOptions={[{ id: 77, name: "Second Support Agent", role: "IT_STAFF" }]} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Assign to active support user" }), "77");
    await user.click(screen.getByRole("button", { name: "Save assignment" }));
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/assignment") && init?.method === "PATCH");
      expect(call).toBeDefined();
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ expectedTicketVersion: 8, assignedStaffId: 77 });
    });
  });

  it("sends the current Ticket version for claim and priority writes", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch((url, init) => {
      if (url.endsWith("/claim") && init?.method === "POST") return response({ assignedStaff: { id: 41, name: "Alex Support" }, ticketVersion: 9 });
      if (url.endsWith("/priority") && init?.method === "PATCH") return response({ itPriority: "LOW", ticketVersion: 9 });
      return undefined;
    });
    render(<StaffTicketDetail ticketNumber={ticketNumber} />);
    await user.click(await screen.findByRole("button", { name: "Claim ticket" }));
    await screen.findByText("Ticket claimed.");
    await user.selectOptions(screen.getByRole("combobox", { name: "IT Priority" }), "LOW");
    await user.click(screen.getByRole("button", { name: "Save priority" }));
    await waitFor(() => {
      const claim = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/claim") && init?.method === "POST");
      const priority = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/priority") && init?.method === "PATCH");
      expect(JSON.parse(String(claim?.[1]?.body))).toEqual({ expectedTicketVersion: 8 });
      expect(JSON.parse(String(priority?.[1]?.body))).toEqual({ expectedTicketVersion: 8, itPriority: "LOW" });
    });
  });
});
