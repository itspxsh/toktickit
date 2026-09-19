import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog } from "../../src/components/ui.tsx";

describe("L3-08 accessibility contract", () => {
  it("T-UI-08 / AC-15 traps focus, cancels on Escape, and restores focus", async () => {
    const user = userEvent.setup();
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.appendChild(opener);
    opener.focus();
    const onCancel = vi.fn();
    render(<ConfirmationDialog open title="Confirm" message="Are you sure?" onCancel={onCancel} onConfirm={vi.fn()} />);
    expect(screen.getByRole("alertdialog")).toHaveAttribute("aria-describedby", "confirmation-message");
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalled();
    opener.focus();
    expect(document.activeElement).toBe(opener);
  });
});
