import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchStaffDashboard, type DashboardMetric, type DashboardTicketSummary, type StaffDashboardView } from "./api.ts";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "./components/ui.tsx";
import { Forbidden } from "./auth.tsx";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

const ACTION_PAGE_SIZE = 5;
const MAX_ACTION_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / ACTION_PAGE_SIZE) + 1;

function parseActionPage(value: string | null): number | null {
  if (!value || !/^[1-9]\d*$/.test(value)) return null;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= MAX_ACTION_PAGE ? page : null;
}

function safeStaffPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin || !hasUniqueQueryKeys(url)) return null;
    if (/^\/staff\/tickets\/TKT-\d{4}-\d{6}$/.test(url.pathname)) {
      return url.search === "" && (url.hash === "" || /^#action-[1-9]\d*$/.test(url.hash)) ? value : null;
    }
    if (url.pathname === "/staff/dashboard") {
      const page = url.searchParams.get("actionPage");
      return [...url.searchParams.keys()].join(",") === "actionPage" && parseActionPage(page) !== null && url.hash === "#my-actions" ? value : null;
    }
    if (url.pathname !== "/staff/tickets" || url.hash !== "") return null;
    const keys = [...url.searchParams.keys()].sort().join(",");
    const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
    const priorities = ["LOW", "MEDIUM", "HIGH", "URGENT", "UNPRIORITIZED"];
    if (keys === "status" && statuses.includes(url.searchParams.get("status") ?? "")) return value;
    if (keys === "statusGroup" && url.searchParams.get("statusGroup") === "active") return value;
    if (keys === "assignment,statusGroup" && url.searchParams.get("statusGroup") === "active" && ["mine", "unassigned"].includes(url.searchParams.get("assignment") ?? "")) return value;
    if (keys === "itPriority,statusGroup" && url.searchParams.get("statusGroup") === "active" && priorities.includes(url.searchParams.get("itPriority") ?? "")) return value;
    return null;
  } catch { return null; }
}

function hasUniqueQueryKeys(url: URL): boolean {
  const keys = [...url.searchParams.keys()];
  return new Set(keys).size === keys.length;
}

function MetricCard({ label, metric, onNavigate }: { label: string; metric: DashboardMetric; onNavigate: (path: string) => void }) {
  const href = safeStaffPath(metric.drillDown);
  return <article className="dashboard-metric card"><h2>{label}</h2>
    {href ? <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }} aria-label={`${label}: ${metric.value}`}>{metric.value}</a> : <p>{metric.value}</p>}
  </article>;
}

function TicketRows({ tickets, empty, onNavigate }: { tickets: DashboardTicketSummary[]; empty: string; onNavigate: (path: string) => void }) {
  if (!tickets.length) return <EmptyState>{empty}</EmptyState>;
  return <ul className="dashboard-ticket-list">{tickets.map((ticket) => {
    const href = safeStaffPath(ticket.href);
    return <li key={ticket.ticketNumber}><div><strong>{ticket.ticketNumber}</strong><p>{ticket.summary}</p></div>
      <StatusBadge label={ticket.currentStatus.replaceAll("_", " ")} />
      <span>{ticket.itPriority ? `Priority: ${ticket.itPriority}` : "Not prioritized"}</span>
      {ticket.resolvedAt && <span>Resolved {formatTime(ticket.resolvedAt)}</span>}
      {href && <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }}>Open ticket</a>}
    </li>;
  })}</ul>;
}

