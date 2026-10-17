import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfirmationDialog, PriorityBadge, StatusBadge } from "../../src/components/ui.tsx";

describe("T-STYLE-01 / T-A11Y-01 / AC-14, AC-19: visual and keyboard semantics", () => {
  it("exposes status and priority as distinct text semantics, not color alone", () => {
    render(<><StatusBadge label="RESOLVED" tone="success" /><PriorityBadge label="URGENT" tone="error" /></>);
    expect(screen.getByRole("status", { name: "Status: RESOLVED" })).toHaveTextContent("RESOLVED");
    expect(screen.getByRole("status", { name: "Priority: URGENT" })).toHaveTextContent("URGENT");
  });

  it("traps keyboard focus, cancels on Escape, and returns focus to the opener", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const opener = document.createElement("button");
    opener.textContent = "Open dialog";
    document.body.appendChild(opener);
    opener.focus();
    const view = render(<ConfirmationDialog open title="Confirm action" message="Review this action." onCancel={onCancel} onConfirm={onConfirm} />);

    const dialog = screen.getByRole("alertdialog", { name: "Confirm action" });
    expect(dialog).toHaveAttribute("aria-describedby", "confirmation-message");
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(document.activeElement).toBe(cancel);
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(document.activeElement).toBe(confirm);
    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
