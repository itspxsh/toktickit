import { useEffect, useState, type MouseEvent } from "react";
import {
  ApiError,
  fetchTicketDetail,
  type TicketDetailView,
} from "./api.ts";
import {
  ErrorState,
  FormField,
  LoadingState,
  PriorityBadge,
  StatusBadge,
} from "./components/ui.tsx";
import { useRequesterContext } from "./requester.tsx";

export interface RequesterTicketDetailProps {
  onNavigate?: (path: string) => void;
  ticketNumber: string;
}

type DetailState = "loading" | "success" | "not-found" | "error";

function displayPriority(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function displayStatus(value: string): string {
  return value === "NEW" ? "New" : value;
}

function formatAttachmentStatus(status: string): string {
  return status === "REMOVED" ? "Removed" : "Active";
}

/** Read-only requester Ticket Detail; attachment mutations belong to L2-08. */
export function RequesterTicketDetail({ onNavigate, ticketNumber }: RequesterTicketDetailProps) {
  const requesterContext = useRequesterContext();
  const [state, setState] = useState<DetailState>("loading");
  const [ticket, setTicket] = useState<TicketDetailView | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const requesterId = requesterContext.selectedRequesterId;
    if (requesterId === null) {
      setState("error");
      setErrorMessage("Select a Development Requester before viewing a Ticket.");
      return;
    }

    const controller = new AbortController();
    let ignore = false;
    setState("loading");
    setTicket(null);
    setErrorMessage("");

    fetchTicketDetail(ticketNumber, requesterId, controller.signal)
      .then((value) => {
        if (ignore) return;
        setTicket(value);
        setState("success");
      })
      .catch((reason: unknown) => {
        if (ignore || (reason instanceof DOMException && reason.name === "AbortError")) return;
        if (reason instanceof ApiError && reason.status === 404) {
          setState("not-found");
          setErrorMessage("Ticket was not found.");
          return;
        }
        setState("error");
        setErrorMessage(reason instanceof Error ? reason.message : "Unable to load Ticket.");
      });

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [reloadToken, requesterContext.selectedRequesterId, ticketNumber]);

  function handleBack(event: MouseEvent<HTMLAnchorElement>) {
    if (!onNavigate) return;
    event.preventDefault();
    onNavigate("/tickets");
  }

  if (state === "loading") {
    return (
      <section className="card stack" aria-labelledby="ticket-detail-title">
        <p className="eyebrow">Ticket Detail</p>
        <h1 id="ticket-detail-title">Ticket Detail</h1>
        <LoadingState label="Loading Ticket Detail…" />
      </section>
    );
  }

  if (state === "not-found") {
    return (
      <section className="card stack" aria-labelledby="ticket-detail-title">
        <p className="eyebrow">Ticket Detail</p>
        <h1 id="ticket-detail-title">Ticket not found</h1>
        <ErrorState>{errorMessage}</ErrorState>
        <div className="form-actions">
          <a className="button button--secondary" href="/tickets" onClick={handleBack}>
            Back to My Tickets
          </a>
        </div>
      </section>
    );
  }

  if (state === "error" || !ticket) {
    return (
      <section className="card stack" aria-labelledby="ticket-detail-title">
        <p className="eyebrow">Ticket Detail</p>
        <h1 id="ticket-detail-title">Unable to load Ticket</h1>
        <ErrorState onRetry={() => setReloadToken((token) => token + 1)}>
          {errorMessage || "Unable to load Ticket."}
        </ErrorState>
        <div className="form-actions">
          <a className="button button--secondary" href="/tickets" onClick={handleBack}>
            Back to My Tickets
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="card stack" aria-labelledby="ticket-detail-title">
      <div className="ticket-detail__header">
        <div>
          <p className="eyebrow">Requester Ticket Detail</p>
          <h1 id="ticket-detail-title">Ticket {ticket.ticketNumber}</h1>
          <p>Read-only details for the selected Development Requester.</p>
        </div>
        <a className="button button--secondary" href="/tickets" onClick={handleBack}>
          Back to My Tickets
        </a>
      </div>

      <fieldset className="ticket-detail__group">
        <legend>Ticket information</legend>
        <div className="ticket-detail__grid">
          <FormField id="detail-ticket-number" label="Ticket Number">
            <input id="detail-ticket-number" value={ticket.ticketNumber} readOnly aria-readonly="true" />
          </FormField>
          <FormField id="detail-ticket-date" label="Ticket Date">
            <input id="detail-ticket-date" value={ticket.ticketDate} readOnly aria-readonly="true" />
          </FormField>
          <FormField id="detail-ticket-requester" label="Requester">
            <input id="detail-ticket-requester" value={ticket.requester.name} readOnly aria-readonly="true" />
          </FormField>
          <FormField id="detail-ticket-category" label="Category">
            <input id="detail-ticket-category" value={ticket.category.name} readOnly aria-readonly="true" />
          </FormField>
          <FormField id="detail-ticket-system" label="Related System">
            <input id="detail-ticket-system" value={ticket.relatedSystem.name} readOnly aria-readonly="true" />
          </FormField>
          <div className="ticket-detail__badge-field">
            <span className="ticket-detail__label">Requested Priority</span>
            <PriorityBadge label={displayPriority(ticket.requestedPriority)} />
          </div>
          <p className="ticket-detail__value-field">IT Priority: {ticket.itPriority ?? "Not assigned"}</p>
          <div className="ticket-detail__badge-field">
            <span className="ticket-detail__label">Current Status</span>
            <StatusBadge label={displayStatus(ticket.currentStatus)} />
          </div>
          <FormField id="detail-ticket-updated" label="Last Updated">
            <input id="detail-ticket-updated" value={ticket.updatedAt} readOnly aria-readonly="true" />
          </FormField>
        </div>
        <FormField id="detail-ticket-summary" label="Summary">
          <input id="detail-ticket-summary" value={ticket.summary} readOnly aria-readonly="true" />
        </FormField>
        <FormField id="detail-ticket-description" label="Description">
          <textarea id="detail-ticket-description" value={ticket.description} readOnly aria-readonly="true" />
        </FormField>
      </fieldset>

      <section className="ticket-detail__attachments" aria-labelledby="ticket-attachments-title">
        <div>
          <p className="eyebrow">Attachment metadata</p>
          <h2 id="ticket-attachments-title">Attachments</h2>
          <p>Upload, download, preview, and removal actions are delivered in the next Lab 2 issue.</p>
        </div>
        {ticket.attachments.length === 0 ? (
          <p>No attachments.</p>
        ) : (
          <ul className="attachment-list" aria-label="Attachments">
            {ticket.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className={attachment.status === "REMOVED" ? "attachment-list__item--removed" : undefined}
              >
                <div className="ticket-detail__attachment-main">
                  <strong>{attachment.originalName} — {formatAttachmentStatus(attachment.status)}</strong>
                  <span>{attachment.mimeType} · {attachment.sizeBytes} bytes</span>
                  {attachment.status === "REMOVED" && (
                    <span>
                      Reason: {attachment.removalReason ?? "Not provided"}; removed {attachment.removedAt ?? "time unavailable"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

export default RequesterTicketDetail;
