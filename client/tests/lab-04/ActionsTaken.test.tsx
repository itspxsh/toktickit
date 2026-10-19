import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { ActionsTaken } from "../../src/actions-taken.tsx";
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
  workflowVersion: 3,
  resolvedAt: null,
  allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
  resolutionGate: { canResolve: false, blockers: ["UNFINISHED_ACTIONS"] },
  appearsResolved: false,
  requester: { id: 12, name: "Example Requester", email: "requester@example.test" },
  assignedStaff: { id: 21, name: "Ticket Owner" },
  attachments: [],
  statusEvents: [],
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
  currentStatus: "NEW",
  appearsResolved: false,
  createdAt: "2026-10-10T07:00:00.000Z",
  updatedAt: "2026-10-10T07:01:00.000Z",
  attachments: [],
  statusEvents: [],
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

  it("T-UI-ACT-01 / AC-14 reports a dirty Action draft to the parent navigation guard", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    render(<ActionsTaken ticketNumber={ticketNumber} mode="support" ticketStatus="IN_PROGRESS" onDirtyChange={onDirtyChange} />);

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(section).getByRole("button", { name: "Add action" }));
    const form = screen.getByRole("button", { name: "Create action" }).closest("form");
    await user.type(within(form as HTMLFormElement).getByRole("textbox", { name: "Description" }), "Unsaved repair step");

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
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
    const form = screen.getByRole("button", { name: "Create action" }).closest("form");
    expect(form).not.toBeNull();
    const description = within(form as HTMLFormElement).getByRole("textbox", { name: "Description" });
    expect(within(form as HTMLFormElement).getByRole("textbox", { name: "Attachment notes" })).toHaveAttribute("maxLength", "1000");
    await user.type(description, " Review gateway logs ");
    await within(form as HTMLFormElement).findByRole("option", { name: /Action Assignee/ });
    await user.selectOptions(within(form as HTMLFormElement).getByRole("combobox", { name: /Assignee/ }), "22");
    await user.click(within(form as HTMLFormElement).getByRole("checkbox", { name: "Follow-up required" }));
    const followUpNote = within(form as HTMLFormElement).getByRole("textbox", { name: "Follow-up note" });
    expect(followUpNote).toBeRequired();
    expect(followUpNote).toHaveAttribute("minLength", "5");
    await user.type(followUpNote, "Check with requester tomorrow");
    await user.click(screen.getByRole("button", { name: "Create action" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to save Action.");
    expect(description).toHaveValue(" Review gateway logs ");
    expect(within(form as HTMLFormElement).getByRole("textbox", { name: "Follow-up note" })).toHaveValue("Check with requester tomorrow");
    failCreate = false;
    await user.click(screen.getByRole("button", { name: "Create action" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/staff/tickets/${ticketNumber}/actions`),
      expect.objectContaining({ method: "POST", credentials: "include" }),
    ));
    expect(await screen.findByText("Action created.")).toBeInTheDocument();
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
    const fetchMock = setupFetch();
    renderStaff();

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(section).getByText("Action Assignee")).toBeInTheDocument();
    expect(within(section).getByText(/Ticket Owner:/)).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Edit action" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Start action" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Cancel action" })).toBeInTheDocument();
    await user.click(await within(section).findByRole("button", { name: "Start action" }));
    expect(await screen.findByText("Action started.")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Cancel action" }));
    const dialog = screen.getByRole("alertdialog", { name: "Cancel Action" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm cancellation" });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox", { name: "Cancellation reason" }), "No longer needed");
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/transitions") && init?.method === "POST");
      expect(calls.map(([, init]) => JSON.parse(String(init?.body)))).toContainEqual(expect.objectContaining({ state: "CANCELLED", confirm: true, reason: "No longer needed" }));
    });
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

  it("requires a result and explicit follow-up resolution before completion", async () => {
    const user = userEvent.setup();
    let currentAction = { ...action, state: "IN_PROGRESS", followUpRequired: true, followUpNote: "Confirm service recovery with requester" };
    const fetchMock = setupFetch((url, init) => {
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`) && (!init?.method || init.method === "GET")) {
        return jsonResponse({ ...actionPage, items: [currentAction] });
      }
      if (url.includes("/transitions") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { state: string; result?: string };
        currentAction = { ...currentAction, state: body.state as typeof currentAction.state, result: body.result ?? currentAction.result };
        return jsonResponse({ action: currentAction, ticketVersion: 4 });
      }
      return undefined;
    });
    renderStaff();
    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(await within(section).findByRole("button", { name: "Complete action" }));
    const dialog = screen.getByRole("alertdialog", { name: "Complete Action" });
    const confirm = within(dialog).getByRole("button", { name: "Confirm completion" });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText(/Previous follow-up: Confirm service recovery with requester/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Record how the required follow-up was verified/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/completion clears it from the active Action while the previous note remains in Action history/i)).toBeInTheDocument();
    const followUpResolved = within(dialog).getByRole("checkbox", { name: "I verified the required follow-up is complete" });
    expect(followUpResolved).not.toBeChecked();
    await user.type(within(dialog).getByRole("textbox", { name: "Result" }), "Gateway configuration corrected; requester confirmed service recovery");
    expect(confirm).toBeDisabled();
    await user.click(followUpResolved);
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(await screen.findByText("Action completed.")).toBeInTheDocument();
    await waitFor(() => expect(within(section).queryByRole("button", { name: /edit action|start action|complete action|cancel action/i })).not.toBeInTheDocument());
    const bodies = fetchMock.mock.calls.filter(([url, init]) => String(url).includes("/transitions") && init?.method === "POST").map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toContainEqual(expect.objectContaining({ state: "COMPLETED", confirm: true, result: "Gateway configuration corrected; requester confirmed service recovery", followUpRequired: false, followUpNote: "" }));
  });

  it("treats a replayed create as recovery and does not page-jump", async () => {
    const user = userEvent.setup();
    const replayPage = { ...actionPage, items: [], total: 20, totalPages: 2 };
    const fetchMock = setupFetch((url, init) => {
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions?`) && (!init?.method || init.method === "GET")) return jsonResponse(replayPage);
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`) && init?.method === "POST") return jsonResponse({ action, ticketVersion: 4 }, 200);
      return undefined;
    });
    renderStaff();

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(section).getByRole("button", { name: "Add action" }));
    const form = within(section).getByRole("button", { name: "Create action" }).closest("form") as HTMLFormElement;
    await user.type(within(form).getByRole("textbox", { name: "Description" }), "Recover a previously submitted Action");
    await within(form).findByRole("option", { name: /Action Assignee/ });
    await user.selectOptions(within(form).getByRole("combobox", { name: /Assignee/ }), "22");
    await user.click(within(form).getByRole("button", { name: "Create action" }));

    expect(await screen.findByText("Recovered the existing Action.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes(`/actions?page=2&pageSize=20`))).toBe(false);
    expect(within(section).queryByRole("button", { name: "Next" })).toBeInTheDocument();
  });

  it("keeps the selected assignee valid during an empty search and closes create before editing", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch((url, init) => {
      if (url.includes("/api/staff/assignees?") && new URL(url).searchParams.get("q") === "no-match") {
        return jsonResponse({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
      }
      return undefined;
    });
    renderStaff();

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(section).getByRole("button", { name: "Add action" }));
    const createForm = within(section).getByRole("button", { name: "Create action" }).closest("form") as HTMLFormElement;
    await within(createForm).findByRole("option", { name: /Action Assignee/ });
    await user.selectOptions(within(createForm).getByRole("combobox", { name: /Assignee/ }), "22");
    await user.type(within(createForm).getByRole("textbox", { name: "Search assignees" }), "no-match");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("q=no-match"), expect.anything()));
    expect(within(createForm).getByRole("combobox", { name: /Assignee/ })).toHaveValue("22");
    expect(within(createForm).getByRole("button", { name: "Create action" })).toBeEnabled();

    await user.click(within(section).getByRole("button", { name: "Edit action" }));
    expect(within(section).getAllByRole("button", { name: /save action|create action/i })).toHaveLength(1);
    expect(within(section).getByRole("button", { name: "Add action" })).toBeDisabled();
  });

  it("refreshes the parent Ticket summary after a successful Action mutation", async () => {
    const user = userEvent.setup();
    let finishRefresh: ((value: api.StaffTicketDetailView) => void) | undefined;
    const detailFetch = vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValueOnce(staffTicket).mockImplementationOnce(() => new Promise((resolve) => { finishRefresh = resolve; }));
    setupFetch((url, init) => {
      if (url.includes("/transitions") && init?.method === "POST") return jsonResponse({ action: { ...action, state: "IN_PROGRESS" }, ticketVersion: 4 });
      return undefined;
    });
    render(<StaffTicketDetail ticketNumber={ticketNumber} />);

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(await within(section).findByRole("button", { name: "Start action" }));

    await waitFor(() => expect(detailFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("region", { name: "Actions Taken" })).toBeInTheDocument();
    finishRefresh?.({ ...staffTicket, appearsResolved: true });
    await waitFor(() => expect(document.getElementById("action-31")).toHaveFocus());
  });

  it("T-UI-ACT-05 / AC-14 refreshes the Action workflow version after a successful Ticket status change", async () => {
    const user = userEvent.setup();
    let actionListReads = 0;
    let transitionBody: Record<string, unknown> | undefined;
    const fetchMock = setupFetch((url, init) => {
      if (url.includes("/api/staff/tickets/") && url.endsWith("/status") && init?.method === "PATCH") {
        return jsonResponse({ ticket: { ...staffTicket, currentStatus: "WAITING_FOR_REQUESTER", workflowVersion: 4 } });
      }
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions?`) && !init?.method) {
        actionListReads += 1;
        return jsonResponse({ ...actionPage, ticketVersion: actionListReads === 1 ? 3 : 4 });
      }
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions/31/transitions`) && init?.method === "POST") {
        transitionBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return jsonResponse({ action: { ...action, state: "IN_PROGRESS" }, ticketVersion: 5 });
      }
      return undefined;
    });
    vi.spyOn(api, "fetchStaffTicketDetail").mockResolvedValue({
      ...staffTicket,
      allowedTransitions: ["WAITING_FOR_REQUESTER", "RESOLVED", "CANCELLED"],
    });
    render(<StaffTicketDetail ticketNumber={ticketNumber} />);

    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes(`/api/staff/tickets/${ticketNumber}/actions?`))).toHaveLength(1));
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "WAITING_FOR_REQUESTER");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes(`/api/staff/tickets/${ticketNumber}/actions?`))).toHaveLength(2));
    await user.click(within(section).getByRole("button", { name: "Start action" }));
    await waitFor(() => expect(transitionBody).toMatchObject({ expectedTicketVersion: 4 }));
  });

  it("generates a UUID request key when randomUUID is unavailable", async () => {
    const user = userEvent.setup();
    const secureRandom = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal("crypto", { getRandomValues: secureRandom });
    const fetchMock = setupFetch((url, init) => {
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions`) && init?.method === "POST") return jsonResponse({ action, ticketVersion: 4 }, 201);
      return undefined;
    });
    renderStaff();
    await user.click(await screen.findByRole("button", { name: "Add action" }));
    const form = screen.getByRole("button", { name: "Create action" }).closest("form") as HTMLFormElement;
    await user.type(within(form).getByRole("textbox", { name: "Description" }), "Create a valid UUID request key");
    await within(form).findByRole("option", { name: /Action Assignee/ });
    await user.selectOptions(await within(form).findByRole("combobox", { name: /Assignee/ }), "22");
    await user.click(within(form).getByRole("button", { name: "Create action" }));

    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes(`/api/staff/tickets/${ticketNumber}/actions`) && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body)).clientRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("T-UI-ACT-02 / AC-04: hides an open create form when the parent Ticket becomes terminal", async () => {
    const user = userEvent.setup();
    const view = render(<ActionsTaken ticketNumber={ticketNumber} ticketStatus="IN_PROGRESS" mode="support" />);
    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(section).getByRole("button", { name: "Add action" }));
    expect(within(section).getByRole("button", { name: "Create action" })).toBeInTheDocument();

    view.rerender(<ActionsTaken ticketNumber={ticketNumber} ticketStatus="RESOLVED" mode="support" />);

    expect(within(section).queryByRole("button", { name: "Create action" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Add action" })).not.toBeInTheDocument();
  });

  it("T-UI-ACT-02 / AC-04: dismisses a pending transition confirmation when the parent Ticket becomes terminal", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch();
    const view = render(<ActionsTaken ticketNumber={ticketNumber} ticketStatus="IN_PROGRESS" mode="support" />);
    const section = await screen.findByRole("region", { name: "Actions Taken" });
    await user.click(within(section).getByRole("button", { name: "Cancel action" }));
    expect(screen.getByRole("alertdialog", { name: "Cancel Action" })).toBeInTheDocument();

    view.rerender(<ActionsTaken ticketNumber={ticketNumber} ticketStatus="CANCELLED" mode="support" />);

    expect(screen.queryByRole("alertdialog", { name: "Cancel Action" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/transitions") && init?.method === "POST")).toBe(false);
  });

  it("T-UI-ACT-03 exposes paginated revision history only in support mode", async () => {
    const user = userEvent.setup();
    const fetchMock = setupFetch((url) => {
      if (url.includes(`/api/staff/tickets/${ticketNumber}/actions?page=`)) {
        const requestedPage = Number(new URL(url).searchParams.get("page"));
        return jsonResponse({ ...actionPage, page: requestedPage, total: 21, totalPages: 2 });
      }
      if (url.includes("/actions/31/revisions")) return jsonResponse({
        items: [{ version: 1, kind: "CREATE", actor: action.createdBy, createdAt: action.createdAt, snapshot: { description: action.description } }],
        page: 1, pageSize: 20, total: 21, totalPages: 2,
      });
      return undefined;
    });
    renderStaff();
    const section = await screen.findByRole("region", { name: "Actions Taken" });
    expect(within(section).getByText("Page 1 of 2")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/staff/tickets/${ticketNumber}/actions?page=2&pageSize=20`),
      expect.objectContaining({ credentials: "include" }),
    ));
    await user.click(within(section).getByRole("button", { name: "View Action history" }));
    expect(await within(section).findByText(/Version 1: CREATE/)).toBeInTheDocument();
    expect(within(section).getAllByText("Check VPN gateway configuration").length).toBeGreaterThanOrEqual(2);
    expect(within(section).getByText("Page 1 of 2")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/staff/tickets/${ticketNumber}/actions/31/revisions?page=1&pageSize=20`),
      expect.objectContaining({ credentials: "include" }),
    );
    await user.click(within(section).getByRole("button", { name: "Next history" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/api/staff/tickets/${ticketNumber}/actions/31/revisions?page=2&pageSize=20`),
      expect.objectContaining({ credentials: "include" }),
    ));
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
    const form = screen.getByRole("button", { name: "Create action" }).closest("form");
    expect(form).not.toBeNull();
    const description = within(form as HTMLFormElement).getByRole("textbox", { name: "Description" });
    await user.type(description, "Preserve this draft");
    await within(form as HTMLFormElement).findByRole("option", { name: /Action Assignee/ });
    await user.selectOptions(within(form as HTMLFormElement).getByRole("combobox", { name: /Assignee/ }), "22");
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
