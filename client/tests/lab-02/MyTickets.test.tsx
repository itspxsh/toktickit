import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { MyTickets } from "../../src/my-tickets.tsx";
import App from "../../src/App.tsx";
import { RequesterProvider, REQUESTER_STORAGE_KEY } from "../../src/requester.tsx";

const requester = { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test" };
const ticket = {
  id: 2,
  ticketNumber: "TKT-2026-000002",
  ticketDate: "2026-09-06T00:00:00.000Z",
  summary: "Laptop battery drains quickly",
  requestedPriority: "HIGH" as const,
  currentStatus: "NEW" as const,
  createdAt: "2026-09-06T00:00:00.000Z",
  updatedAt: "2026-09-06T00:00:00.000Z",
  category: { id: 2, name: "Hardware" },
  relatedSystem: { id: 7, name: "Corporate Laptop" },
};

const page: api.TicketListResponse = {
  data: [ticket],
  pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
};

function renderMyTickets() {
  window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
  return render(
    <RequesterProvider>
      <MyTickets />
    </RequesterProvider>,
  );
}

describe("L2-06 My Tickets", () => {
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
    vi.spyOn(api, "fetchReferenceData").mockResolvedValue({
      categories: [{ id: 2, name: "Hardware" }],
      relatedSystems: [{ id: 7, name: "Corporate Laptop" }],
    });
  });

  it("UI-07 / AC-10: renders ticket rows and sends search/filter/sort controls to the API", async () => {
    const fetchSpy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(page);
    const user = userEvent.setup();
    renderMyTickets();

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
    expect(screen.getByText(ticket.summary)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open ticket" })).toHaveAttribute(
      "href",
      `/tickets/${ticket.ticketNumber}`,
    );

    const search = screen.getByRole("textbox", { name: "Search Tickets" });
    fireEvent.change(search, { target: { value: "Laptop" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "2");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort field" }), "createdAt");
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort order" }), "asc");

    await waitFor(() => expect(fetchSpy.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
      search: "Laptop",
      categoryId: 2,
      sortBy: "createdAt",
      sortOrder: "asc",
      page: 1,
    })));
    expect(fetchSpy.mock.calls.at(-1)?.[0]).toBe(1);
  });

  it("UI-08 / AC-11: distinguishes an empty requester list from no matching results", async () => {
    const fetchSpy = vi.spyOn(api, "fetchMyTickets").mockImplementation(async (_requesterId, query) => (
      query?.search
        ? { data: [], pagination: { page: 1, pageSize: 10, totalItems: 2, totalPages: 1 } }
        : { data: [], pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } }
    ));
    const user = userEvent.setup();
    renderMyTickets();

    expect(await screen.findByText(/has no Tickets yet/i)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search Tickets" }), {
      target: { value: "missing" },
    });
    await waitFor(() => expect(screen.getByText(/No Tickets match the current search and filters/i)).toBeInTheDocument());
    expect(screen.getAllByRole("button", { name: "Clear filters" })).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("UI-07 / AC-10: requests the next page with the permitted pagination control", async () => {
    const secondPage: api.TicketListResponse = {
      ...page,
      pagination: { page: 1, pageSize: 10, totalItems: 11, totalPages: 2 },
    };
    const fetchSpy = vi.spyOn(api, "fetchMyTickets").mockResolvedValue(secondPage);
    const user = userEvent.setup();
    renderMyTickets();

    await screen.findByText(ticket.ticketNumber);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(fetchSpy.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({ page: 2 })));
  });

  it("UI-08: exposes a safe failure and retries without losing the active query", async () => {
    const fetchSpy = vi.spyOn(api, "fetchMyTickets")
      .mockRejectedValueOnce(new Error("database details leaked"))
      .mockResolvedValueOnce(page);
    const user = userEvent.setup();
    renderMyTickets();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to load My Tickets/i);
    expect(screen.queryByText(/database details leaked/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
  });

  it("mounts My Tickets from the requester-scoped application route", async () => {
    vi.spyOn(api, "fetchMyTickets").mockResolvedValue(page);
    window.localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    window.history.pushState({}, "", "/tickets");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "My Tickets" })).toBeInTheDocument();
    expect(await screen.findByText(ticket.ticketNumber)).toBeInTheDocument();
  });
});
