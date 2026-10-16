import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  fetchMyTickets,
  fetchReferenceData,
  type Category,
  type RelatedSystem,
  type TicketListItem,
  type TicketListQuery,
  type TicketListResponse,
  type TicketListSortBy,
  type TicketListSortOrder,
  type TicketStatus,
} from "./api.ts";
import { EmptyState, ErrorState, LoadingState, Pagination, PriorityBadge, StatusBadge } from "./components/ui.tsx";
import { useRequesterContext } from "./requester.tsx";

const INITIAL_CONTROLS: ListControls = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  status: "",
  statusGroup: "",
  updatedSince: "",
  resolvedSince: "",
  before: "",
  sortBy: "updatedAt",
  sortOrder: "desc",
  page: 1,
  pageSize: 10,
};

interface ListControls {
  search: string;
  categoryId: string;
  relatedSystemId: string;
  requestedPriority: string;
  status: "" | TicketStatus;
  statusGroup: "" | "active" | "resolved";
  updatedSince: string;
  resolvedSince: string;
  before: string;
  sortBy: TicketListSortBy;
  sortOrder: TicketListSortOrder;
  page: number;
  pageSize: 10 | 20 | 50;
}

export interface MyTicketsProps {
  onNavigate?: (path: string, options?: { replace?: boolean }) => void;
  location?: string;
}

function formatTicketDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

const TICKET_STATUSES: TicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const REQUESTED_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

function parsePositiveId(value: string | null): string {
  if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) return "";
  return value;
}

