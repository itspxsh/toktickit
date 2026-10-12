import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ApiError,
  createStaffAction,
  fetchRequesterTicketActions,
  fetchStaffActionRevisions,
  fetchStaffAssignees,
  fetchStaffTicketActions,
  transitionStaffAction,
  updateStaffAction,
  type ActionPage,
  type ActionRevisionPage,
  type ActionState,
  type ActionView,
  type AssigneePage,
  type CreateActionPayload,
} from "./api.ts";
import { ConfirmationDialog, FormField, LoadingState } from "./components/ui.tsx";

const PAGE_SIZE = 20;
const REVISION_PAGE_SIZE = 20;
const TERMINAL_TICKETS = new Set(["RESOLVED", "CLOSED", "CANCELLED"]);

type Mode = "support" | "requester";
type Draft = { description: string; assigneeId: string; result: string; followUpRequired: boolean; followUpNote: string; attachmentNotes: string };
type PendingTransition = { action: ActionView; state: "COMPLETED" | "CANCELLED" } | null;

const emptyDraft: Draft = { description: "", assigneeId: "", result: "", followUpRequired: false, followUpNote: "", attachmentNotes: "" };

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
  }).format(date);
}

function safeError(error: unknown): string {
  return error instanceof ApiError || error instanceof Error ? error.message : "Unable to update Actions Taken.";
}

function newRequestId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) throw new Error("This browser cannot securely create an Action request ID.");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export interface ActionsTakenProps {
  ticketNumber: string;
  mode: Mode;
  ticketStatus?: string;
  ticketOwner?: { id: number; name: string } | null;
  onTicketChanged?: () => void;
}

