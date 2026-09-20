import { useEffect, useState } from "react";
import {
  addInternalNote,
  addStaffPublicComment,
  assignStaffTicket,
  claimStaffTicket,
  fetchStaffTicketDetail,
  updateStaffPriority,
  updateStaffStatus,
  type StaffPerson,
  type StaffTicketDetailView,
  type StaffTicketPriority,
  type StaffTicketStatus,
} from "./api.ts";
import { ConfirmationDialog, ErrorState, FormField, LoadingState, PriorityBadge, StatusBadge } from "./components/ui.tsx";

const STATUSES: StaffTicketStatus[] = ["NEW", "OPEN", "IN_PROGRESS", "WAITING_FOR_REQUESTER", "RESOLVED", "CLOSED", "REOPENED", "CANCELLED"];
const PRIORITIES: StaffTicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

export interface StaffTicketDetailProps {
  ticketNumber: string;
  staffOptions?: StaffPerson[];
  onNavigate?: (path: string) => void;
}

function displayStatus(value: string): string { return value.replaceAll("_", " "); }

export function StaffTicketDetail({ ticketNumber, staffOptions = [], onNavigate }: StaffTicketDetailProps) {
  const [ticket, setTicket] = useState<StaffTicketDetailView | null>(null);
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [priority, setPriority] = useState<StaffTicketPriority>("LOW");
  const [status, setStatus] = useState<StaffTicketStatus>("NEW");
  const [assignee, setAssignee] = useState("");
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setNotice("");
  }, [ticketNumber]);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    setState("loading"); setError("");
    fetchStaffTicketDetail(ticketNumber, controller.signal).then((value) => {
      if (ignore) return;
      setTicket(value); setPriority(value.itPriority ?? "LOW"); setStatus(value.currentStatus); setAssignee(value.assignedStaff ? String(value.assignedStaff.id) : ""); setState("success");
    }).catch((reason: unknown) => {
      if (ignore || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setState("error"); setError(reason instanceof Error ? reason.message : "Unable to load Ticket.");
    });
    return () => { ignore = true; controller.abort(); };
  }, [ticketNumber, reload]);

  async function run(action: () => Promise<unknown>, success: string): Promise<void> {
    setNotice("");
    try { await action(); setNotice(success); setReload((value) => value + 1); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Unable to update Ticket."); }
  }

  if (state === "loading") return <section className="card stack"><p className="eyebrow">IT Staff workspace</p><h1>Staff Ticket Detail</h1><LoadingState label="Loading Staff Ticket Detail…" /></section>;
  if (state === "error" || !ticket) return <section className="card stack"><p className="eyebrow">IT Staff workspace</p><h1>Staff Ticket Detail</h1><ErrorState onRetry={() => setReload((value) => value + 1)}>{error || "Unable to load Ticket."}</ErrorState></section>;

  const assignmentOptions = [...staffOptions.filter((person) => person.role === "IT_STAFF")];
  if (ticket.assignedStaff && !assignmentOptions.some((person) => person.id === ticket.assignedStaff?.id)) {
    assignmentOptions.unshift({ ...ticket.assignedStaff, role: "IT_STAFF" });
  }

  return (
    <section className="card stack" aria-labelledby="staff-ticket-detail-title">
      <div className="ticket-detail__header"><div><p className="eyebrow">IT Staff workspace</p><h1 id="staff-ticket-detail-title">Staff Ticket Detail</h1><p>{ticket.ticketNumber} · {ticket.summary}</p></div><a className="button button--secondary" href="/staff/tickets" onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate("/staff/tickets"); } }}>Back to Staff Queue</a></div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <fieldset className="ticket-detail__group"><legend>Read-only ticket information</legend><div className="ticket-detail__grid">
        <FormField id="staff-ticket-number" label="Ticket Number"><input id="staff-ticket-number" value={ticket.ticketNumber} readOnly aria-readonly="true" /></FormField>
        <FormField id="staff-ticket-requester-name" label="Requester"><input id="staff-ticket-requester-name" value={ticket.requester.name} readOnly aria-readonly="true" /></FormField>
        <FormField id="staff-ticket-requester-email" label="Requester Email"><input id="staff-ticket-requester-email" value={ticket.requester.email} readOnly aria-readonly="true" /></FormField>
        <FormField id="staff-ticket-date" label="Ticket Date"><input id="staff-ticket-date" value={ticket.ticketDate} readOnly aria-readonly="true" /></FormField>
      </div><FormField id="staff-ticket-description" label="Description"><textarea id="staff-ticket-description" value={ticket.description} readOnly aria-readonly="true" /></FormField></fieldset>

      <fieldset className="ticket-detail__group"><legend>Workflow</legend><div className="ticket-detail__grid">
        <FormField id="staff-ticket-assignment" label="Assign to active IT Staff"><select id="staff-ticket-assignment" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">Unassigned</option>{assignmentOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></FormField>
        <button type="button" className="button button--secondary" onClick={() => assignee ? void run(() => assignStaffTicket(ticket.ticketNumber, Number(assignee)), "Assignment updated.") : void run(() => claimStaffTicket(ticket.ticketNumber), "Ticket claimed.")}>{assignee ? "Save assignment" : "Claim ticket"}</button>
        <FormField id="staff-ticket-priority" label="IT Priority"><select id="staff-ticket-priority" value={priority} onChange={(event) => setPriority(event.target.value as StaffTicketPriority)}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></FormField>
        <button type="button" className="button button--secondary" onClick={() => void run(() => updateStaffPriority(ticket.ticketNumber, priority), "Priority updated.")}>Save priority</button>
        <FormField id="staff-ticket-status" label="Status"><select id="staff-ticket-status" value={status} onChange={(event) => setStatus(event.target.value as StaffTicketStatus)}>{STATUSES.map((value) => <option key={value}>{displayStatus(value)}</option>)}</select></FormField>
        <button type="button" className="button button--secondary" aria-label="Save status" onClick={() => (status === "CLOSED" || status === "CANCELLED") ? setDialogOpen(true) : void run(() => updateStaffStatus(ticket.ticketNumber, status), "Status updated.")}>Save status</button>
      </div><div className="ticket-detail__badge-field"><span className="ticket-detail__label">Current Status</span><StatusBadge label={displayStatus(ticket.currentStatus)} /></div><div className="ticket-detail__badge-field"><span className="ticket-detail__label">IT Priority</span><PriorityBadge label={ticket.itPriority ?? "Not assigned"} /></div></fieldset>

      <section className="ticket-detail__group" aria-labelledby="attachments-title"><h2 id="attachments-title">Attachments</h2>{ticket.attachments.length ? <ul>{ticket.attachments.map((item) => <li key={item.id}><span>{item.originalName}</span> <span>({item.mimeType}, {item.sizeBytes} bytes, {item.status})</span></li>)}</ul> : <p>No attachments.</p>}</section>
      <section className="ticket-detail__group" aria-labelledby="public-comments-title"><h2 id="public-comments-title">Public Comments</h2><ul>{ticket.publicComments.map((item) => <li key={item.id}><strong>{item.author.name}</strong>: {item.body}</li>)}</ul><FormField id="staff-public-comment" label="Public comment" hint="Plain text, 1–2,000 characters."><textarea id="staff-public-comment" value={comment} onChange={(event) => setComment(event.target.value)} /></FormField><button type="button" className="button" disabled={!comment.trim()} onClick={() => void run(() => addStaffPublicComment(ticket.ticketNumber, comment.trim()).then(() => setComment("")), "Comment added.")}>Add public comment</button></section>
      <section className="ticket-detail__group" aria-labelledby="internal-notes-title"><h2 id="internal-notes-title">Internal Notes</h2><ul>{ticket.internalNotes.map((item) => <li key={item.id}><strong>{item.author.name}</strong>: {item.body}</li>)}</ul><FormField id="staff-internal-note" label="Internal note" hint="Visible only to IT Staff and Admin."><textarea id="staff-internal-note" value={note} onChange={(event) => setNote(event.target.value)} /></FormField><button type="button" className="button" disabled={!note.trim()} onClick={() => void run(() => addInternalNote(ticket.ticketNumber, note.trim()).then(() => setNote("")), "Internal note added.")}>Add internal note</button></section>
      <ConfirmationDialog open={dialogOpen} title="Confirm status change" message={`Change ${ticket.ticketNumber} to ${displayStatus(status)}?`} confirmLabel="Confirm status" onCancel={() => setDialogOpen(false)} onConfirm={() => { setDialogOpen(false); void run(() => updateStaffStatus(ticket.ticketNumber, status, true), "Status updated."); }} />
    </section>
  );
}

export default StaffTicketDetail;
