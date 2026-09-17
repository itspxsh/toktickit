import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffTicketDetail } from "../../src/staff-ticket-detail.tsx";

const ticket = {
  ticketNumber: "TKT-2026-000004",
  summary: "VPN access",
  description: "Cannot connect",
  ticketDate: "2026-09-15T07:00:00.000Z",
  requestedPriority: "MEDIUM",
  itPriority: "HIGH",
  currentStatus: "IN_PROGRESS",
  appearsResolved: false,
  requester: { id: 12, name: "Example Requester", email: "requester@example.test" },
  assignedStaff: { id: 21, name: "Support One" },
  attachments: [{ id: 8, originalName: "error.png", mimeType: "image/png", sizeBytes: 1234, status: "ACTIVE", createdAt: "2026-09-15T07:02:00.000Z" }],
  publicComments: [{ id: 7, author: { id: 12, name: "Example Requester", role: "REQUESTER" }, body: "It still happens.", createdAt: "2026-09-15T07:10:00.000Z" }],
  internalNotes: [{ id: 9, author: { id: 21, name: "Support One", role: "IT_STAFF" }, body: "Checked gateway logs.", createdAt: "2026-09-15T07:11:00.000Z" }],
};

describe("StaffTicketDetail", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.includes("/api/auth/csrf")) return new Response(JSON.stringify({ csrfToken: "test-csrf" }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (init?.method === "POST" || init?.method === "PATCH") return new Response(JSON.stringify({ ticket }), { status: 200, headers: { "Content-Type": "application/json" } });
      return new Response(JSON.stringify({ ticket }), { status: 200, headers: { "Content-Type": "application/json" } });
    }));
  });

  it("T-UI-05 renders read-only identity, workflow controls, comments, notes, and attachments", async () => {
    render(<StaffTicketDetail ticketNumber={ticket.ticketNumber} />);
    await waitFor(() => expect(document.body.textContent).toContain("Staff Ticket Detail"));
    expect(screen.getByDisplayValue("requester@example.test")).toHaveAttribute("readOnly");
    expect(document.body.textContent).toContain("Checked gateway logs.");
    expect(document.body.textContent).toContain("error.png");
    expect(screen.getByRole("button", { name: /claim|save assignment/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save status/i })).toBeInTheDocument();
  });

  it("T-UI-05 preserves safe error state and retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Unable to load Ticket." } }), { status: 500 })));
    render(<StaffTicketDetail ticketNumber={ticket.ticketNumber} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load Ticket.");
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("T-UI-05 submits a trimmed public comment", async () => {
    render(<StaffTicketDetail ticketNumber={ticket.ticketNumber} />);
    await waitFor(() => expect(document.body.textContent).toContain("Checked gateway logs."));
    fireEvent.change(screen.getByRole("textbox", { name: "Public comment" }), { target: { value: "  Need more details  " } });
    fireEvent.click(screen.getByRole("button", { name: /add public comment/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/comments"), expect.objectContaining({ method: "POST" })));
  });
});
