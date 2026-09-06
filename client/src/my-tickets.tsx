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
} from "./api.ts";
import { EmptyState, ErrorState, LoadingState, Pagination, PriorityBadge, StatusBadge } from "./components/ui.tsx";
import { useRequesterContext } from "./requester.tsx";

const INITIAL_CONTROLS: ListControls = {
  search: "",
  categoryId: "",
  relatedSystemId: "",
  requestedPriority: "",
  status: "NEW",
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
  status: "NEW";
  sortBy: TicketListSortBy;
  sortOrder: TicketListSortOrder;
  page: number;
  pageSize: 10 | 20 | 50;
}

export interface MyTicketsProps {
  onNavigate?: (path: string) => void;
}

function formatTicketDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function toQuery(controls: ListControls): TicketListQuery {
  return {
    search: controls.search.trim() || undefined,
    categoryId: controls.categoryId ? Number(controls.categoryId) : undefined,
    relatedSystemId: controls.relatedSystemId ? Number(controls.relatedSystemId) : undefined,
    requestedPriority: controls.requestedPriority
      ? controls.requestedPriority as TicketListQuery["requestedPriority"]
      : undefined,
    status: controls.status,
    sortBy: controls.sortBy,
    sortOrder: controls.sortOrder,
    page: controls.page,
    pageSize: controls.pageSize,
  };
}

function statusLabel(status: TicketListItem["currentStatus"]): string {
  return status === "NEW" ? "New" : status;
}

export function MyTickets({ onNavigate }: MyTicketsProps = {}) {
  const requesterContext = useRequesterContext();
  const [controls, setControls] = useState<ListControls>(INITIAL_CONTROLS);
  const [listState, setListState] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<TicketListResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [relatedSystems, setRelatedSystems] = useState<RelatedSystem[]>([]);

  const query = useMemo(() => toQuery(controls), [controls]);
  const hasSearchOrFilter = Boolean(
    controls.search.trim() || controls.categoryId || controls.relatedSystemId || controls.requestedPriority,
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
    const requesterId = requesterContext.selectedRequesterId;
    if (requesterId === null || requesterContext.status !== "success") return;

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
  }, [query, reloadToken, requesterContext.contextVersion, requesterContext.selectedRequesterId, requesterContext.status]);

  function updateControl<K extends keyof ListControls>(field: K, value: ListControls[K]) {
    setControls((current) => ({ ...current, [field]: value, page: 1 }));
  }

  function clearFilters() {
    setControls(INITIAL_CONTROLS);
  }

  function navigate(path: string, event: MouseEvent<HTMLAnchorElement>) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate(path);
  }

  const requesterName = requesterContext.selectedRequester?.name ?? "This requester";
  const noTickets = result?.data.length === 0 && result.pagination.totalItems === 0 && !hasSearchOrFilter;

  return (
    <section className="card stack" aria-labelledby="my-tickets-title">
      <div>
        <p className="eyebrow">Requester workspace</p>
        <h1 id="my-tickets-title">My Tickets</h1>
        <p>Tickets created by {requesterName} are shown using the current testing context.</p>
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
            onChange={(event) => updateControl("status", event.target.value as "NEW")}
          >
            <option value="NEW">New</option>
          </select>
        </div>
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
              onPageChange={(page) => setControls((current) => ({ ...current, page }))}
            />
          )}
        </>
      )}
    </section>
  );
}

export default MyTickets;
