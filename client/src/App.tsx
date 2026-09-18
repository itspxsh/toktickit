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
import { StaffTicketDetail } from "./staff-ticket-detail.tsx";
import { AttachmentSection } from "./attachment-section.tsx";
import { StaffTicketQueue } from "./staff-ticket-queue.tsx";
import { UserManagement } from "./user-management.tsx";
import { AuthLoading, AuthProvider, ChangePassword, Login, useAuth } from "./auth.tsx";
import type { AuthUser } from "./api.ts";
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
  StaffTicketDetail,
  AttachmentSection,
  StaffTicketQueue,
  UserManagement,
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
          <h1 id="health-check-title">Service status</h1>
          <p>Use this diagnostic while the Lab 2 requester and ticket screens are being assembled.</p>
        </div>

        <button className="button button--primary" type="button" onClick={handleCheck} disabled={state === "loading"}>
          {state === "loading" ? "Loading…" : "Check System"}
        </button>

        {state === "loading" && <p className="loading-state" role="status">⌛ loading</p>}

        {state === "success" && (
          <div className="stack" aria-live="polite">
            <p>
              <strong>System Status: Online</strong> <StatusBadge label="Online" tone="success" />
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
              <strong>System Status: Offline</strong> <StatusBadge label="Offline" tone="error" />
            </p>
            <Alert tone="error">{errorMessage}</Alert>
          </div>
        )}
    </section>
  );
}

function RequesterAwareApp({ authUser, legacy = false, onLogout }: { authUser?: AuthUser | null; legacy?: boolean; onLogout?: () => void }) {
  const [activePath, navigate] = usePathname();
  const context = useRequesterContext();
  const requesterRequired = (legacy || authUser?.role === "REQUESTER") && (
    activePath === "/tickets" ||
    activePath.startsWith("/tickets/") ||
    activePath === "/create-ticket" ||
    activePath.startsWith("/create-ticket/"));
  const selectionRoute = legacy && activePath === "/select-requester";
  const ticketDetailMatch = activePath.match(/^\/tickets\/([^/]+)$/);
  const staffTicketDetailMatch = activePath.match(/^\/staff\/tickets\/([^/]+)$/);
  const mustSelect = legacy && (
    selectionRoute ||
    (requesterRequired && (context.status !== "success" || !context.selectedRequester)));

  useEffect(() => {
    if (
      legacy && requesterRequired &&
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
      role={authUser?.role}
      userName={authUser?.name}
      userEmail={authUser?.email}
      requesterLabel={context.selectedRequester?.name}
      onChangeRequester={legacy ? handleChangeRequester : undefined}
      onChangePassword={authUser ? () => navigate("/change-password") : undefined}
      onLogout={authUser ? onLogout : undefined}
      onNavigate={handleNavigate}
    >
      {mustSelect ? (
        <RequesterSelection onContinue={() => navigate("/tickets")} />
      ) : activePath === "/change-password" ? (
        <ChangePassword />
      ) : ticketDetailMatch ? (
        <RequesterTicketDetail
          ticketNumber={decodeTicketNumber(ticketDetailMatch[1])}
          onNavigate={handleNavigate}
        />
      ) : staffTicketDetailMatch ? (
        <StaffTicketDetail ticketNumber={decodeTicketNumber(staffTicketDetailMatch[1])} onNavigate={navigate} />
      ) : activePath === "/staff/tickets" ? (
        <StaffTicketQueue onOpenTicket={(number) => navigate(`/staff/tickets/${encodeURIComponent(number)}`)} />
      ) : activePath === "/admin/users" ? (
        <UserManagement />
      ) : activePath === "/tickets" ? (
        <MyTickets onNavigate={handleNavigate} />
      ) : activePath === "/create-ticket" ? (
        <CreateTicket onNavigate={handleNavigate} />
      ) : (
        <HealthCheck />
      )}
      {legacy && <RequesterChangeConfirmation />}
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

function AuthenticatedApp() {
  const auth = useAuth();
  if (auth.status === "loading") return <AuthLoading />;
  if (auth.status === "error") return <ErrorState onRetry={() => void auth.refresh()}>{auth.error ?? "Unable to load your session."}</ErrorState>;
  if (auth.status === "legacy") return <RequesterProvider><RequesterAwareApp legacy /></RequesterProvider>;
  if (auth.status === "anonymous") return <Login onSuccess={() => void auth.refresh()} />;
  if (!auth.user) return <Login onSuccess={() => void auth.refresh()} />;
  if (auth.user.mustChangePassword) return <ChangePassword onSuccess={() => void auth.refresh()} />;
  return <RequesterProvider mode={auth.user.role === "REQUESTER" ? "authenticated" : "disabled"} authenticatedRequester={auth.user.role === "REQUESTER" ? { id: auth.user.id, name: auth.user.name, email: auth.user.email } : null}><RequesterAwareApp authUser={auth.user} onLogout={() => { void auth.logout(); }} /></RequesterProvider>;
}

export default function App() {
  return <AuthProvider testLegacyFallback><AuthenticatedApp /></AuthProvider>;
}
