import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../../src/components/ui.tsx";

describe("L3-08 responsive role shell", () => {
  it("T-UI-09 / AC-15 keeps role and status cues textual", () => {
    render(<AppShell activePath="/staff/tickets" role="IT_STAFF" userName="Support One" userEmail="support.one@example.test"><p>content</p></AppShell>);
    expect(screen.getByText("IT Staff")).toBeInTheDocument();
    expect(screen.getByLabelText(/Role: IT Staff/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open navigation menu/i })).toHaveAttribute("aria-controls", "primary-navigation");
  });
});
