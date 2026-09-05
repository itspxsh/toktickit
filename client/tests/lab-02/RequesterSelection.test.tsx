import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as api from "../../src/api.ts";
import {
  RequesterProvider,
  RequesterSelection,
  REQUESTER_STORAGE_KEY,
  useRequesterContext,
} from "../../src/requester.tsx";
import { ConfirmationDialog } from "../../src/components/ui.tsx";

const requesters = [
  { id: 1, name: "Jennifer Anderson", email: "jennifer@example.test" },
  { id: 2, name: "Michael Chen", email: "michael@example.test" },
];

function ContextProbe() {
  const context = useRequesterContext();
  return (
    <>
      <output data-testid="selected-id">{context.selectedRequester?.id ?? "none"}</output>
      <output data-testid="context-status">{context.status}</output>
      <button type="button" onClick={() => context.setCreateTicketDirty(true)}>
        Make form dirty
      </button>
      <button type="button" onClick={() => context.requestChangeRequester()}>
        Change Requester
      </button>
      <ConfirmationDialog
        open={context.pendingChange}
        title="Discard changes?"
        message="Unsaved values will be removed."
        onCancel={context.cancelRequesterChange}
        onConfirm={context.confirmRequesterChange}
      />
    </>
  );
}

describe("L2-04 Development Requester context", () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("UI-01: loads an accessible selector containing only active requester results", async () => {
    vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);
    const user = userEvent.setup();

    render(
      <RequesterProvider>
        <RequesterSelection />
      </RequesterProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    const select = await screen.findByRole("combobox", { name: /Development Requester/ });
    expect(screen.getByRole("option", { name: /Jennifer Anderson/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Taylor Morgan/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();

    await user.selectOptions(select, "2");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("UI-02: shows empty guidance when there are no active requesters", async () => {
    vi.spyOn(api, "fetchRequesters").mockResolvedValue([]);

    render(
      <RequesterProvider>
        <RequesterSelection />
      </RequesterProvider>,
    );

    expect(await screen.findByRole("heading", { name: "No Development Requesters available" })).toBeInTheDocument();
    expect(screen.getByText(/seed active requesters/i)).toBeInTheDocument();
  });

  it("UI-02: exposes a safe failure and retries the request", async () => {
    const fetchSpy = vi
      .spyOn(api, "fetchRequesters")
      .mockRejectedValueOnce(new Error("database SQL leaked"))
      .mockResolvedValueOnce(requesters);
    const user = userEvent.setup();

    render(
      <RequesterProvider>
        <RequesterSelection />
      </RequesterProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load/i);
    expect(screen.queryByText(/database SQL leaked/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("combobox", { name: /Development Requester/ })).toBeInTheDocument();
  });

  it("UNIT-01 and AC-04: retains an active persisted id and clears a missing id", async () => {
    localStorage.setItem(REQUESTER_STORAGE_KEY, "2");
    vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);

    render(
      <RequesterProvider>
        <ContextProbe />
      </RequesterProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected-id")).toHaveTextContent("2"));
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("2");

    localStorage.setItem(REQUESTER_STORAGE_KEY, "999");
    render(
      <RequesterProvider>
        <ContextProbe />
      </RequesterProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("selected-id")[1]).toHaveTextContent("none"));
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();
  });

  it("UI-03: keeps the requester on cancel and clears dirty context on confirm", async () => {
    localStorage.setItem(REQUESTER_STORAGE_KEY, "1");
    vi.spyOn(api, "fetchRequesters").mockResolvedValue(requesters);
    const user = userEvent.setup();

    render(
      <RequesterProvider>
        <ContextProbe />
      </RequesterProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected-id")).toHaveTextContent("1"));
    await user.click(screen.getByRole("button", { name: "Make form dirty" }));
    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByTestId("selected-id")).toHaveTextContent("1");
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBe("1");

    await user.click(screen.getByRole("button", { name: "Change Requester" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("selected-id")).toHaveTextContent("none");
    expect(localStorage.getItem(REQUESTER_STORAGE_KEY)).toBeNull();
  });
});
