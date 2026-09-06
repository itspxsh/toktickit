import { useEffect, useState } from "react";
import { checkSystem, type Category } from "./api.ts";
import {
  Alert,
  AppShell,
  AttachmentList,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Pagination,
  PriorityBadge,
  StatusBadge,
  ZEN_GREEN_TOKENS,
} from "./components/ui.tsx";
import {
  RequesterChangeConfirmation,
  RequesterProvider,
  RequesterSelection,
  useRequesterContext,
} from "./requester.tsx";
import { CreateTicket } from "./create-ticket.tsx";
import { MyTickets } from "./my-tickets.tsx";
import { TicketDetailPlaceholder } from "./ticket-detail-placeholder.tsx";
import { RequesterTicketDetail } from "./requester-ticket-detail.tsx";
import "./styles.css";

export {
  Alert,
  AppShell,
  AttachmentList,
  ConfirmationDialog,
  EmptyState,
  ErrorState,
  FormField,
  LoadingState,
  Pagination,
  PriorityBadge,
  StatusBadge,
  ZEN_GREEN_TOKENS,
  RequesterChangeConfirmation,
  RequesterProvider,
  RequesterSelection,
  CreateTicket,
  MyTickets,
  RequesterTicketDetail,
  TicketDetailPlaceholder,
  useRequesterContext,
};

type UiState = "idle" | "loading" | "success" | "error";

function usePathname(): [string, (path: string) => void] {
  const [pathname, setPathname] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string) {
    if (typeof window === "undefined") return;
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    setPathname(path);
  }

  return [pathname, navigate];
}

/** Lab 1's health check remains available inside the Lab 2 application shell. */
function HealthCheck() {
  const [state, setState] = useState<UiState>("idle");
  const [categories, setCategories] = useState<Category[]>([]);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleCheck() {
    setState("loading");
    setErrorMessage("");
    try {
      const result = await checkSystem();
      setCategories(result.categories);
      setState("success");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Unable to connect to TokTickIT API");
      setState("error");
    }
  }

  return (
    <section className="card stack" aria-labelledby="health-check-title">
        <div>
          <p className="eyebrow">Lab 1 compatibility check</p>
          <h1 id="health-check-title">TokTickIT service status</h1>
          <p>Use this diagnostic while the Lab 2 requester and ticket screens are being assembled.</p>
        </div>

        <button className="button button--primary" type="button" onClick={handleCheck} disabled={state === "loading"}>
          {state === "loading" ? "Loading…" : "Check System"}
        </button>

        {state === "loading" && <LoadingState label="loading" />}

        {state === "success" && (
          <div className="stack" aria-live="polite">
            <p>
              <strong>System Status:</strong> <StatusBadge label="Online" tone="success" />
            </p>
            {categories.length > 0 && (
              <div>
                <h2>Supported Request Categories</h2>
                <ul>
                  {categories.map((category) => (
                    <li key={category.id}>{category.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {state === "error" && (
          <div className="stack" aria-live="assertive">
            <p>
              <strong>System Status:</strong> <StatusBadge label="Offline" tone="error" />
            </p>
            <Alert tone="error">{errorMessage}</Alert>
          </div>
        )}
    </section>
  );
}

function RequesterAwareApp() {
  const [activePath, navigate] = usePathname();
  const context = useRequesterContext();
  const requesterRequired =
    activePath === "/tickets" ||
    activePath.startsWith("/tickets/") ||
    activePath === "/create-ticket" ||
    activePath.startsWith("/create-ticket/");
  const selectionRoute = activePath === "/select-requester";
  const ticketDetailMatch = activePath.match(/^\/tickets\/([^/]+)$/);
  const mustSelect =
    selectionRoute ||
    (requesterRequired && (context.status !== "success" || !context.selectedRequester));

  useEffect(() => {
    if (
      requesterRequired &&
      context.status === "success" &&
      !context.selectedRequester &&
      !selectionRoute
    ) {
      navigate("/select-requester");
    }
  }, [activePath, context.selectedRequester, context.status, requesterRequired, selectionRoute]);

  function handleChangeRequester() {
    context.requestChangeRequester(() => navigate("/select-requester"));
  }

  function handleNavigate(path: string) {
    context.requestNavigation(() => navigate(path));
  }

  return (
    <AppShell
      activePath={activePath}
      requesterLabel={context.selectedRequester?.name}
      onChangeRequester={handleChangeRequester}
      onNavigate={handleNavigate}
    >
      {mustSelect ? (
        <RequesterSelection onContinue={() => navigate("/tickets")} />
      ) : ticketDetailMatch ? (
        <RequesterTicketDetail
          ticketNumber={decodeTicketNumber(ticketDetailMatch[1])}
          onNavigate={handleNavigate}
        />
      ) : activePath === "/tickets" ? (
        <MyTickets onNavigate={handleNavigate} />
      ) : activePath === "/create-ticket" ? (
        <CreateTicket onNavigate={handleNavigate} />
      ) : (
        <HealthCheck />
      )}
      <RequesterChangeConfirmation />
    </AppShell>
  );
}

function decodeTicketNumber(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function App() {
  return (
    <RequesterProvider>
      <RequesterAwareApp />
    </RequesterProvider>
  );
}
