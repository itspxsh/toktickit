import { useEffect, useRef, useState } from "react";
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
import { RequesterDashboard } from "./requester-dashboard.tsx";
import { StaffDashboard } from "./staff-dashboard.tsx";
import { AuthLoading, AuthProvider, ChangePassword, Login, RoleGuard, useAuth } from "./auth.tsx";
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
  RequesterDashboard,
  StaffDashboard,
  TicketDetailPlaceholder,
  useRequesterContext,
};

type UiState = "idle" | "loading" | "success" | "error";

export function useBrowserLocation(
  guardPopNavigation?: (continueNavigation: () => void) => void,
): [string, (path: string, options?: { replace?: boolean }) => void] {
  const [location, setLocation] = useState(() =>
    typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  const currentLocation = useRef(location);
  const guardRef = useRef(guardPopNavigation);
  const skipPopGuardRef = useRef(false);
  currentLocation.current = location;
  guardRef.current = guardPopNavigation;

  useEffect(() => {
    const onPopState = () => {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (skipPopGuardRef.current) {
        skipPopGuardRef.current = false;
        setLocation(destination);
        return;
      }
      const guard = guardRef.current;
      if (!guard) {
        setLocation(destination);
        return;
      }

      const previous = currentLocation.current;
      window.history.pushState({}, "", previous);
      guard(() => {
        skipPopGuardRef.current = true;
        window.history.back();
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function navigate(path: string, options: { replace?: boolean } = {}) {
    if (typeof window === "undefined") return;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return;
    const destination = new URL(path, window.location.origin);
    if (destination.origin !== window.location.origin) return;
    const next = `${destination.pathname}${destination.search}${destination.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current !== next) {
      if (options.replace) window.history.replaceState({}, "", next);
      else window.history.pushState({}, "", next);
    }
    setLocation(next);
  }

  return [location, navigate];
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
  const context = useRequesterContext();
  const [activePath, navigate] = useBrowserLocation(
    context.createTicketDirty || context.staffTicketDirty ? context.requestNavigation : undefined,
  );
  const pathname = activePath.split(/[?#]/, 1)[0] || "/";
  const requesterRequired = (legacy || authUser?.role === "REQUESTER") && (
    pathname === "/tickets" ||
    pathname.startsWith("/tickets/") ||
    pathname === "/create-ticket" ||
    pathname.startsWith("/create-ticket/"));
  const selectionRoute = legacy && pathname === "/select-requester";
  const ticketDetailMatch = pathname.match(/^\/tickets\/([^/]+)$/);
  const staffTicketDetailMatch = pathname.match(/^\/staff\/tickets\/([^/]+)$/);
  const mustSelect = legacy && (
    selectionRoute ||
    (requesterRequired && (context.status !== "success" || !context.selectedRequester)));

  useEffect(() => {
    if (authUser && pathname === "/") {
      navigate(authUser.role === "REQUESTER" ? "/dashboard" : "/staff/dashboard");
      return;
    }
    if (
      legacy && requesterRequired &&
      context.status === "success" &&
      !context.selectedRequester &&
      !selectionRoute
    ) {
      navigate("/select-requester");
    }
  }, [activePath, authUser, context.selectedRequester, context.status, navigate, requesterRequired, selectionRoute]);

  function handleChangeRequester() {
    context.requestChangeRequester(() => navigate("/select-requester"));
  }

  function handleNavigate(path: string, options?: { replace?: boolean }) {
    context.requestNavigation(() => navigate(path, options));
  }

  const routeContent = mustSelect ? (
    <RequesterSelection onContinue={() => navigate("/tickets")} />
  ) : pathname === "/change-password" ? (
    <ChangePassword />
  ) : pathname === "/dashboard" && authUser?.role === "REQUESTER" ? (
    <RequesterDashboard onNavigate={handleNavigate} />
  ) : pathname === "/staff/dashboard" && (authUser?.role === "IT_STAFF" || authUser?.role === "ADMIN") ? (
    <StaffDashboard location={activePath} onNavigate={handleNavigate} />
  ) : ticketDetailMatch ? (
    <RequesterTicketDetail
      ticketNumber={decodeTicketNumber(ticketDetailMatch[1])}
      onNavigate={handleNavigate}
    />
  ) : staffTicketDetailMatch ? (
    <StaffTicketDetail ticketNumber={decodeTicketNumber(staffTicketDetailMatch[1])} onNavigate={handleNavigate} onDirtyChange={context.setStaffTicketDirty} initialActionId={parseActionAnchor(activePath)} />
  ) : pathname === "/staff/tickets" ? (
    <StaffTicketQueue onOpenTicket={(number) => navigate(`/staff/tickets/${encodeURIComponent(number)}`)} location={activePath} onNavigate={handleNavigate} />
  ) : pathname === "/admin/users" ? (
    <UserManagement />
  ) : pathname === "/tickets" ? (
    <MyTickets onNavigate={handleNavigate} location={activePath} />
  ) : pathname === "/create-ticket" ? (
    <CreateTicket onNavigate={handleNavigate} />
  ) : pathname === "/service-status" ? (
    <HealthCheck />
  ) : (
    <HealthCheck />
  );

  return (
    <AppShell
      activePath={activePath}
      role={authUser?.role}
      userName={authUser?.name}
      userEmail={authUser?.email}
      requesterLabel={context.selectedRequester?.name ?? context.authenticatedRequester?.name}
      onChangeRequester={legacy ? handleChangeRequester : undefined}
      onChangePassword={authUser ? () => navigate("/change-password") : undefined}
      onLogout={authUser ? onLogout : undefined}
      onNavigate={handleNavigate}
    >
      {authUser ? <RoleGuard role={authUser.role} path={pathname}>{routeContent}</RoleGuard> : routeContent}
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

function parseActionAnchor(location: string): number | undefined {
  const match = location.match(/#action-(\d+)$/);
  if (!match) return undefined;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function AuthenticatedApp() {
  const auth = useAuth();
  if (auth.status === "loading") return <AuthLoading />;
  if (auth.status === "error") return <ErrorState onRetry={() => void auth.refresh()}>{auth.error ?? "Unable to load your session."}</ErrorState>;
  if (auth.status === "legacy") return <RequesterProvider><RequesterAwareApp legacy /></RequesterProvider>;
  if (auth.status === "anonymous") return <Login onSuccess={() => void auth.refresh()} />;
  if (!auth.user) return <Login onSuccess={() => void auth.refresh()} />;
  if (auth.user.mustChangePassword) return <ChangePassword onSuccess={() => void auth.refresh()} />;
  return <RequesterProvider mode={auth.user.role === "REQUESTER" ? "authenticated" : "disabled"} authenticatedRequester={auth.user.role === "REQUESTER" ? { name: auth.user.name, email: auth.user.email } : null}><RequesterAwareApp authUser={auth.user} onLogout={() => { void auth.logout(); }} /></RequesterProvider>;
}

export default function App() {
  return <AuthProvider testLegacyFallback><AuthenticatedApp /></AuthProvider>;
}