function parseControls(location: string | undefined): ListControls {
  if (!location) return INITIAL_CONTROLS;
  const queryString = location.split("?")[1]?.split("#")[0] ?? "";
  const params = new URLSearchParams(queryString);
  const statusParam = params.get("status") ?? "";
  const status = TICKET_STATUSES.includes(statusParam as TicketStatus) ? statusParam as TicketStatus : "";
  let statusGroup = params.get("statusGroup") === "active" || params.get("statusGroup") === "resolved" ? params.get("statusGroup") as ListControls["statusGroup"] : "";
  const resolvedStatus = ["RESOLVED", "CLOSED"].includes(status);
  const activeStatus = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "REOPENED"].includes(status);
  if (statusGroup === "resolved" && status && !resolvedStatus) statusGroup = "";
  if (statusGroup === "active" && status && !activeStatus) statusGroup = "";
  const dates = validateDateFilters(
    statusGroup,
    validIsoDate(params.get("updatedSince")) ? params.get("updatedSince")! : "",
    validIsoDate(params.get("resolvedSince")) ? params.get("resolvedSince")! : "",
    params.get("before") ?? "",
  );
  let { updatedSince, resolvedSince, before } = dates;
  if (updatedSince && resolvedSince) {
    if (statusGroup === "resolved") updatedSince = "";
    else resolvedSince = "";
  }
  const size = Number(params.get("pageSize"));
  const page = Number(params.get("page"));
  return {
    ...INITIAL_CONTROLS,
    search: params.get("search") ?? "",
    categoryId: parsePositiveId(params.get("categoryId")),
    relatedSystemId: parsePositiveId(params.get("relatedSystemId")),
    requestedPriority: REQUESTED_PRIORITIES.includes(params.get("requestedPriority") as typeof REQUESTED_PRIORITIES[number]) ? params.get("requestedPriority")! : "",
    status,
    statusGroup,
    updatedSince,
    resolvedSince,
    before,
    sortBy: ["updatedAt", "createdAt", "ticketNumber", "requestedPriority"].includes(params.get("sortBy") ?? "") ? params.get("sortBy") as TicketListSortBy : INITIAL_CONTROLS.sortBy,
    sortOrder: params.get("sortOrder") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: size === 20 || size === 50 ? size : 10,
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

function validateDateFilters(statusGroup: ListControls["statusGroup"], updatedSince: string, resolvedSince: string, before: string) {
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

function controlsUrl(controls: ListControls): string {
  const params = new URLSearchParams();
  if (controls.search.trim()) params.set("search", controls.search.trim());
  if (controls.categoryId) params.set("categoryId", controls.categoryId);
  if (controls.relatedSystemId) params.set("relatedSystemId", controls.relatedSystemId);
  if (controls.requestedPriority) params.set("requestedPriority", controls.requestedPriority);
  if (controls.status) params.set("status", controls.status);
  if (controls.statusGroup) params.set("statusGroup", controls.statusGroup);
  const dates = validateDateFilters(controls.statusGroup, controls.updatedSince, controls.resolvedSince, controls.before);
  if (dates.updatedSince) params.set("updatedSince", dates.updatedSince);
  if (dates.resolvedSince) params.set("resolvedSince", dates.resolvedSince);
  if (dates.before) params.set("before", dates.before);
  if (controls.sortBy !== INITIAL_CONTROLS.sortBy) params.set("sortBy", controls.sortBy);
  if (controls.sortOrder !== INITIAL_CONTROLS.sortOrder) params.set("sortOrder", controls.sortOrder);
  if (controls.page !== 1) params.set("page", String(controls.page));
  if (controls.pageSize !== INITIAL_CONTROLS.pageSize) params.set("pageSize", String(controls.pageSize));
  const query = params.toString();
  return `/tickets${query ? `?${query}` : ""}`;
}

function toQuery(controls: ListControls): TicketListQuery {
  const dates = validateDateFilters(controls.statusGroup, controls.updatedSince, controls.resolvedSince, controls.before);
  return {
    search: controls.search.trim() || undefined,
    categoryId: parsePositiveId(controls.categoryId) ? Number(controls.categoryId) : undefined,
    relatedSystemId: parsePositiveId(controls.relatedSystemId) ? Number(controls.relatedSystemId) : undefined,
    requestedPriority: REQUESTED_PRIORITIES.includes(controls.requestedPriority as typeof REQUESTED_PRIORITIES[number])
      ? controls.requestedPriority as TicketListQuery["requestedPriority"]
      : undefined,
    status: controls.status || undefined,
    statusGroup: controls.statusGroup || undefined,
    updatedSince: dates.updatedSince || undefined,
    resolvedSince: dates.resolvedSince || undefined,
    before: dates.before || undefined,
    sortBy: controls.sortBy,
    sortOrder: controls.sortOrder,
    page: controls.page,
    pageSize: controls.pageSize,
  };
}

function statusLabel(status: TicketListItem["currentStatus"]): string {
  return status === "NEW" ? "New" : status;
}

export function MyTickets({ onNavigate, location }: MyTicketsProps = {}) {
  const requesterContext = useRequesterContext();
  const [controls, setControls] = useState<ListControls>(() => parseControls(location));
  const [listState, setListState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<TicketListResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState(() => parseControls(location).search);

  useEffect(() => {
    if (location === undefined) return;
    const next = parseControls(location);
    setControls(next);
    setDebouncedSearch(next.search);
    const canonical = controlsUrl(next);
    const current = location.split("#")[0] || "/tickets";
    if (current !== canonical) onNavigate?.(canonical, { replace: true });
  }, [location, onNavigate]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(controls.search), 250);
    return () => window.clearTimeout(timer);
  }, [controls.search]);

  const query = useMemo(() => toQuery({ ...controls, search: debouncedSearch }), [controls, debouncedSearch]);
  const activeDates = validateDateFilters(controls.statusGroup, controls.updatedSince, controls.resolvedSince, controls.before);
  const hasSearchOrFilter = Boolean(
    controls.search.trim() || controls.categoryId || controls.relatedSystemId || controls.requestedPriority || controls.status || controls.statusGroup || activeDates.updatedSince || activeDates.resolvedSince || activeDates.before,
  );

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    fetchReferenceData(controller.signal)
      .then((data) => {
        if (ignore) return;
        setCategories(data.categories);
        setRelatedSystems(data.relatedSystems);
      })
      .catch(() => {
        // The list remains usable when optional filter metadata is unavailable.
        if (!ignore) {
          setCategories([]);
          setRelatedSystems([]);
        }
      });
    return () => {
      ignore = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const requesterId = requesterContext.mode === "development" ? requesterContext.selectedRequesterId ?? undefined : undefined;
    if ((requesterContext.mode === "development" && requesterId === null) || requesterContext.status !== "success") return;

    const controller = new AbortController();
    let ignore = false;
    setListState("loading");
    fetchMyTickets(requesterId, query, controller.signal)
      .then((data) => {
        if (ignore) return;
        setResult(data);
        setListState("success");
      })
      .catch((reason: unknown) => {
        if (ignore || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setListState("error");
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [query, reloadToken, requesterContext.contextVersion, requesterContext.mode, requesterContext.selectedRequesterId, requesterContext.status]);

  function updateControl<K extends keyof ListControls>(field: K, value: ListControls[K]) {
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

  function clearFilters() {
    setControls(INITIAL_CONTROLS);
    onNavigate?.("/tickets");
  }

  function navigate(path: string, event: MouseEvent<HTMLAnchorElement>) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(path);
  }

  const requesterName = requesterContext.selectedRequester?.name ?? requesterContext.authenticatedRequester?.name ?? "This requester";
  const noTickets = result?.data.length === 0 && result.pagination.totalItems === 0 && !hasSearchOrFilter;

  return (
    <section className="card stack" aria-labelledby="my-tickets-title">
      <div>
        <p className="eyebrow">Requester workspace</p>
        <h1 id="my-tickets-title">My Tickets</h1>
        <p>Tickets owned by {requesterName} are shown from your current requester context.</p>
      </div>

      <form className="my-tickets__toolbar" onSubmit={(event) => event.preventDefault()}>
        <div className="my-tickets__toolbar-field my-tickets__toolbar-field--search">
          <label htmlFor="ticket-search">Search Tickets</label>
          <input
            id="ticket-search"
            value={controls.search}
            maxLength={100}
            onChange={(event) => updateControl("search", event.target.value)}
          />
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-filter-category">Category</label>
          <select
            id="ticket-filter-category"
            value={controls.categoryId}
            onChange={(event) => updateControl("categoryId", event.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-filter-system">Related System</label>
          <select
            id="ticket-filter-system"
            value={controls.relatedSystemId}
            onChange={(event) => updateControl("relatedSystemId", event.target.value)}
          >
            <option value="">All Related Systems</option>
            {relatedSystems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-filter-priority">Requested Priority</label>
          <select
            id="ticket-filter-priority"
            value={controls.requestedPriority}
            onChange={(event) => updateControl("requestedPriority", event.target.value)}
          >
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-filter-status">Current Status</label>
          <select
            id="ticket-filter-status"
            value={controls.status}
            onChange={(event) => updateControl("status", event.target.value as ListControls["status"])}
          >
            <option value="">All statuses</option>
            {TICKET_STATUSES.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-filter-status-group">Status group</label>
          <select id="ticket-filter-status-group" value={controls.statusGroup} onChange={(event) => updateControl("statusGroup", event.target.value as ListControls["statusGroup"])}>
            <option value="">Any group</option><option value="active">Active</option><option value="resolved">Resolved</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field"><label htmlFor="ticket-updated-since">Updated since (UTC ISO)</label><input id="ticket-updated-since" value={controls.updatedSince} onChange={(event) => updateControl("updatedSince", event.target.value)} placeholder="2026-10-09T00:00:00.000Z" /></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="ticket-resolved-since">Resolved since (UTC ISO)</label><input id="ticket-resolved-since" value={controls.resolvedSince} onChange={(event) => updateControl("resolvedSince", event.target.value)} placeholder="2026-10-09T00:00:00.000Z" /></div>
        <div className="my-tickets__toolbar-field"><label htmlFor="ticket-before">Before (UTC ISO)</label><input id="ticket-before" value={controls.before} onChange={(event) => updateControl("before", event.target.value)} placeholder="2026-10-16T00:00:00.000Z" /></div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-sort-field">Sort field</label>
          <select
            id="ticket-sort-field"
            value={controls.sortBy}
            onChange={(event) => updateControl("sortBy", event.target.value as TicketListSortBy)}
          >
            <option value="updatedAt">Last updated</option>
            <option value="createdAt">Created date</option>
            <option value="ticketNumber">Ticket number</option>
            <option value="requestedPriority">Requested priority</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-sort-order">Sort order</label>
          <select
            id="ticket-sort-order"
            value={controls.sortOrder}
            onChange={(event) => updateControl("sortOrder", event.target.value as TicketListSortOrder)}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="my-tickets__toolbar-field">
          <label htmlFor="ticket-page-size">Page size</label>
          <select
            id="ticket-page-size"
            value={controls.pageSize}
            onChange={(event) => updateControl("pageSize", Number(event.target.value) as 10 | 20 | 50)}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </div>
        <button type="button" className="button button--tertiary" onClick={clearFilters}>
          Clear filters
        </button>
      </form>

      {hasSearchOrFilter && <div className="dashboard-filter-summary" aria-label="Active filters"><strong>Active filters</strong>{controls.statusGroup && <button type="button" onClick={() => updateControl("statusGroup", "")}>Status group: {controls.statusGroup} ×</button>}{controls.status && <button type="button" onClick={() => updateControl("status", "")}>Status: {controls.status} ×</button>}{activeDates.updatedSince && <button type="button" onClick={() => updateControl("updatedSince", "")}>Updated since ×</button>}{activeDates.resolvedSince && <button type="button" onClick={() => updateControl("resolvedSince", "")}>Resolved since ×</button>}{activeDates.before && <button type="button" onClick={() => updateControl("before", "")}>Before ×</button>}<button type="button" className="button button--tertiary" onClick={clearFilters}>Reset filters</button></div>}

      {listState === "loading" && <LoadingState label="Loading My Tickets…" />}
      {listState === "error" && (
        <ErrorState onRetry={() => setReloadToken((token) => token + 1)}>
          Unable to load My Tickets. Your filters are preserved; try again.
        </ErrorState>
      )}

      {listState === "success" && result && noTickets && (
        <EmptyState
          action={(
            <a className="button button--primary" href="/create-ticket" onClick={(event) => navigate("/create-ticket", event)}>
              Create Ticket
            </a>
          )}
        >
          {requesterName} has no Tickets yet.
        </EmptyState>
      )}

      {listState === "success" && result && result.data.length === 0 && !noTickets && (
        <section className="state-card state-card--empty" aria-live="polite">
          <h2>No matching Tickets</h2>
          <p>No Tickets match the current search and filters.</p>
          <button type="button" className="button button--secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </section>
      )}

      {listState === "success" && result && result.data.length > 0 && (
        <>
          <div className="my-tickets__table-wrap">
            <table className="my-tickets__table">
              <caption className="visually-hidden">Tickets for {requesterName}</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket Number</th>
                  <th scope="col">Date</th>
                  <th scope="col">Summary</th>
                  <th scope="col">Category</th>
                  <th scope="col">Requested Priority</th>
                  <th scope="col">Current Status</th>
                  <th scope="col">Related System</th>
                  <th scope="col">Last Updated</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((ticketRow) => (
                  <tr key={ticketRow.id}>
                    <th scope="row" data-label="Ticket Number">{ticketRow.ticketNumber}</th>
                    <td data-label="Date">{formatTicketDate(ticketRow.ticketDate)}</td>
                    <td data-label="Summary">{ticketRow.summary}</td>
                    <td data-label="Category">{ticketRow.category.name}</td>
                    <td data-label="Requested Priority"><PriorityBadge label={ticketRow.requestedPriority} /></td>
                    <td data-label="Current Status"><StatusBadge label={statusLabel(ticketRow.currentStatus)} /></td>
                    <td data-label="Related System">{ticketRow.relatedSystem.name}</td>
                    <td data-label="Last Updated">{formatTicketDate(ticketRow.updatedAt)}</td>
                    <td data-label="Actions">
                      <a
                        className="button button--secondary"
                        href={`/tickets/${ticketRow.ticketNumber}`}
                        onClick={(event) => navigate(`/tickets/${ticketRow.ticketNumber}`, event)}
                      >
                        Open ticket
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.pagination.totalPages > 0 && (
            <Pagination
              currentPage={result.pagination.page}
              totalPages={result.pagination.totalPages}
              onPageChange={(page) => { const next = { ...controls, page }; setControls(next); onNavigate?.(controlsUrl(next)); }}
            />
          )}
        </>
      )}
    </section>
  );
}

export default MyTickets;
