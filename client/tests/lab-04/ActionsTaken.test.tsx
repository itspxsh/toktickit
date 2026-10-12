import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { RequesterProvider } from "../../src/requester.tsx";
import { RequesterTicketDetail } from "../../src/requester-ticket-detail.tsx";
import { StaffTicketDetail } from "../../src/staff-ticket-detail.tsx";

const ticketNumber = "TKT-2026-000004";
const staffTicket: api.StaffTicketDetailView = {
  ticketNumber,
  summary: "VPN access",
  description: "Cannot connect",
  ticketDate: "2026-10-10T07:00:00.000Z",
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  appearsResolved: false,
  requester: { id: 12, name: "Example Requester", email: "requester@example.test" },
  assignedStaff: { id: 21, name: "Ticket Owner" },
  attachments: [],
  publicComments: [],
  internalNotes: [{ id: 5, author: { id: 21, name: "Ticket Owner", role: "IT_STAFF" }, body: "Private note", createdAt: "2026-10-10T07:01:00.000Z" }],
};

const requesterTicket: api.TicketDetailView = {
  id: 4,
  ticketNumber,
  ticketDate: "2026-10-10T07:00:00.000Z",
  requester: { id: 12, name: "Example Requester" },
  category: { id: 1, name: "Network" },
  relatedSystem: { id: 1, name: "VPN" },
  summary: "VPN access",
  requestedPriority: "MEDIUM",
  description: "Cannot connect",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  appearsResolved: false,
  createdAt: "2026-10-10T07:00:00.000Z",
  updatedAt: "2026-10-10T07:01:00.000Z",
  attachments: [],
};

const action = {
  id: 31,
  description: "Check VPN gateway configuration",
  result: "",
  attachmentNotes: "See attached error screenshot",
  followUpRequired: false,
  followUpNote: "",
  state: "PLANNED",
  createdBy: { id: 21, name: "Ticket Owner", role: "IT_STAFF", isActive: true },
  assignee: { id: 22, name: "Action Assignee", role: "IT_STAFF", isActive: true },
  performedBy: null,
  createdAt: "2026-10-10T07:02:00.000Z",
  updatedAt: "2026-10-10T07:02:00.000Z",
  completedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  version: 1,
};

