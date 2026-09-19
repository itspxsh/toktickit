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
  itPriority: "" | StaffQueuePriority;
  assignment: "" | StaffQueueAssignment;
  sort: StaffQueueSort;
  page: number;
  pageSize: number;
}

const INITIAL_CONTROLS: QueueControls = {
  q: "",
  status: "",
  itPriority: "",
  assignment: "",
  sort: "updatedAtDesc",
  page: 1,
  pageSize: 20,
};

export interface StaffTicketQueueProps {
  onOpenTicket?: (ticketNumber: string) => void;
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
  return {
    q: controls.q.trim() || undefined,
    status: controls.status || undefined,
    itPriority: controls.itPriority || undefined,
    assignment: controls.assignment || undefined,
    sort: controls.sort,
    page: controls.page,
    pageSize: controls.pageSize,
  };
}

export function StaffTicketQueue({ onOpenTicket }: StaffTicketQueueProps = {}) {
  const [controls, setControls] = useState<QueueControls>(INITIAL_CONTROLS);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<StaffQueueResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const query = useMemo(() => toQuery(controls), [controls]);

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
    setControls((current) => ({ ...current, [field]: value, page: 1 }));
  }

  function reset() {
    setControls(INITIAL_CONTROLS);
  }

  function openTicket(ticketNumber: string, event: MouseEvent<HTMLAnchorElement>) {
    if (!onOpenTicket) return;
    event.preventDefault();
    onOpenTicket(ticketNumber);
  }

  const items = result?.items ?? [];
  const totalPages = result?.totalPages ?? 0;
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
        <div className="my-tickets__toolbar-field">
          <label htmlFor="staff-queue-priority">IT Priority</label>
          <select id="staff-queue-priority" value={controls.itPriority} onChange={(event) => update("itPriority", event.target.value as QueueControls["itPriority"])}>
            <option value="">All priorities</option>
            {PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
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
            <button type="button" className="button button--tertiary" disabled={controls.page <= 1} onClick={() => setControls((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1).map((page) => (
              <button key={page} type="button" className="button button--tertiary" aria-current={controls.page === page ? "page" : undefined} aria-label={`Page ${page}`} onClick={() => setControls((current) => ({ ...current, page }))}>{page}</button>
            ))}
            <button type="button" className="button button--tertiary" disabled={controls.page >= totalPages} onClick={() => setControls((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
          </nav>
        </>
      )}
    </section>
  );
}

export default StaffTicketQueue;
