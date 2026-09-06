import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import App from "../../src/App.tsx";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/requester.tsx";
import { RequesterTicketDetail } from "../../src/requester-ticket-detail.tsx";

const requester = { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test" };
const ticketNumber = "TKT-2026-000042";
const detail: api.TicketDetailView = {
  id: 42,
  ticketNumber,
  ticketDate: "2026-09-06T00:00:00.000Z",
  requester: { id: requester.id, name: requester.name },
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
  summary: "Laptop battery drains quickly",
  requestedPriority: "HIGH",
  description: "The battery drains faster than usual during normal use.",
  itPriority: null,
  currentStatus: "NEW",
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  attachments: [
    {
      id: 101,
      originalName: "battery.png",
      mimeType: "image/png",
      sizeBytes: 18234,
      status: "ACTIVE",
      removedAt: null,
      removalReason: null,
      createdAt: "2026-09-06T00:00:00.000Z",
    },
    {
      id: 102,
      originalName: "old-log.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      status: "REMOVED",
      removedAt: "2026-09-06T01:00:00.000Z",
      removalReason: "Uploaded by mistake",
      createdAt: "2026-09-06T00:30:00.000Z",
    },
  ],
};

function renderDetail(onNavigate?: (path: string) => void) {
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  return render(
    <RequesterProvider>
      <RequesterTicketDetail ticketNumber={ticketNumber} onNavigate={onNavigate} />
    </RequesterProvider>,
  );
}

describe("L2-07 Requester Ticket Detail", () => {
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
    vi.spyOn(api, "fetchTicketDetail").mockResolvedValue(detail);
  });

  it("UI-09 / AC-12: renders owned read-only fields, badges, and attachment metadata", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeInTheDocument();
    expect(screen.getByLabelText("Ticket Number")).toHaveValue(ticketNumber);
    expect(screen.getByLabelText("Ticket Number")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Summary")).toHaveValue(detail.summary);
    expect(screen.getByLabelText("Description")).toHaveValue(detail.description);
    expect(screen.getByRole("status", { name: /Status: New/i })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /Status: High/i })).toBeInTheDocument();
    expect(screen.getByText("IT Priority: Not assigned")).toBeInTheDocument();
    expect(screen.getByText(/battery\.png/)).toBeInTheDocument();
    expect(screen.getByText(/old-log\.pdf.*Removed/i)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Uploaded by mistake/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove|download|preview|upload/i })).not.toBeInTheDocument();
    expect(api.fetchTicketDetail).toHaveBeenCalledWith(ticketNumber, 1, expect.any(AbortSignal));
  });

  it("UI-09 / AC-13: renders a safe not-found recovery state", async () => {
    vi.spyOn(api, "fetchTicketDetail").mockRejectedValue(
      new api.ApiError("Ticket was not found.", 404),
    );
    const navigate = vi.fn();
    renderDetail(navigate);

    expect(await screen.findByRole("heading", { name: "Ticket not found" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Ticket was not found.");
    expect(screen.queryByText(/database|requester id/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("link", { name: "Back to My Tickets" }));
    expect(navigate).toHaveBeenCalledWith("/tickets");
  });

  it("shows a retryable safe error state", async () => {
    const fetchDetail = vi.spyOn(api, "fetchTicketDetail")
      .mockRejectedValueOnce(new api.ApiError("Unable to load Ticket.", 500))
      .mockResolvedValueOnce(detail);
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Unable to load Ticket" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByLabelText("Ticket Number")).toHaveValue(ticketNumber));
    expect(fetchDetail).toHaveBeenCalledTimes(2);
  });

  it("mounts the detail page for the ticket route without the handoff placeholder", async () => {
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    window.history.pushState({}, "", `/tickets/${ticketNumber}`);
    render(<App />);

    expect(await screen.findByRole("heading", { name: `Ticket ${ticketNumber}` })).toBeInTheDocument();
    expect(screen.queryByText(/placeholder until the Lab 2 Ticket Detail/i)).not.toBeInTheDocument();
  });
});