/** Current Ticket Actions. Requester mode is deliberately read-only; the API remains the authorization boundary. */
export function ActionsTaken({ ticketNumber, mode, ticketStatus, ticketOwner, onTicketChanged }: ActionsTakenProps) {
  const support = mode === "support";
  const terminalTicket = Boolean(ticketStatus && TERMINAL_TICKETS.has(ticketStatus));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActionPage | null>(null);
  const [assignees, setAssignees] = useState<AssigneePage | null>(null);
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [assigneePage, setAssigneePage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [assigneesLoading, setAssigneesLoading] = useState(support);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft);
  const [pendingTransition, setPendingTransition] = useState<PendingTransition>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [completeResult, setCompleteResult] = useState("");
  const [confirmFollowUpResolved, setConfirmFollowUpResolved] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [focusActionId, setFocusActionId] = useState<number | null>(null);
  const [historyActionId, setHistoryActionId] = useState<number | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<ActionRevisionPage | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const requestKey = useRef<{ signature: string; id: string } | null>(null);

  useEffect(() => {
    if (!terminalTicket) return;
    setFormOpen(false);
    setEditingId(null);
    setPendingTransition(null);
  }, [terminalTicket]);

  useEffect(() => {
    const controller = new AbortController();
    let ignore = false;
    setLoading(true); setError("");
    const load = support
      ? fetchStaffTicketActions(ticketNumber, page, PAGE_SIZE, controller.signal)
      : fetchRequesterTicketActions(ticketNumber, page, PAGE_SIZE, controller.signal);
    load.then((value) => {
      if (ignore) return;
      setData(value);
      setConflict(false);
    }).catch((reason: unknown) => {
      if (ignore || (reason instanceof DOMException && reason.name === "AbortError")) return;
      setError(safeError(reason));
    }).finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; controller.abort(); };
  }, [ticketNumber, page, reload, support]);

  useEffect(() => {
    if (!support) return;
    const controller = new AbortController();
    let ignore = false;
    setAssigneesLoading(true);
    const timer = window.setTimeout(() => fetchStaffAssignees(assigneeQuery, assigneePage, PAGE_SIZE, controller.signal).then((value) => {
      if (!ignore) setAssignees(value);
    }).catch((reason: unknown) => {
      if (!ignore && !(reason instanceof DOMException && reason.name === "AbortError")) setError(safeError(reason));
    }).finally(() => { if (!ignore) setAssigneesLoading(false); }), 250);
    return () => { ignore = true; window.clearTimeout(timer); controller.abort(); };
  }, [ticketNumber, reload, support, assigneeQuery, assigneePage]);

  useEffect(() => {
    if (!focusActionId || loading) return;
    const target = document.getElementById(`action-${focusActionId}`);
    target?.focus();
    if (target) setFocusActionId(null);
  }, [data, focusActionId, loading]);

  useEffect(() => {
    if (!support || historyActionId === null) return;
    const controller = new AbortController();
    let ignore = false;
    setHistoryLoading(true); setHistoryError("");
    fetchStaffActionRevisions(ticketNumber, historyActionId, historyPage, REVISION_PAGE_SIZE, controller.signal)
      .then((value) => { if (!ignore) setHistory(value); })
      .catch((reason: unknown) => {
        if (!ignore && !(reason instanceof DOMException && reason.name === "AbortError")) setHistoryError(safeError(reason));
      })
      .finally(() => { if (!ignore) setHistoryLoading(false); });
    return () => { ignore = true; controller.abort(); };
  }, [ticketNumber, support, historyActionId, historyPage]);

  const activeAssignees = useMemo(() => assignees?.items.filter((person) => person.isActive && (person.role === "IT_STAFF" || person.role === "ADMIN")) ?? [], [assignees]);

  function setFormField<K extends keyof Draft>(key: K, value: Draft[K], editing = false) {
    if (editing) setEditDraft((current) => ({ ...current, [key]: value }));
    else setDraft((current) => ({ ...current, [key]: value }));
  }

  async function refreshAfterWrite(message: string) {
    setNotice(message); setError(""); setConflict(false); setReload((value) => value + 1);
    onTicketChanged?.();
  }

  async function createAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || saving || terminalTicket) return;
    const normalized = {
      description: draft.description.trim(), assigneeId: Number(draft.assigneeId),
      result: draft.result.trim(), followUpRequired: draft.followUpRequired,
      followUpNote: draft.followUpNote.trim(), attachmentNotes: draft.attachmentNotes.trim(),
    };
    const signature = JSON.stringify(normalized);
    setSaving(true); setError(""); setNotice("");
    try {
      if (!requestKey.current || requestKey.current.signature !== signature) requestKey.current = { signature, id: newRequestId() };
      const payload: CreateActionPayload = { clientRequestId: requestKey.current.id, expectedTicketVersion: data.ticketVersion, ...normalized };
      const result = await createStaffAction(ticketNumber, payload);
      requestKey.current = null; setDraft(emptyDraft); setFormOpen(false);
      const targetPage = Math.ceil((data.total + 1) / data.pageSize);
      if (targetPage !== page) setPage(targetPage);
      setFocusActionId(result.action.id);
      await refreshAfterWrite("Action created.");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setConflict(true);
      setError(safeError(reason));
    } finally { setSaving(false); }
  }

  async function saveEdit(action: ActionView) {
    if (!data || saving || terminalTicket) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await updateStaffAction(ticketNumber, action.id, {
        expectedTicketVersion: data.ticketVersion, expectedVersion: action.version,
        description: editDraft.description.trim(), result: editDraft.result.trim(),
        followUpRequired: editDraft.followUpRequired, followUpNote: editDraft.followUpNote.trim(),
        attachmentNotes: editDraft.attachmentNotes.trim(),
        ...(Number(editDraft.assigneeId) !== action.assignee.id ? { assigneeId: Number(editDraft.assigneeId) } : {}),
      });
      setEditingId(null); setFocusActionId(action.id); await refreshAfterWrite("Action updated.");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setConflict(true);
      setError(safeError(reason));
    } finally { setSaving(false); }
  }

  async function transition(action: ActionView, state: "IN_PROGRESS" | "COMPLETED" | "CANCELLED") {
    if (!data || saving || terminalTicket) return;
    const payload = state === "IN_PROGRESS"
      ? { expectedTicketVersion: data.ticketVersion, expectedVersion: action.version, state }
      : state === "COMPLETED"
        ? { expectedTicketVersion: data.ticketVersion, expectedVersion: action.version, state, confirm: true as const, result: completeResult.trim(), followUpRequired: false, followUpNote: "" }
        : { expectedTicketVersion: data.ticketVersion, expectedVersion: action.version, state, confirm: true as const, reason: cancelReason.trim() };
    setSaving(true); setError(""); setNotice("");
    try {
      await transitionStaffAction(ticketNumber, action.id, payload);
      setPendingTransition(null); setCancelReason(""); setCompleteResult(""); setConfirmFollowUpResolved(false);
      setFocusActionId(action.id);
      await refreshAfterWrite(state === "IN_PROGRESS" ? "Action started." : state === "COMPLETED" ? "Action completed." : "Action cancelled.");
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setConflict(true);
      setError(safeError(reason));
    } finally { setSaving(false); }
  }

  function beginEdit(action: ActionView) {
    setEditingId(action.id);
    setEditDraft({ description: action.description, assigneeId: String(action.assignee.id), result: action.result, followUpRequired: action.followUpRequired, followUpNote: action.followUpNote, attachmentNotes: action.attachmentNotes });
  }

  function actionForm(current: Draft, editing: boolean, action?: ActionView) {
    const suffix = editing ? String(action?.id) : "new";
    const options = [...activeAssignees];
    if (action && !options.some((person) => person.id === action.assignee.id)) options.unshift(action.assignee);
    return <form className="actions-taken__form" onSubmit={(event) => { event.preventDefault(); if (editing && action) void saveEdit(action); else void createAction(event); }}>
      <FormField id={`action-description-${suffix}`} label="Description" required><textarea id={`action-description-${suffix}`} value={current.description} required maxLength={2000} onChange={(event) => setFormField("description", event.target.value, editing)} /></FormField>
      <FormField id={`action-assignee-${suffix}`} label="Assignee" required hint={assigneesLoading ? "Loading active support users…" : "Choose an active IT Staff or Administrator."}>
        <input id={`action-assignee-search-${suffix}`} aria-label="Search assignees" value={assigneeQuery} onChange={(event) => { setAssigneeQuery(event.target.value); setAssigneePage(1); }} placeholder="Search active support users" />
        <select id={`action-assignee-${suffix}`} value={current.assigneeId} required disabled={assigneesLoading} onChange={(event) => setFormField("assigneeId", event.target.value, editing)}><option value="">Choose an assignee</option>{options.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.role === "ADMIN" ? "Administrator" : "IT Staff"}){!person.isActive ? " — Inactive" : ""}</option>)}</select>
        {assignees && assignees.totalPages > 1 && <nav className="pagination" aria-label="Assignee pagination"><button className="button button--tertiary" type="button" disabled={assigneePage <= 1 || assigneesLoading} onClick={() => setAssigneePage((value) => value - 1)}>Previous assignees</button><span aria-current="page">Page {assigneePage} of {assignees.totalPages}</span><button className="button button--tertiary" type="button" disabled={assigneePage >= assignees.totalPages || assigneesLoading} onClick={() => setAssigneePage((value) => value + 1)}>Next assignees</button></nav>}
      </FormField>
      <FormField id={`action-result-${suffix}`} label="Result"><textarea id={`action-result-${suffix}`} value={current.result} maxLength={2000} onChange={(event) => setFormField("result", event.target.value, editing)} /></FormField>
      <FormField id={`action-follow-up-${suffix}`} label="Follow-up required"><input id={`action-follow-up-${suffix}`} type="checkbox" checked={current.followUpRequired} onChange={(event) => setFormField("followUpRequired", event.target.checked, editing)} /></FormField>
      {current.followUpRequired && <FormField id={`action-follow-up-note-${suffix}`} label="Follow-up note" hint="Enter 5–2,000 characters." required><textarea id={`action-follow-up-note-${suffix}`} value={current.followUpNote} required minLength={5} maxLength={2000} onChange={(event) => setFormField("followUpNote", event.target.value, editing)} /></FormField>}
      <FormField id={`action-attachment-notes-${suffix}`} label="Attachment notes" hint="Describe a file already attached to this Ticket; this does not upload a file. Maximum 1,000 characters."><textarea id={`action-attachment-notes-${suffix}`} value={current.attachmentNotes} maxLength={1000} onChange={(event) => setFormField("attachmentNotes", event.target.value, editing)} /></FormField>
      <div className="form-actions"><button className="button" type="submit" disabled={saving || assigneesLoading || activeAssignees.length === 0}>{saving ? "Saving…" : editing ? "Save action" : "Create action"}</button>{editing ? <button className="button button--secondary" type="button" onClick={() => setEditingId(null)}>Discard changes</button> : <button className="button button--secondary" type="button" onClick={() => { setFormOpen(false); setDraft(emptyDraft); requestKey.current = null; }}>Cancel</button>}</div>
    </form>;
  }

  return <section className="ticket-detail__group actions-taken" aria-labelledby="actions-taken-title" role="region">
    <div className="actions-taken__header"><div><h2 id="actions-taken-title">Actions Taken</h2><p>Work items shared with the Requester.</p><p>Times are shown in Asia/Bangkok (UTC+7).</p>{support && <p>Ticket Owner: {ticketOwner?.name ?? "Unassigned"}</p>}</div>{data && <span>{data.total} {data.total === 1 ? "Action" : "Actions"}</span>}</div>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    {conflict && <div className="actions-taken__conflict" role="status"><p>This Ticket changed elsewhere. Your draft is preserved; reload the current Actions before retrying.</p><button className="button button--secondary" type="button" onClick={() => setReload((value) => value + 1)}>Refresh Actions</button></div>}
    {support && terminalTicket && <p role="status">This Ticket is {ticketStatus}; Actions are read-only until the Ticket is reopened.</p>}
    {support && !terminalTicket && <button className="button button--secondary" type="button" disabled={saving} onClick={() => { setFormOpen((open) => !open); setError(""); }}>{formOpen ? "Close action form" : "Add action"}</button>}
    {support && !terminalTicket && formOpen && actionForm(draft, false)}
    {loading ? <LoadingState label="Loading Actions Taken…" /> : data ? <>
      {data.items.length === 0 ? <p>No Actions have been recorded for this Ticket.</p> : <ol className="actions-taken__list">{data.items.map((item) => <li id={`action-${item.id}`} tabIndex={-1} className="actions-taken__item" key={item.id}>
        {support && !terminalTicket && editingId === item.id ? actionForm(editDraft, true, item) : <>
          <div className="actions-taken__item-header"><h3>{item.description}</h3><span className={`status-badge status-badge--${item.state === "COMPLETED" ? "success" : item.state === "CANCELLED" ? "neutral" : "warning"}`} role="status">{item.state.replaceAll("_", " ")}</span></div>
          <dl className="actions-taken__details">
            <div><dt>Created</dt><dd>{dateLabel(item.createdAt)} · {item.createdBy.name}</dd></div>
            <div><dt>Assignee</dt><dd>{item.assignee.name}{!item.assignee.isActive && <span> — Inactive</span>}</dd></div>
            <div><dt>Performed by</dt><dd>{item.performedBy?.name ?? "Not performed yet"}</dd></div>
            {item.result && <div><dt>Result</dt><dd>{item.result}</dd></div>}
            {item.followUpRequired && <div><dt>Follow-up required</dt><dd>Yes{item.followUpNote ? ` — ${item.followUpNote}` : ""}</dd></div>}
            {item.attachmentNotes && <div><dt>Attachment notes</dt><dd>{item.attachmentNotes}</dd></div>}
            {item.cancellationReason && <div><dt>Cancellation reason</dt><dd>{item.cancellationReason}</dd></div>}
          </dl>
          {support && !terminalTicket && item.state !== "COMPLETED" && item.state !== "CANCELLED" && <div className="actions-taken__controls">
            <button className="button button--tertiary" type="button" disabled={saving} onClick={() => beginEdit(item)}>Edit action</button>
            {!item.assignee.isActive && <p role="status">Reassign this Action to an active support user before starting or completing it.</p>}
            {item.state === "PLANNED" && <button className="button button--secondary" type="button" disabled={saving || !item.assignee.isActive} onClick={() => void transition(item, "IN_PROGRESS")}>Start action</button>}
            {item.state === "IN_PROGRESS" && <button className="button button--secondary" type="button" disabled={saving || !item.assignee.isActive} onClick={() => { setCompleteResult(item.result); setConfirmFollowUpResolved(false); setPendingTransition({ action: item, state: "COMPLETED" }); }}>Complete action</button>}
            <button className="button button--tertiary" type="button" disabled={saving} onClick={() => { setCancelReason(""); setPendingTransition({ action: item, state: "CANCELLED" }); }}>Cancel action</button>
          </div>}
          {support && <div className="actions-taken__history">
            <button className="button button--tertiary" type="button" aria-expanded={historyActionId === item.id} onClick={() => { setHistory(null); setHistoryPage(1); setHistoryActionId((current) => current === item.id ? null : item.id); }}>
              {historyActionId === item.id ? "Hide Action history" : "View Action history"}
            </button>
            {historyActionId === item.id && <section className="actions-taken__revisions" aria-label={`Action history for ${item.description}`}>
              <h4>Action history</h4>
              {historyLoading && <LoadingState label="Loading Action history…" />}
              {historyError && <p role="alert">{historyError}</p>}
              {history && <>
                {history.items.length === 0 ? <p>No history revisions.</p> : <ol>{history.items.map((revision) => <li key={revision.version}>
                  <strong>Version {revision.version}: {revision.kind}</strong> · {revision.actor.name} · {dateLabel(revision.createdAt)}
                  <dl className="actions-taken__details">{Object.entries(revision.snapshot).filter(([key, value]) => ["description", "result", "attachmentNotes", "followUpRequired", "followUpNote", "state", "assigneeId"].includes(key) && value !== null).map(([key, value]) => <div key={key}><dt>{key.replaceAll(/([A-Z])/g, " $1")}</dt><dd>{String(value)}</dd></div>)}</dl>
                </li>)}</ol>}
                {history.totalPages > 1 && <nav className="pagination" aria-label="Action history pagination"><button className="button button--tertiary" type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((value) => value - 1)}>Previous history</button><span aria-current="page">Page {history.page} of {history.totalPages}</span><button className="button button--tertiary" type="button" disabled={historyPage >= history.totalPages} onClick={() => setHistoryPage((value) => value + 1)}>Next history</button></nav>}
              </>}
            </section>}
          </div>}
        </>}
      </li>)}</ol>}
      {data.totalPages > 1 && <nav className="pagination" aria-label="Actions pagination"><button className="button button--tertiary" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span aria-current="page">Page {page} of {data.totalPages}</span><button className="button button--tertiary" type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button></nav>}
    </> : <button className="button button--secondary" type="button" onClick={() => setReload((value) => value + 1)}>Retry loading Actions</button>}
    <ConfirmationDialog
      open={Boolean(pendingTransition)}
      title={pendingTransition?.state === "COMPLETED" ? "Complete Action" : "Cancel Action"}
      message={pendingTransition?.state === "COMPLETED" ? "Confirm the work is complete. Any required follow-up must be completed before this Action can be closed." : "Cancel this Action? The reason is visible to the Requester."}
      confirmLabel={pendingTransition?.state === "COMPLETED" ? "Confirm completion" : "Confirm cancellation"}
      confirmDisabled={saving || (pendingTransition?.state === "COMPLETED" ? !completeResult.trim() || (pendingTransition.action.followUpRequired && !confirmFollowUpResolved) : cancelReason.trim().length < 5 || cancelReason.trim().length > 250)}
      onCancel={() => setPendingTransition(null)}
      onConfirm={() => pendingTransition && void transition(pendingTransition.action, pendingTransition.state)}
    >
      {pendingTransition?.state === "COMPLETED" ? <>
        <FormField id="complete-action-result" label="Result" hint="Enter 1–2,000 characters." required><textarea id="complete-action-result" required minLength={1} maxLength={2000} value={completeResult} onChange={(event) => setCompleteResult(event.target.value)} /></FormField>
        {pendingTransition.action.followUpRequired && <>
          <p>Previous follow-up: {pendingTransition.action.followUpNote}</p>
          <FormField id="complete-follow-up-resolved" label="I confirm the required follow-up is complete" required><input id="complete-follow-up-resolved" type="checkbox" checked={confirmFollowUpResolved} onChange={(event) => setConfirmFollowUpResolved(event.target.checked)} /></FormField>
        </>}
      </> : pendingTransition && <FormField id="cancel-action-reason" label="Cancellation reason" hint="Enter 5–250 characters." required><textarea id="cancel-action-reason" required minLength={5} maxLength={250} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></FormField>}
    </ConfirmationDialog>
  </section>;
}