const actionPage = { items: [action], page: 1, pageSize: 20, total: 1, totalPages: 1, ticketVersion: 3 };
const assigneePage = {
  items: [
    { id: 21, name: "Ticket Owner", role: "IT_STAFF", isActive: true },
    { id: 22, name: "Action Assignee", role: "IT_STAFF", isActive: true },
  ],
  page: 1,
  pageSize: 20,
  total: 2,
  totalPages: 1,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setupFetch(overrides: (url: string, init?: RequestInit) => Response | undefined = () => undefined) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const response = overrides(url, init);
    if (response) return response;
    if (url.includes("/api/auth/csrf")) return jsonResponse({ csrfToken: "csrf-test" });
    if (url.includes("/api/staff/assignees")) return jsonResponse(assigneePage);
    if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`)) return jsonResponse(actionPage);
    if (url.includes(`/api/tickets/${ticketNumber}/actions`)) return jsonResponse(actionPage);
    return jsonResponse({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderStaff() {
  vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue(staffTicket);
  return render(<StaffTicketDetail ticketNumber={ticketNumber} />);
}

function renderRequester() {
  vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(requesterTicket);
  return render(
    <RequesterProvider mode="authenticated">
      <RequesterTicketDetail ticketNumber={ticketNumber} />
    </RequesterProvider>,
  );
}

describe("L4-05 Actions Taken UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("T-UI-ACT-01 / AC-01,03,14: creates support work with accessible validation and retained retry draft", async () => {
    const user = userEvent.setup();
    let failCreate = true;
    const fetchMock = setupFetch((url, init) => {
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`) && init?.method === "POST") {
        if (failCreate) return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Unable to save Action." } }, 500);
        return jsonResponse({ action, ticketVersion: 4 }, 201);
      }
      return undefined;
    });
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Actions Taken" })).toBeInTheDocument();
    expect(await screen.findByText(action.description)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add action" }));
    const description = screen.getByRole("textbox", { name: "Description" });
    await user.type(description, " Review gateway logs ");
    await user.selectOptions(screen.getByRole("combobox", { name: "Assignee" }), "22");
    await user.click(screen.getByRole("checkbox", { name: "Follow-up required" }));
    expect(screen.getByRole("textbox", { name: "Follow-up note" })).toBeRequired();
    await user.type(screen.getByRole("textbox", { name: "Follow-up note" }), "Check with requester tomorrow");
    await user.click(screen.getByRole("button", { name: "Create action" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save Action.");
    expect(description).toHaveValue(" Review gateway logs ");
    expect(screen.getByRole("textbox", { name: "Follow-up note" })).toHaveValue("Check with requester tomorrow");
    failCreate = false;
    await user.click(screen.getByRole("button", { name: "Create action" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/staff/tickets/${ticketNumber}/actions`),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    ));
    expect(await screen.findByRole("status")).toHaveTextContent(/created|added/i);
    const createBodies = fetchMock.mock.calls
      .filter(([url, init]) => String(url).includes(`/api/staff/tickets/${ticketNumber}/actions`) && init?.method === "POST")
      .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
    expect(createBodies).toHaveLength(2);
    expect(createBodies[0]?.clientRequestId).toEqual(expect.any(String));
    expect(createBodies[1]?.clientRequestId).toBe(createBodies[0]?.clientRequestId);
    expect(createBodies[1]).toMatchObject({
      expectedTicketVersion: 3,
      assigneeId: 22,
      description: "Review gateway logs",
      followUpRequired: true,
      followUpNote: "Check with requester tomorrow",
    });
    expect(createBodies[1]).not.toHaveProperty("createdById");
    expect(createBodies[1]).not.toHaveProperty("role");
  });

  it("T-UI-ACT-02 / AC-02,04: offers support lifecycle controls and confirms complete/cancel explicitly", async () => {
    const user = userEvent.setup();
    renderStaff();

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(section).getByText("Action Assignee")).toBeInTheDocument();
    expect(within(section).getByText("Ticket Owner")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Edit action" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Start action" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Cancel action" })).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Start action" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/started|in progress/i);
  });

  it("T-UI-ACT-03 / AC-05,06: Requester sees current Actions read-only and never fetches revisions", async () => {
    const fetchMock = setupFetch();
    renderRequester();

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(section).getByText(action.description)).toBeInTheDocument();
    expect(within(section).getByText("Action Assignee")).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: /add action|edit action|assign action|start action|complete action|cancel action/i })).not.toBeInTheDocument();
    expect(within(section).queryByText("Private note")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/tickets/${ticketNumber}/actions`),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/revisions"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/actions") && ["POST", "PATCH", "DELETE"].includes(init?.method ?? "GET"))).toBe(false);
  });

  it("T-UI-ACT-04 / AC-09,14: prevents duplicate writes and preserves a stale-write draft for explicit refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch((url, init) => {
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`) && init?.method === "POST") {
        return jsonResponse({ error: { code: "STALE_WRITE", message: "Ticket changed; refresh before retrying." } }, 409);
      }
      return undefined;
    });
    renderStaff();

    expect(await screen.findByRole("heading", { name: "Actions Taken" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add action" }));
    const description = screen.getByRole("textbox", { name: "Description" });
    await user.type(description, "Preserve this draft");
    await user.selectOptions(screen.getByRole("combobox", { name: "Assignee" }), "22");
    await user.click(screen.getByRole("button", { name: "Create action" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ticket changed; refresh before retrying.");
    expect(description).toHaveValue("Preserve this draft");
    expect(screen.getByRole("button", { name: /refresh.*action|reload.*action/i })).toBeInTheDocument();
    const writes = fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/actions") && init?.method === "POST");
    expect(writes).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /refresh.*action|reload.*action/i }));
    expect(description).toHaveValue("Preserve this draft");
  });
});
