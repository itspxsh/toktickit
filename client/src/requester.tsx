import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { fetchRequesters, type Requester } from "./api.ts";
import { Alert, ConfirmationDialog, ErrorState, FormField, LoadingState } from "./components/ui.tsx";

export const REQUESTER_STORAGE_KEY = "toktickit.developmentRequesterId";

type RequesterLoadStatus = "loading" | "success" | "error";

export interface RequesterContextValue {
  contextVersion: number;
  createTicketDirty: boolean;
  error: string | null;
  pendingChange: boolean;
  requesters: Requester[];
  selectedRequester: Requester | null;
  selectedRequesterId: number | null;
  status: RequesterLoadStatus;
  cancelRequesterChange: () => void;
  clearRequester: () => void;
  confirmRequesterChange: () => void;
  reload: () => void;
  requestChangeRequester: (onCleared?: () => void) => void;
  selectRequester: (id: number) => boolean;
  setCreateTicketDirty: (dirty: boolean) => void;
}

// Keeping the context creation in this module avoids introducing a router or
// state-management dependency for the Lab 2 testing context.
const RequesterContext = createContext<RequesterContextValue | null>(null);

function readPersistedRequesterId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(REQUESTER_STORAGE_KEY);
  if (!raw || !/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function persistRequesterId(id: number): void {
  if (typeof window !== "undefined") window.localStorage.setItem(REQUESTER_STORAGE_KEY, String(id));
}

function removePersistedRequesterId(): void {
  if (typeof window !== "undefined") window.localStorage.removeItem(REQUESTER_STORAGE_KEY);
}

export function RequesterProvider({ children }: { children: ReactNode }) {
  const [requesters, setRequesters] = useState<Requester[]>([]);
  const [selectedRequesterId, setSelectedRequesterId] = useState<number | null>(readPersistedRequesterId);
  const [status, setStatus] = useState<RequesterLoadStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [createTicketDirty, setCreateTicketDirty] = useState(false);
  const [pendingChange, setPendingChange] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | undefined>();
  const [contextVersion, setContextVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;

    setStatus("loading");
    setError(null);
    fetchRequesters(controller.signal)
      .then((rows) => {
        if (ignore) return;
        setRequesters(rows);
        const persistedId = readPersistedRequesterId();
        if (persistedId !== null && rows.some((requester) => requester.id === persistedId)) {
          setSelectedRequesterId(persistedId);
        } else {
          removePersistedRequesterId();
          setSelectedRequesterId(null);
        }
        setStatus("success");
      })
      .catch((reason: unknown) => {
        if (ignore || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setStatus("error");
        setError("Unable to load Development Requesters");
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [reloadToken]);

  const selectedRequester = useMemo(
    () => requesters.find((requester) => requester.id === selectedRequesterId) ?? null,
    [requesters, selectedRequesterId],
  );

  const clearRequester = useCallback(() => {
    removePersistedRequesterId();
    setSelectedRequesterId(null);
    setContextVersion((version) => version + 1);
  }, []);

  const selectRequester = useCallback(
    (id: number) => {
      const requester = requesters.find((candidate) => candidate.id === id);
      if (!requester) return false;
      persistRequesterId(requester.id);
      setSelectedRequesterId(requester.id);
      setContextVersion((version) => version + 1);
      return true;
    },
    [requesters],
  );

  const requestChangeRequester = useCallback(
    (onCleared?: () => void) => {
      const navigation = typeof onCleared === "function" ? onCleared : undefined;
      if (createTicketDirty) {
        setPendingNavigation(() => navigation);
        setPendingChange(true);
        return;
      }
      clearRequester();
      navigation?.();
    },
    [clearRequester, createTicketDirty],
  );

  const cancelRequesterChange = useCallback(() => {
    setPendingChange(false);
    setPendingNavigation(undefined);
  }, []);

  const confirmRequesterChange = useCallback(() => {
    const onCleared = pendingNavigation;
    setPendingChange(false);
    setPendingNavigation(undefined);
    setCreateTicketDirty(false);
    clearRequester();
    onCleared?.();
  }, [clearRequester, pendingNavigation]);

  const value = useMemo<RequesterContextValue>(
    () => ({
      contextVersion,
      createTicketDirty,
      error,
      pendingChange,
      requesters,
      selectedRequester,
      selectedRequesterId,
      status,
      cancelRequesterChange,
      clearRequester,
      confirmRequesterChange,
      reload: () => setReloadToken((token) => token + 1),
      requestChangeRequester,
      selectRequester,
      setCreateTicketDirty,
    }),
    [
      cancelRequesterChange,
      clearRequester,
      confirmRequesterChange,
      contextVersion,
      createTicketDirty,
      error,
      pendingChange,
      requestChangeRequester,
      requesters,
      selectedRequester,
      selectedRequesterId,
      selectRequester,
      status,
    ],
  );

  return <RequesterContext.Provider value={value}>{children}</RequesterContext.Provider>;
}

export function useRequesterContext(): RequesterContextValue {
  const context = useContext(RequesterContext);
  if (!context) throw new Error("useRequesterContext must be used within RequesterProvider");
  return context;
}

export interface RequesterSelectionProps {
  onContinue?: (requester: Requester) => void;
}

export function RequesterSelection({ onContinue }: RequesterSelectionProps) {
  const context = useRequesterContext();
  const [draftId, setDraftId] = useState<number | null>(context.selectedRequesterId);

  useEffect(() => {
    setDraftId(context.selectedRequesterId);
  }, [context.selectedRequesterId]);

  if (context.status === "loading") {
    return (
      <section className="card stack" aria-labelledby="requester-selection-title">
        <h1 id="requester-selection-title">Choose a Development Requester</h1>
        <LoadingState label="Loading Development Requesters…" />
      </section>
    );
  }

  if (context.status === "error") {
    return (
      <section className="card stack" aria-labelledby="requester-selection-title">
        <h1 id="requester-selection-title">Choose a Development Requester</h1>
        <ErrorState onRetry={context.reload}>{context.error ?? "Unable to load Development Requesters"}</ErrorState>
      </section>
    );
  }

  if (context.requesters.length === 0) {
    return (
      <section className="card stack" aria-labelledby="requester-selection-title">
        <h1 id="requester-selection-title">No Development Requesters available</h1>
        <p>Ask the developer to seed active requesters, then retry this screen.</p>
        <Alert tone="warning">Authentication arrives in Lab 3; this is a testing context only.</Alert>
        <button type="button" className="button button--secondary" onClick={context.reload}>
          Retry
        </button>
      </section>
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftId === null) return;
    const requester = context.requesters.find((candidate) => candidate.id === draftId);
    if (requester && context.selectRequester(requester.id)) onContinue?.(requester);
  }

  return (
    <section className="card stack" aria-labelledby="requester-selection-title">
      <div>
        <p className="eyebrow">Lab 2 testing context</p>
        <h1 id="requester-selection-title">Choose a Development Requester</h1>
        <p>Select an active seeded requester before opening requester-scoped screens.</p>
      </div>
      <Alert tone="warning">Authentication arrives in Lab 3; this is a testing context only.</Alert>
      <form className="stack" onSubmit={handleSubmit}>
        <FormField
          id="development-requester"
          label="Development Requester"
          required
          hint="Only active requesters are available."
        >
          <select
            id="development-requester"
            name="developmentRequester"
            value={draftId ?? ""}
            onChange={(event) => setDraftId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Select a requester</option>
            {context.requesters.map((requester) => (
              <option key={requester.id} value={requester.id}>
                {requester.name} ({requester.email})
              </option>
            ))}
          </select>
        </FormField>
        <div className="form-actions">
          <button type="button" className="button button--tertiary" onClick={context.clearRequester}>
            Cancel
          </button>
          <button type="submit" className="button button--primary" disabled={draftId === null}>
            Continue
          </button>
        </div>
      </form>
    </section>
  );
}

export function RequesterChangeConfirmation() {
  const context = useRequesterContext();
  return (
    <ConfirmationDialog
      open={context.pendingChange}
      title="Discard changes?"
      message="Unsaved Create Ticket values will be removed."
      onCancel={context.cancelRequesterChange}
      onConfirm={context.confirmRequesterChange}
    />
  );
}
