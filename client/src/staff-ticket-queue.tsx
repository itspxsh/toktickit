import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  fetchStaffTickets,
  type StaffQueueAssignment,
  type StaffQueueItem,
  type StaffQueuePriority,
  type StaffQueueQuery,
  type StaffQueueResponse,
  type StaffQueueSort,
  type StaffQueueStatus,
} from "./api.ts";
import { EmptyState, ErrorState, LoadingState, PriorityBadge, StatusBadge } from "./components/ui.tsx";

const STATUSES: StaffQueueStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const PRIORITIES: StaffQueuePriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

interface QueueControls {
  q: string;
  status: "" | StaffQueueStatus;
  statusGroup: "" | "active" | "resolved";
  updatedSince: string;
  resolvedSince: string;
  before: string;
  itPriority: "" | StaffQueuePriority | "UNPRIORITIZED";
  assignment: "" | StaffQueueAssignment;
  sort: StaffQueueSort;
  page: number;
  pageSize: number;
}

const INITIAL_CONTROLS: QueueControls = {
  q: "",
  status: "",
  statusGroup: "",
  updatedSince: "",
  resolvedSince: "",
  before: "",
  itPriority: "",
  assignment: "",
  sort: "updatedAtDesc",
  page: 1,
  pageSize: 20,
};

export interface StaffTicketQueueProps {
  onOpenTicket?: (ticketNumber: string) => void;
  onNavigate?: (path: string, options?: { replace?: boolean }) => void;
  location?: string;
}

function displayStatus(status: StaffQueueStatus): string {
  return status.replaceAll("_", " ");
}

function displayDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function badgeTone(value: string | null): "success" | "warning" | "error" | "neutral" {
  if (value === "URGENT" || value === "CANCELLED") return "error";
  if (value === "HIGH" || value === "WAITING_FOR_REQUESTER") return "warning";
  if (value === "RESOLVED" || value === "CLOSED") return "success";
  return "neutral";
}

function toQuery(controls: QueueControls): StaffQueueQuery {
  const dates = validateDateFilters(controls.statusGroup, controls.updatedSince, controls.resolvedSince, controls.before);
  return {
    q: controls.q.trim() || undefined,
    status: controls.status || undefined,
    statusGroup: controls.statusGroup || undefined,
    updatedSince: dates.updatedSince || undefined,
    resolvedSince: dates.resolvedSince || undefined,
    before: dates.before || undefined,
    itPriority: controls.itPriority || undefined,
    assignment: controls.assignment || undefined,
    sort: controls.sort,
    page: controls.page,
    pageSize: controls.pageSize,
  };
}

function parseControls(location: string | undefined): QueueControls {
  if (!location) return INITIAL_CONTROLS;
  const params = new URLSearchParams(location.split("?")[1]?.split("#")[0] ?? "");
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const status = params.get("status") ?? "";
  const priority = params.get("itPriority") ?? "";
  let group = params.get("statusGroup") === "active" || params.get("statusGroup") === "resolved" ? params.get("statusGroup") as QueueControls["statusGroup"] : "";
  let updatedSince = validIsoDate(params.get("updatedSince")) ? params.get("updatedSince")! : "";
  let resolvedSince = validIsoDate(params.get("resolvedSince")) ? params.get("resolvedSince")! : "";
  let before = params.get("before") ?? "";
  const validStatus = STATUSES.includes(status as StaffQueueStatus) ? status as StaffQueueStatus : "";
  const resolvedStatus = ["RESOLVED", "CLOSED"].includes(validStatus);
  const activeStatus = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(validStatus);
  if (group === "resolved" && validStatus && !resolvedStatus) group = "";
  if (group === "active" && validStatus && !activeStatus) group = "";
  if (group !== "resolved") resolvedSince = "";
  if (updatedSince && resolvedSince) {
    if (group === "resolved") updatedSince = "";
    else resolvedSince = "";
  }
  ({ updatedSince, resolvedSince, before } = validateDateFilters(group, updatedSince, resolvedSince, before));
  return {
    ...INITIAL_CONTROLS,
    q: params.get("q") ?? "",
    status: validStatus,
    statusGroup: group,
    updatedSince,
    resolvedSince,
    before,
    itPriority: [...PRIORITIES, "UNPRIORITIZED"].includes(priority as StaffQueuePriority | "UNPRIORITIZED") ? priority as QueueControls["itPriority"] : "",
    assignment: ["unassigned", "mine", "assigned"].includes(params.get("assignment") ?? "") ? params.get("assignment") as QueueControls["assignment"] : "",
    sort: ["updatedAtDesc", "priorityDesc", "statusAsc"].includes(params.get("sort") ?? "") ? params.get("sort") as StaffQueueSort : INITIAL_CONTROLS.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: pageSize === 50 || pageSize === 100 ? pageSize : 20,
  };
}

