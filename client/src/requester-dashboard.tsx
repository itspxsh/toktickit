import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchRequesterDashboard, type DashboardMetric, type DashboardTicketSummary, type RequesterDashboardView } from "./api.ts";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "./components/ui.tsx";
import { Forbidden } from "./auth.tsx";

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

function safeRequesterPath(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    if (/^\/tickets\/TKT-\d{4}-\d{6}$/.test(url.pathname)) {
      return url.search === "" && url.hash === "" ? url.pathname : null;
    }
    if (url.pathname !== "/tickets" || url.hash !== "" || !hasUniqueQueryKeys(url)) return null;
    const keys = [...url.searchParams.keys()].sort().join(",");
    const statusGroup = url.searchParams.get("statusGroup");
    const status = url.searchParams.get("status");
    const statuses = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
    if (keys === "statusGroup" && statusGroup === "active") return value;
    if (keys === "status" && status && statuses.includes(status)) return value;
    if (keys === "before" && validRequesterDateWindow(null, url.searchParams.get("before"))) return value;
    if (keys === "before,updatedSince" && validRequesterDateWindow(url.searchParams.get("updatedSince"), url.searchParams.get("before"))) return value;
    if (keys === "before,resolvedSince,statusGroup" && statusGroup === "resolved" && validRequesterDateWindow(url.searchParams.get("resolvedSince"), url.searchParams.get("before"))) return value;
    return null;
  } catch { return null; }
}

function hasUniqueQueryKeys(url: URL): boolean {
  const keys = [...url.searchParams.keys()];
  return new Set(keys).size === keys.length;
}

function validIsoDate(value: string | null): boolean {
  if (!value) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = ""] = match;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;
  const expected = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)];
  const actual = [date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()];
  return actual.every((component, index) => component === expected[index]) && date.getUTCMilliseconds() === Number(fraction.padEnd(3, "0") || "0");
}

function validRequesterDateWindow(lower: string | null, upper: string | null): boolean {
  if (upper === null || !validIsoDate(upper)) return false;
  if (Date.parse(upper) > Date.now() + 60_000) return false;
  if (lower === null) return true;
  if (!validIsoDate(lower)) return false;
  return Date.parse(lower) < Date.parse(upper);
}

function MetricCard({ label, metric, onNavigate }: { label: string; metric: DashboardMetric; onNavigate: (path: string) => void }) {
  const href = safeRequesterPath(metric.drillDown);
  return <article className="dashboard-metric card">
    <h2>{label}</h2>
    {href ? <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }} aria-label={`${label}: ${metric.value}`}>{metric.value}</a> : <p>{metric.value}</p>}
  </article>;
}

function TicketRows({ tickets, empty, onNavigate }: { tickets: DashboardTicketSummary[]; empty: string; onNavigate: (path: string) => void }) {
  if (tickets.length === 0) return <EmptyState>{empty}</EmptyState>;
  return <ul className="dashboard-ticket-list">{tickets.map((ticket) => {
    const href = safeRequesterPath(ticket.href);
    return <li key={ticket.ticketNumber}>
      <div><strong>{ticket.ticketNumber}</strong><p>{ticket.summary}</p></div>
      <StatusBadge label={ticket.currentStatus.replaceAll("_", " ")} />
      <span>{ticket.itPriority ? `Priority: ${ticket.itPriority}` : "No IT priority"}</span>
      <span>Updated {formatTime(ticket.updatedAt)}</span>
      {href && <a href={href} onClick={(event) => { event.preventDefault(); onNavigate(href); }}>Open ticket</a>}
    </li>;
  })}</ul>;
}

export function RequesterDashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [data, setData] = useState<RequesterDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { setData(await fetchRequesterDashboard(signal)); }
    catch (reason) { if (!signal?.aborted) setError(reason); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const errorMessage = error instanceof Error ? error.message : "Unable to load your dashboard.";

  return <section className="dashboard-page stack" aria-labelledby="requester-dashboard-title">
    <header className="dashboard-heading"><div><p className="eyebrow">Requester workspace</p><h1 id="requester-dashboard-title">My Dashboard</h1></div>
      <button className="button button--secondary" type="button" onClick={() => void load()}>Refresh</button></header>
    {loading && <LoadingState label="Loading your dashboard…" />}
    {error !== null ? (error instanceof ApiError && error.status === 403 ? <Forbidden /> : <ErrorState onRetry={() => void load()}>{errorMessage}</ErrorState>) : null}
    {data && !loading && !error && <>
      <p className="dashboard-asof">Last updated {formatTime(data.asOf)} · Times: {data.displayTimeZone} (UTC+7)</p>
      <div className="dashboard-metrics">
        <MetricCard label="Active tickets" metric={data.metrics.activeTickets} onNavigate={onNavigate} />
        <MetricCard label="Waiting for you" metric={data.metrics.waitingForRequester} onNavigate={onNavigate} />
        <MetricCard label="Updated in the last 7 days" metric={data.metrics.updatedLast7Days} onNavigate={onNavigate} />
        <MetricCard label="Resolved in the last 7 days" metric={data.metrics.resolvedLast7Days} onNavigate={onNavigate} />
      </div>
      <section className="card stack"><header className="dashboard-section-heading"><h2>Waiting for you</h2><a href="/tickets" onClick={(event) => { event.preventDefault(); onNavigate("/tickets"); }}>My Tickets</a></header>
        <TicketRows tickets={data.attentionTickets} empty="No tickets are waiting for your response." onNavigate={onNavigate} />
      </section>
      <section className="card stack"><h2>Recent updates</h2><TicketRows tickets={data.recentTickets} empty="No recent ticket updates." onNavigate={onNavigate} /></section>
    </>}
  </section>;
}
