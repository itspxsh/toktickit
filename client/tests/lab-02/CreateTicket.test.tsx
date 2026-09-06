import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { CreateTicket } from "../../src/create-ticket.tsx";
import App from "../../src/App.tsx";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/requester.tsx";

const requester = { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test" };
const categories = [{ id: 2, name: "Hardware" }];
const systems = [{ id: 7, name: "Corporate Laptop" }];
const ticketDetail: api.TicketDetailView = {
  id: 42,
  ticketNumber: "TKT-2026-000042",
  ticketDate: "2026-09-06T00:00:00.000Z",
  requester: { id: 1, name: requester.name },
  category: categories[0],
  relatedSystem: systems[0],
  summary: "Laptop battery drains quickly",
  requestedPriority: "MEDIUM",
  description: "The battery drains faster than usual during normal use.",
  itPriority: null,
  currentStatus: "NEW",
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  attachments: [],
};

function renderCreateTicket() {
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  return render(
    <RequesterProvider>
      <CreateTicket />
    </RequesterProvider>,
  );
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByRole("combobox", { name: /Category/ }), "2");
  await user.selectOptions(screen.getByRole("combobox", { name: /Related System/ }), "7");
  await user.selectOptions(screen.getByRole("combobox", { name: /Requested Priority/ }), "MEDIUM");
  await user.type(screen.getByRole("textbox", { name: /Summary/ }), "Laptop battery drains quickly");
  await user.type(screen.getByRole("textbox", { name: /Description/ }), "The battery drains faster than usual during normal use.");
}

describe("L2-05 Create Ticket", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const values = new Map<string, string>();
    const storage = {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    };
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    storage.clear();
    vi.spyOn(api, "fetchRequesters").mockResolvedValue([requester]);
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({ categories, relatedSystems: systems });
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(ticketDetail);
  });

  it("UI-04 / AC-06: validates required fields before calling the API", async () => {
    const createSpy = vi.spyOn(api, "createTicket");
    const user = userEvent.setup();
    renderCreateTicket();

    await screen.findByRole("textbox", { name: /Summary/ });
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(screen.getByText("Summary must contain 5-120 characters.")).toBeInTheDocument();
    expect(screen.getByText("Description must contain 10-2,000 characters.")).toBeInTheDocument();
    expect(screen.getByText("Category is required.")).toBeInTheDocument();
    expect(screen.getByText("Related System is required.")).toBeInTheDocument();
    expect(screen.getByText("Requested Priority is required.")).toBeInTheDocument();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("UI-05 / AC-07: disables the submit action and sends one idempotent request", async () => {
    let resolveCreate!: (value: api.CreateTicketResponse) => void;
    const createSpy = vi.spyOn(api, "createTicket").mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; }),
    );
    const user = userEvent.setup();
    renderCreateTicket();
    await fillValidForm(user);

    const submit = screen.getByRole("button", { name: "Submit Ticket" });
    await user.click(submit);
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Creating…" }));
    expect(createSpy).toHaveBeenCalledOnce();

    resolveCreate({
      data: {
        id: 1,
        ticketNumber: "TKT-2026-000042",
        ticketDate: "2026-09-06T00:00:00.000Z",
        requester,
        category: categories[0],
        relatedSystem: systems[0],
        summary: "Laptop battery drains quickly",
        requestedPriority: "MEDIUM",
        description: "The battery drains faster than usual during normal use.",
        itPriority: null,
        currentStatus: "NEW",
        createdAt: "2026-09-06T00:00:00.000Z",
        updatedAt: "2026-09-06T00:00:00.000Z",
      },
      replayed: false,
    });
    await waitFor(() => expect(screen.getByText("TKT-2026-000042")).toBeInTheDocument());
  });

  it("UI-06 / AC-08: preserves entered values and selected files after a failed create", async () => {
    vi.spyOn(api, "createTicket").mockRejectedValue(new Error("Unable to create Ticket."));
    const user = userEvent.setup();
    renderCreateTicket();
    await fillValidForm(user);

    const file = new File(["pdf"], "evidence.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Attachments"), file);
    await user.click(screen.getByRole("button", { name: "Submit Ticket" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to create Ticket.");
    expect(screen.getByRole("textbox", { name: /Summary/ })).toHaveValue("Laptop battery drains quickly");
    expect(screen.getByRole("textbox", { name: /Description/ })).toHaveValue(
      "The battery drains faster than usual during normal use.",
    );
    expect(screen.getByLabelText("Attachments")).toHaveProperty("files.length", 1);
    expect(screen.getByText("evidence.pdf")).toBeInTheDocument();
  });

  it("guards in-app navigation while the Create Ticket form is dirty", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    window.history.pushState({}, "", "/create-ticket");
    const user = userEvent.setup();
    render(<App />);

    const summary = await screen.findByRole("textbox", { name: /Summary/ });
    await user.type(summary, "Draft request");
    await user.click(screen.getByRole("link", { name: "My Tickets" }));

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/create-ticket");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox", { name: /Summary/ })).toHaveValue("Draft request");

    await user.click(screen.getByRole("link", { name: "My Tickets" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(window.location.pathname).toBe("/tickets");
  });

  it("renders the requester-owned detail route after the handoff placeholder", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    window.history.pushState({}, "", "/tickets/TKT-2026-000042");

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Ticket TKT-2026-000042" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Summary")).toHaveValue(ticketDetail.summary);
    expect(screen.getByRole("link", { name: "Back to My Tickets" })).toBeInTheDocument();
  });
});