function validIsoDate(value: string | null): value is string {
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

function validateDateFilters(statusGroup: QueueControls["statusGroup"], updatedSince: string, resolvedSince: string, before: string) {
  const validBefore = validIsoDate(before) && Date.parse(before) <= Date.now() + 60_000 ? before : "";
  let validUpdatedSince = validIsoDate(updatedSince) ? updatedSince : "";
  let validResolvedSince = statusGroup === "resolved" && validIsoDate(resolvedSince) ? resolvedSince : "";
  if (validUpdatedSince && validResolvedSince) {
    if (statusGroup === "resolved") validUpdatedSince = "";
    else validResolvedSince = "";
  }
  const lower = validResolvedSince || validUpdatedSince;
  if (lower && (!validBefore || Date.parse(lower) >= Date.parse(validBefore))) {
    validUpdatedSince = "";
    validResolvedSince = "";
  }
  return { updatedSince: validUpdatedSince, resolvedSince: validResolvedSince, before: validBefore };
}

function visiblePageNumbers(currentPage: number, totalPages: number): number[] {
  const pageCount = Math.min(totalPages, 5);
  const firstPage = Math.max(1, Math.min(currentPage - 2, totalPages - pageCount + 1));
  return Array.from({ length: pageCount }, (_, index) => firstPage + index);
}

function controlsUrl(controls: QueueControls): string {
  const params = new URLSearchParams();
  if (controls.q.trim()) params.set("q", controls.q.trim());
  if (controls.status) params.set("status", controls.status);
  if (controls.statusGroup) params.set("statusGroup", controls.statusGroup);
  const dates = validateDateFilters(controls.statusGroup, controls.updatedSince, controls.resolvedSince, controls.before);
  if (dates.updatedSince) params.set("updatedSince", dates.updatedSince);
  if (dates.resolvedSince) params.set("resolvedSince", dates.resolvedSince);
  if (dates.before) params.set("before", dates.before);
  if (controls.itPriority) params.set("itPriority", controls.itPriority);
  if (controls.assignment) params.set("assignment", controls.assignment);
  if (controls.sort !== INITIAL_CONTROLS.sort) params.set("sort", controls.sort);
  if (controls.page !== 1) params.set("page", String(controls.page));
  if (controls.pageSize !== INITIAL_CONTROLS.pageSize) params.set("pageSize", String(controls.pageSize));
  const query = params.toString();
  return `/staff/tickets${query ? `?${query}` : ""}`;
}

export function StaffTicketQueue({ onOpenTicket, onNavigate, location }: StaffTicketQueueProps = {}) {
  const [controls, setControls] = useState<QueueControls>(() => parseControls(location));
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<StaffQueueResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const query = useMemo(() => toQuery(controls), [controls]);

  useEffect(() => {
    if (location === undefined) return;
    const next = parseControls(location);
    setControls(next);
    const canonical = controlsUrl(next);
    const current = location.split("#")[0] || "/staff/tickets";
    if (current !== canonical) onNavigate?.(canonical, { replace: true });
  }, [location, onNavigate]);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    setState("loading");
    const timer = window.setTimeout(() => {
      fetchStaffTickets(query, controller.signal)
        .then((data) => {
          if (ignore) return;
          setResult(data);
          setState("success");
        })
        .catch((error: unknown) => {
          if (ignore || (error instanceof DOMException && error.name === "AbortError")) return;
          setState("error");
        });
    }, query.q ? 250 : 0);
    return () => {
      ignore = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, reloadToken]);

  function update<K extends keyof QueueControls>(field: K, value: QueueControls[K]) {
    const next = { ...controls, [field]: value, page: 1 };
    if (field === "status" && value) {
      if (next.statusGroup === "resolved" && !["RESOLVED", "CLOSED"].includes(value as string)) { next.statusGroup = ""; next.resolvedSince = ""; }
      if (next.statusGroup === "active" && !["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(value as string)) next.statusGroup = "";
    }
    if (field === "statusGroup" && value === "resolved" && next.status && !["RESOLVED", "CLOSED"].includes(next.status)) next.status = "";
    if (field === "statusGroup" && value === "active" && next.status && !["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(next.status)) next.status = "";
    if (field === "statusGroup" && value !== "resolved") next.resolvedSince = "";
    if (field === "resolvedSince" && value) { next.statusGroup = "resolved"; next.updatedSince = ""; if (next.status && !["RESOLVED", "CLOSED"].includes(next.status)) next.status = ""; }
    if (field === "updatedSince" && value) next.resolvedSince = "";
    setControls(next);
    onNavigate?.(controlsUrl(next));
  }

  function reset() {
    setControls(INITIAL_CONTROLS);
    onNavigate?.("/staff/tickets");
  }

  function openTicket(ticketNumber: string, event: MouseEvent<HTMLAnchorElement>) {
    if (!onOpenTicket) return;
    event.preventDefault();
    onOpenTicket(ticketNumber);
  }

  const items = result?.items ?? [];
  const totalPages = result?.totalPages ?? 0;
  const activeDates = validateDateFilters(controls.statusGroup, controls.updatedSince, controls.resolvedSince, controls.before);
  const hasActiveFilter = Boolean(controls.status || controls.statusGroup || activeDates.updatedSince || activeDates.resolvedSince || activeDates.before || controls.itPriority);
  return (
    <section className="card stack" aria-labelledby="staff-queue-title">
      <div>
        <p className="eyebrow">IT Staff workspace</p>
        <h1 id="staff-queue-title">Staff Ticket Queue</h1>
        <p>Search and triage tickets using the server-authorized staff view.</p>
      </div>

      <form className="my-tickets__toolbar" onSubmit={(event) => event.preventDefault()}>
        <div className="my-tickets__toolbar-field my-tickets__toolbar-field--search">
          <label htmlFor="staff-queue-search">Search tickets</label>
          <input id="staff-queue-search" value={controls.q} maxLength={100} onChange={(event) => update("q", event.target.value)} />
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="staff-queue-status">Status</label>
          <select id="staff-queue-status" value={controls.status} onChange={(event) => update("status", event.target.value as QueueControls["status"])}>
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{displayStatus(status)}</option>)}
          </select>
        </div>
        <div className="my-tickets__toolbar-field"><label htmlFor="staff-queue-status-group">Status group</label><select id="staff-queue-status-group" value={controls.statusGroup} onChange={(event) => update("statusGroup", event.target.value as QueueControls["statusGroup"])}><option value="">Any group</option><option value="active">Active</option><option value="resolved">Resolved</option></select></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="staff-queue-updated-since">Updated since (UTC ISO)</label><input id="staff-queue-updated-since" value={controls.updatedSince} onChange={(event) => update("updatedSince", event.target.value)} placeholder="2026-10-09T00:00:00.000Z" /></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="staff-queue-resolved-since">Resolved since (UTC ISO)</label><input id="staff-queue-resolved-since" value={controls.resolvedSince} onChange={(event) => update("resolvedSince", event.target.value)} placeholder="2026-10-09T00:00:00.000Z" /></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="staff-queue-before">Before (UTC ISO)</label><input id="staff-queue-before" value={controls.before} onChange={(event) => update("before", event.target.value)} placeholder="2026-10-16T00:00:00.000Z" /></div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="staff-queue-priority">IT Priority</label>
          <select id="staff-queue-priority" value={controls.itPriority} onChange={(event) => update("itPriority", event.target.value as QueueControls["itPriority"])}>
            <option value="">All priorities</option>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
            <option value="UNPRIORITIZED">Not prioritized</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="staff-queue-assignment">Assignment</label>
          <select id="staff-queue-assignment" value={controls.assignment} onChange={(event) => update("assignment", event.target.value as QueueControls["assignment"])}>
            <option value="">All assignments</option>
            <option value="unassigned">Unassigned</option>
            <option value="mine">Mine</option>
            <option value="assigned">Assigned</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="staff-queue-sort">Sort</label>
          <select id="staff-queue-sort" value={controls.sort} onChange={(event) => update("sort", event.target.value as StaffQueueSort)}>
            <option value="updatedAtDesc">Newest updated</option>
            <option value="priorityDesc">Priority</option>
            <option value="statusAsc">Status</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="staff-queue-page-size">Page size</label>
          <select id="staff-queue-page-size" value={controls.pageSize} onChange={(event) => update("pageSize", Number(event.target.value))}>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
        <button type="button" className="button button--tertiary" onClick={reset}>Reset</button>
      </form>

      {hasActiveFilter && <div className="dashboard-filter-summary" aria-label="Active filters"><strong>Active filters</strong>{controls.statusGroup && <button type="button" onClick={() => update("statusGroup", "")}>Status group: {controls.statusGroup} ×</button>}{controls.status && <button type="button" onClick={() => update("status", "")}>Status: {controls.status} ×</button>}{controls.itPriority && <button type="button" onClick={() => update("itPriority", "")}>IT priority: {controls.itPriority} ×</button>}{activeDates.updatedSince && <button type="button" onClick={() => update("updatedSince", "")}>Updated since ×</button>}{activeDates.resolvedSince && <button type="button" onClick={() => update("resolvedSince", "")}>Resolved since ×</button>}{activeDates.before && <button type="button" onClick={() => update("before", "")}>Before ×</button>}<button type="button" className="button button--tertiary" onClick={reset}>Clear filters</button></div>}

      {state === "loading" && <LoadingState label="Loading staff queue…" />}
      {state === "error" && <ErrorState onRetry={() => setReloadToken((value) => value + 1)}>Unable to load staff queue.</ErrorState>}
      {state === "success" && items.length === 0 && (
        <EmptyState>
          No tickets match the current search and filters.
        </EmptyState>
      )}
      {state === "success" && items.length > 0 && (
        <>
          <div className="my-tickets__table-wrap" role="region" aria-label="Staff ticket results" tabIndex={0}>
            <table className="my-tickets__table">
              <thead><tr><th scope="col">Ticket</th><th scope="col">Summary</th><th scope="col">Requester</th><th scope="col">IT Priority</th><th scope="col">Status</th><th scope="col">Assignment</th><th scope="col">Updated</th></tr></thead>
              <tbody>
                {items.map((item: StaffQueueItem) => (
                  <tr key={item.ticketNumber}>
                    <td data-label="Ticket"><a href={`/staff/tickets/${encodeURIComponent(item.ticketNumber)}`} onClick={(event) => openTicket(item.ticketNumber, event)}>{item.ticketNumber}</a></td>
                    <td data-label="Summary">{item.summary}</td>
                    <td data-label="Requester">{item.requester.name}</td>
                    <td data-label="IT Priority"><PriorityBadge label={item.itPriority ?? "Not set"} tone={badgeTone(item.itPriority)} /></td>
                    <td data-label="Status"><StatusBadge label={displayStatus(item.currentStatus)} tone={badgeTone(item.currentStatus)} /></td>
                    <td data-label="Assignment">{item.assignedStaff?.name ?? "Unassigned"}</td>
                    <td data-label="Updated">{displayDate(item.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pagination" aria-label="Staff queue pagination">
            <button type="button" className="button button--tertiary" disabled={controls.page <= 1} onClick={() => { const next = { ...controls, page: controls.page - 1 }; setControls(next); onNavigate?.(controlsUrl(next)); }}>Previous</button>
            {visiblePageNumbers(controls.page, totalPages).map((page) => (
              <button key={page} type="button" className="button button--tertiary" aria-current={controls.page === page ? "page" : undefined} aria-label={`Page ${page}`} onClick={() => { const next = { ...controls, page }; setControls(next); onNavigate?.(controlsUrl(next)); }}>{page}</button>
            ))}
            <button type="button" className="button button--tertiary" disabled={controls.page >= totalPages} onClick={() => { const next = { ...controls, page: controls.page + 1 }; setControls(next); onNavigate?.(controlsUrl(next)); }}>Next</button>
          </nav>
        </>
      )}
    </section>
  );
}

export default StaffTicketQueue;