export function StaffDashboard({ location, onNavigate }: { location: string; onNavigate: (path: string, options?: { replace?: boolean }) => void }) {
  const queryString = location.split("?")[1]?.split("#")[0] ?? "";
  const params = new URLSearchParams(queryString);
  const rawPage = params.get("actionPage");
  const parsedPage = rawPage === null ? 1 : parseActionPage(rawPage);
  const actionPage = parsedPage ?? 1;
  const hash = location.includes("#") ? location.slice(location.indexOf("#")) : "";
  const canonicalQuery = new URLSearchParams();
  if (actionPage > 1) canonicalQuery.set("actionPage", String(actionPage));
  const canonicalLocation = `/staff/dashboard${canonicalQuery.size ? `?${canonicalQuery}` : ""}${hash === "#my-actions" ? hash : ""}`;
  const allowedQuery = [...params.keys()].every((key) => key === "actionPage") && new Set(params.keys()).size === [...params.keys()].length;
  const [data, setData] = useState<StaffDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setData(await fetchStaffDashboard({ actionPage, actionPageSize: ACTION_PAGE_SIZE }, signal)); }
    catch (reason) { if (!signal?.aborted) setError(reason); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [actionPage]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if ((!allowedQuery || (rawPage !== null && parsedPage === null) || (rawPage === "1")) && location !== canonicalLocation) {
      onNavigate(canonicalLocation, { replace: true });
    }
  }, [allowedQuery, canonicalLocation, location, onNavigate, parsedPage, rawPage]);
  useEffect(() => {
    if (loading || !location.includes("#")) return;
    const targetId = location.slice(location.indexOf("#") + 1);
    if (targetId === "my-actions") document.getElementById(targetId)?.scrollIntoView({ block: "start" });
  }, [loading, location]);
  const errorMessage = error instanceof Error ? error.message : "Unable to load support dashboard.";

  return <section className="dashboard-page stack" aria-labelledby="staff-dashboard-title">
    <header className="dashboard-heading"><div><p className="eyebrow">Support workspace</p><h1 id="staff-dashboard-title">Support Dashboard</h1></div>
      <button className="button button--secondary" type="button" onClick={() => void load()}>Refresh</button></header>
    {loading && <LoadingState label="Loading support dashboard…" />}
    {error !== null ? (error instanceof ApiError && error.status === 403 ? <Forbidden /> : <ErrorState onRetry={() => void load()}>{errorMessage}</ErrorState>) : null}
    {data && !loading && !error && <>
      <p className="dashboard-asof">As of {formatTime(data.asOf)} · Times: {data.displayTimeZone} (UTC+7)</p>
      <div className="dashboard-metrics">
        <MetricCard label="Unassigned active tickets" metric={data.metrics.unassignedActive} onNavigate={onNavigate} />
        <MetricCard label="My active tickets" metric={data.metrics.ownedActive} onNavigate={onNavigate} />
        <MetricCard label="Urgent active tickets" metric={data.metrics.urgentActive} onNavigate={onNavigate} />
        <MetricCard label="My unfinished actions" metric={data.metrics.myUnfinishedActions} onNavigate={onNavigate} />
      </div>
      <div className="dashboard-split">
        <section className="card stack"><h2>Tickets by status</h2><ul className="dashboard-buckets">{data.statusBuckets.map((bucket) => { const href = safeStaffPath(bucket.drillDown); return <li key={bucket.status}>{href ? <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }}>{bucket.status.replaceAll("_", " ")}: {bucket.value}</a> : <span>{bucket.status}: {bucket.value}</span>}</li>; })}</ul></section>
        <section className="card stack"><h2>Active tickets by IT priority</h2><ul className="dashboard-buckets">{data.priorityBuckets.map((bucket) => { const href = safeStaffPath(bucket.drillDown); const label = bucket.priority === "UNPRIORITIZED" ? "Not prioritized" : bucket.priority; return <li key={bucket.priority}>{href ? <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }}>{label}: {bucket.value}</a> : <span>{label}: {bucket.value}</span>}</li>; })}</ul></section>
      </div>
      <section className="card stack"><h2>Recent tickets</h2><TicketRows tickets={data.recentTickets} empty="No recent tickets." onNavigate={onNavigate} /></section>
      <section className="card stack"><h2>Urgent tickets</h2><TicketRows tickets={data.urgentTickets} empty="No urgent active tickets." onNavigate={onNavigate} /></section>
      <section id="my-actions" className="card stack" aria-labelledby="my-actions-title" tabIndex={-1}><header className="dashboard-section-heading"><h2 id="my-actions-title">My unfinished actions</h2><span>{data.myActions.total} total</span></header>
        {!data.myActions.items.length ? <EmptyState>No unfinished Actions assigned to you.</EmptyState> : <ul className="dashboard-action-list">{data.myActions.items.map((action) => { const href = safeStaffPath(action.href); return <li key={action.id}><div><strong>{action.description}</strong><p>{action.state.replaceAll("_", " ")} · {formatTime(action.createdAt)}</p></div>{href && <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }}>{action.ticketNumber}: {action.ticketSummary}</a>}</li>; })}</ul>}
        <nav className="pagination" aria-label="My Actions pagination"><button className="button button--tertiary" type="button" disabled={data.myActions.page <= 1} onClick={() => onNavigate(`/staff/dashboard?actionPage=${data.myActions.page - 1}#my-actions`)}>Previous</button><span aria-current="page">Page {data.myActions.page} of {data.myActions.totalPages}</span><button className="button button--tertiary" type="button" disabled={data.myActions.totalPages === 0 || data.myActions.page >= data.myActions.totalPages} onClick={() => onNavigate(`/staff/dashboard?actionPage=${data.myActions.page + 1}#my-actions`)}>Next</button></nav>
      </section>
    </>}
  </section>;
}
