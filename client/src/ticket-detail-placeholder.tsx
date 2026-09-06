export interface TicketDetailPlaceholderProps {
  onNavigate?: (path: string) => void;
  ticketNumber: string;
}

/**
 * Temporary handoff surface for the Create Ticket success link.
 *
 * Ticket retrieval, editing, comments, attachments, and status actions belong
 * to the dedicated Ticket Detail issue and are intentionally out of scope.
 */
export function TicketDetailPlaceholder({ onNavigate, ticketNumber }: TicketDetailPlaceholderProps) {
  return (
    <section className="card stack" aria-labelledby="ticket-detail-placeholder-title">
      <p className="eyebrow">Ticket Detail</p>
      <h1 id="ticket-detail-placeholder-title">Ticket {ticketNumber}</h1>
      <p>
        This read-only detail view is a placeholder until the Lab 2 Ticket Detail issue is delivered.
      </p>
      <div className="form-actions">
        <a
          className="button button--secondary"
          href="/tickets"
          onClick={(event) => {
            if (onNavigate) {
              event.preventDefault();
              onNavigate("/tickets");
            }
          }}
        >
          Back to My Tickets
        </a>
      </div>
    </section>
  );
}

export default TicketDetailPlaceholder;
