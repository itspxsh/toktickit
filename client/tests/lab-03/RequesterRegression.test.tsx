import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RequesterTicketDetail } from "../../src/requester-ticket-detail.tsx";
import { RequesterProvider } from "../../src/requester.tsx";

describe("L3-08 authenticated requester continuity", () => {
  it("T-UI-06 / AC-04 exposes a non-formal appears-resolved action", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: {
        id: 1,
        ticketNumber: "TKT-0001",
        ticketDate: "2026-09-18",
        requester: { id: 10, name: "Requester" },
        category: { id: 1, name: "Hardware" },
        relatedSystem: { id: 1, name: "Laptop" },
        summary: "Cannot connect",
        requestedPriority: "MEDIUM",
        description: "The laptop cannot connect.",
        itPriority: null,
        currentStatus: "NEW",
        appearsResolved: false,
        createdAt: "2026-09-18T00:00:00.000Z",
        updatedAt: "2026-09-18T00:00:00.000Z",
        attachments: [],
      } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-1" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticketNumber: "TKT-0001", appearsResolved: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RequesterProvider mode="authenticated" authenticatedRequester={{ id: 10, name: "Requester", email: "requester@example.test" }}>
        <RequesterTicketDetail ticketNumber="TKT-0001" />
      </RequesterProvider>,
    );

    const action = await screen.findByRole("button", { name: /problem appears resolved/i });
    await user.click(action);

    expect(await screen.findByText(/appears resolved/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/tickets/TKT-0001/resolution-indication"),
      expect.objectContaining({ method: "POST", body: JSON.stringify({ appearsResolved: true }) }),
    );
  });
});
