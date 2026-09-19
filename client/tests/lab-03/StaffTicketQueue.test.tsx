import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.ts";
import { StaffTicketQueue } from "../../src/staff-ticket-queue.tsx";

const result: api.StaffQueueResponse = {
  items: [{
    ticketNumber: "TKT-2026-000004",
    summary: "VPN access",
    requester: { id: 12, name: "Example Requester" },
    itPriority: "HIGH",
    currentStatus: "IN_PROGRESS",
    assignedStaff: { id: 21, name: "Support One" },
    updatedAt: "2026-09-15T08:00:00.000Z",
  }],
  page: 1,
  pageSize: 20,
  total: 21,
  totalPages: 2,
};

describe("L3-05 Staff Ticket Queue", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("T-UI-04 / AC-05 renders queue rows and sends search/filter/pagination controls", async () => {
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue(result);
    const user = userEvent.setup();
    render(<StaffTicketQueue />);
    expect(await screen.findByRole("heading", { name: "Staff Ticket Queue" })).toBeInTheDocument();
    expect(await screen.findByText("TKT-2026-000004")).toBeInTheDocument();
    expect(screen.getByText("Support One")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Search tickets" }), { target: { value: "VPN" } });
    await user.selectOptions(screen.getByRole("combobox", { name: "Status" }), "IN_PROGRESS");
    await user.selectOptions(screen.getByRole("combobox", { name: "IT Priority" }), "HIGH");
    await user.selectOptions(screen.getByRole("combobox", { name: "Assignment" }), "mine");
    await waitFor(() => expect(fetchSpy.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ q: "VPN", status: "IN_PROGRESS", itPriority: "HIGH", assignment: "mine", page: 1 })));

    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await waitFor(() => expect(fetchSpy.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ page: 2 })));
  });

  it("T-UI-04 distinguishes an empty queue and never renders private fields", async () => {
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets").mockResolvedValue({ ...result, items: [], total: 0, totalPages: 0 });
    render(<StaffTicketQueue />);
    expect(await screen.findByText(/No tickets match/i)).toBeInTheDocument();
    expect(screen.queryByText(/passwordHash|tokenHash/i)).not.toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalled();
  });

  it("T-UI-04 exposes a safe error and retries the queue", async () => {
    const fetchSpy = vi.spyOn(api, "fetchStaffTickets")
      .mockRejectedValueOnce(new Error("db details"))
      .mockResolvedValueOnce(result);
    const user = userEvent.setup();
    render(<StaffTicketQueue />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Unable to load staff queue/i);
    expect(screen.queryByText("db details")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("TKT-2026-000004")).toBeInTheDocument();
  });
});
