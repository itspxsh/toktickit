import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell, ConfirmationDialog, FormField, StatusBadge } from "../../src/App.tsx";

describe("Lab 2 application shell", () => {
  it("exposes the Zen Green shell navigation and testing-context copy", () => {
    render(<AppShell activePath="/tickets" />);

    expect(screen.getByRole("banner")).toHaveTextContent("TokTickIT");
    expect(screen.getByRole("link", { name: "My Tickets" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Create Ticket" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByText("No requester selected")).toBeInTheDocument();
    expect(screen.getByText("Testing context - not a login screen")).toBeInTheDocument();
  });

  it("toggles a labelled mobile navigation without removing keyboard-reachable links", async () => {
    const user = userEvent.setup();
    render(<AppShell activePath="/create-ticket" />);

    const menuButton = screen.getByRole("button", { name: "Open navigation menu" });
    expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await user.click(menuButton);
    expect(menuButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Create Ticket" })).toBeVisible();
    expect(screen.getByRole("link", { name: "My Tickets" })).toBeVisible();
  });
});

describe("Lab 2 shared UI primitives", () => {
  it("connects required labels and field errors with accessible semantics", () => {
    render(
      <FormField
        id="summary"
        label="Summary"
        required
        hint="Briefly describe the request"
        error="Summary is required"
      >
        <input id="summary" name="summary" />
      </FormField>,
    );

    const input = screen.getByRole("textbox", { name: /Summary/ });
    expect(screen.getByText("(required)")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-required", "true");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain("summary-error");
    expect(screen.getByText("Summary is required")).toHaveAttribute("id", "summary-error");
  });

  it("gives status badges a text label and a non-color cue", () => {
    render(<StatusBadge label="New" tone="success" />);

    const badge = screen.getByRole("status", { name: /New/ });
    expect(badge).toHaveTextContent("New");
    expect(badge).toHaveAttribute("data-tone", "success");
    expect(badge).toHaveTextContent("●");
  });

  it("closes an open confirmation dialog with Escape without confirming", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmationDialog
        open
        title="Discard changes?"
        message="Unsaved values will be removed."
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), {
      code: "Escape",
      key: "Escape",
      keyCode: 27,
    });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("Zen Green design tokens", () => {
  it("publishes the contract colors as CSS custom properties", () => {
    render(<AppShell />);

    const rootStyles = getComputedStyle(document.documentElement);
    expect(rootStyles.getPropertyValue("--color-primary").trim()).toBe("#006B3C");
    expect(rootStyles.getPropertyValue("--color-secondary").trim()).toBe("#0B7A46");
    expect(rootStyles.getPropertyValue("--color-background").trim()).toBe("#F5F7F6");
  });
});
