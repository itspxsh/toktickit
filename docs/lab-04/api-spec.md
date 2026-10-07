# TokTickIT Lab 4 API Contract — PROPOSED FOR L4-01 PEER REVIEW

Companion to `specification.md`; proposed until L4-01 approval. All dates below are UTC ISO-8601 strings; IDs are positive safe integers. Ticket Number matches `^TKT-\d{4}-\d{6}$`. Preserve earlier safe envelopes, auth gates, upload limits and public `/api/health`. Use authenticated session identity, never the Development Requester selector.

## 1. Shared types, middleware and errors

```ts
type Role = 'REQUESTER' | 'IT_STAFF' | 'ADMIN';
type ActionState = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type TicketStatus = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_REQUESTER'
  | 'RESOLVED' | 'CLOSED' | 'REOPENED' | 'CANCELLED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type Person = { id: number; name: string; role: Role; isActive: boolean };
type Page<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };
type ActionView = {
  id: number; description: string; result: string; attachmentNotes: string;
  followUpRequired: boolean; followUpNote: string; state: ActionState;
  createdBy: Person; assignee: Person; performedBy: Person | null;
  createdAt: string; updatedAt: string; completedAt: string | null;
  cancelledAt: string | null; cancellationReason: string | null; version: number;
};
type TicketSummary = {
  ticketNumber: string; summary: string; currentStatus: TicketStatus;
  itPriority: Priority | null; updatedAt: string;
  href: string; // server-controlled role-specific relative Ticket Detail URL
};
type Metric = { value: number; drillDown: string };
```

New bodies reject unknown/server-only keys, arrays, wrong primitive types and invalid bounded text with 400 VALIDATION_ERROR. Same-role active support lookup returns safe Person, not email/password/session data. Requester projection includes safe names/roles/activity needed to describe Action participants, never credentials or internal revision snapshots. No `ticketSequence` bigint is serialized. Existing GET body fields may be extended, not removed; older unversioned workflow writes are deliberately rejected.

Middleware order: session -> password-change gate -> role/ownership -> Origin/CSRF for writes -> parse/validate -> authorized transaction. Check `res.headersSent` before continuing. No upload or database mutation before authorization/CSRF. New route registrars default to real fail-closed middleware. Reuse auth infrastructure rather than a parallel login/token system.

| HTTP/code | Meaning |
| --- | --- |
| 400 VALIDATION_ERROR | Invalid fields/query, omitted/invalid expected versions. fieldErrors optional, keyed by safe field names. |
| 400 INVALID_TICKET_NUMBER / INVALID_IDENTIFIER | Invalid path shape, before database work. |
| 401 UNAUTHENTICATED | Anonymous/expired/inactive session; preserve existing login credential envelope. |
| 403 FORBIDDEN / PASSWORD_CHANGE_REQUIRED | Role or password-change gate; existing CSRF error code retained. |
| 404 TICKET_NOT_FOUND | Missing/invisible Ticket, identical safe envelope. |
| 404 ACTION_NOT_FOUND | Missing/foreign-parent/invisible Action, identical safe envelope. |
| 409 STALE_WRITE | Version mismatch, no mutation. Refresh before retry; no other user's data in error. |
| 409 ACTION_TRANSITION_NOT_ALLOWED | Invalid Action current-state transition. |
| 400 INVALID_STATUS_TRANSITION / 409 CONFIRMATION_REQUIRED | Retain existing Ticket invalid-transition and missing-confirmation codes. |
| 409 TICKET_NOT_EDITABLE / ACTION_NOT_EDITABLE | Parent or Action terminal, no edit. |
| 409 RESOLUTION_REQUIREMENTS_NOT_MET | Authorized caller only: details.blockers list ZERO_COMPLETED, UNFINISHED_ACTIONS, FOLLOW_UP_REQUIRED. |
| 409 IDEMPOTENCY_CONFLICT / TICKET_ALREADY_ASSIGNED | Reused create key with different content/actor, or competing claim. |
| 500 INTERNAL_ERROR | Generic message; structured server correlation log excludes bodies, cookies, passwords and DB URL. |

Errors always `{error:{code,message,fieldErrors?,details?}}`; never concatenate arbitrary DB/exception text. Active-assignee invalid/inactive/wrong-role is 400 VALIDATION_ERROR with assigneeId error, no user enumeration details. Successful GET=200, create=201, valid same-key replay=200, update/transition=200. No delete endpoint for Actions, revisions or status events.

## 2. Active support assignees

`GET /api/staff/assignees?q=&page=1&pageSize=20` (IT_STAFF/ADMIN).

* q trimmed 0-100; integer page >=1, pageSize 1-100.
* Return `Page<Person>` of active IT_STAFF/ADMIN ordered name ASC, id ASC. No Requesters or inactive accounts. Both Ticket Owner and Action Assignee controls consume this endpoint with search/pagination, not the Admin user API.
* Existing inactive owner/assignee is displayed from historical detail with "Inactive" cue, not offered as a selectable new value. Empty lookup is a real empty state, never a fabricated first entry.

## 3. Ticket Actions

### Read

`GET /api/staff/tickets/:ticketNumber/actions?page=1&pageSize=20` - Staff/Admin, active operational scope.

`GET /api/tickets/:ticketNumber/actions?page=1&pageSize=20` - Requester, owned Ticket only.

Return `{...Page<ActionView>, ticketVersion:number}`, order createdAt ASC/id ASC. Optional `focusActionId` positive integer resolves the page containing that authorized child using its stable ordering; mutually exclusive with explicit page, absent/foreign child returns ACTION_NOT_FOUND. The returned page/pageSize remain authoritative for rendering Dashboard anchors. All states available through pagination; no hidden cancelled items. Requester body omits revision log/private notes entirely. Existing requester/staff Ticket detail gets `workflowVersion`, staff additionally `allowedTransitions:TicketStatus[]` and `resolutionGate:{canResolve:boolean,blockers:string[]}` computed from current work. Shared read logic must avoid visibility drift.

### Create

`POST /api/staff/tickets/:ticketNumber/actions`

```json
{
  "clientRequestId": "6d0e5ea5-3b6e-4ac4-bd7b-3115e23bc232",
  "expectedTicketVersion": 1,
  "assigneeId": 21,
  "description": "Check the VPN gateway configuration",
  "result": "",
  "followUpRequired": false,
  "followUpNote": "",
  "attachmentNotes": "See the existing error image on this Ticket"
}
```

All keys required except result/followUpNote/attachmentNotes default empty; followUpRequired required boolean. Return `{action:ActionView,ticketVersion:number}`. Server sets PLANNED, createdBy, times, version=1, performedBy=null. Canonical fingerprint covers normalized content/assignee, excluding expectedTicketVersion; unique key is Ticket + clientRequestId. Save one CREATE revision and increment Ticket version in the same transaction. Catch unique-key races, re-read under authorization and compare actor/fingerprint; never replay across actor. Same-key replay works after a lost response despite old expectedTicketVersion.

### Edit/assign

`PATCH /api/staff/tickets/:ticketNumber/actions/:actionId`

Body: `{expectedTicketVersion,expectedVersion,description?,result?,followUpRequired?,followUpNote?,attachmentNotes?,assigneeId?}` with >=1 editable key. Validate the **merged** Action, so omitted followUpNote cannot bypass true-follow-up validation. State/actor/time/clientRequestId cannot be edited. Compare both counters, require non-terminal parent/Action, revalidate changed assignee. Preserve existing inactive assignee on a description-only edit but reject start/complete until reassigned; do not falsely describe preservation as a new assignment. Return `{action,ticketVersion}`. One effective update = one revision + increments; unchanged normalized content = 200 no-op.

### Start/complete/cancel

`POST /api/staff/tickets/:ticketNumber/actions/:actionId/transitions`

Body start: `{expectedTicketVersion,expectedVersion,state:"IN_PROGRESS"}`.

Body complete: `{expectedTicketVersion,expectedVersion,state:"COMPLETED",confirm:true,result:"Gateway configuration corrected",followUpRequired:false,followUpNote:""}`. Result/follow-up can instead already be saved, but merged content must satisfy completion; submitted optional keys only these content fields.

Body cancel: `{expectedTicketVersion,expectedVersion,state:"CANCELLED",confirm:true,reason:"Work superseded by another action"}`.

Return `{action,ticketVersion}`. Complete stamps performedBy=actor, completedAt=server clock; cancel stamps cancelledAt and reason, performedBy stays null. Terminal transition records one revision. Unknown state/confirmation type =400; disallowed edge/terminal/stale =409. No implicit PLANNED -> COMPLETED shortcut.

### Staff-only audit

`GET /api/staff/tickets/:ticketNumber/actions/:actionId/revisions?page=1&pageSize=20` returns `Page<{version,kind,actor:Person,createdAt,snapshot}>`, ascending version. Snapshot uses Action content/scalar metadata, not arbitrary raw User objects. Requesters cannot use this endpoint (403) or receive its data from other responses. This is a small audit section, not a new report builder.

## 4. Existing Ticket workflow extensions

All staff claim/assignment/priority/status paths remain as released; add `expectedTicketVersion` required positive integer.

* POST `.../claim`: `{expectedTicketVersion}`; active Staff/Admin claim own identity; cannot overwrite existing owner.
* PATCH `.../assignment`: `{expectedTicketVersion,assignedStaffId:number|null}`; target active IT_STAFF/ADMIN; null explicitly unassigns.
* PATCH `.../priority`: `{expectedTicketVersion,itPriority:Priority}`.
* PATCH `.../status`: `{expectedTicketVersion,currentStatus:TicketStatus,confirm?:boolean}`.
* Preserve each existing success shape and append `ticketVersion`; status additionally returns allowedTransitions and resolutionGate.
* Lock parent, re-read its authorized state, compare counter, return unchanged status as a200 no-op before transition/gate checks, otherwise validate target/role/gate, update and append TicketStatusEvent atomically. Cancellation/closing actual transitions need confirmation. Terminal Ticket cannot change assignment/priority; reopening restores editability.
* Extend GET staff detail with ordered statusEvents safe actor/from/to/time, and existing private notes. Requester gets ordered safe statusEvents too (formal status changes are public), never private notes or ActionRevision history.
* Requester resolution-indication route remains separate, advisory and owned; public comment/internal note paths stay append-only. These appends do not increment workflowVersion or alter resolution eligibility.

## 5. List filters for drill-down

Extend GET `/api/tickets` and `/api/staff/tickets` without replacing the existing list envelope. Existing search/category/system/requestedPriority/staff filters remain. Status accepts all 8 (omitted=all), statusGroup active|resolved, updatedSince/resolvedSince UTC ISO, before UTC ISO. A date lower bound requires before, lower < before, and before not in future beyond 60s clock tolerance. Date filters use inclusive lower/exclusive upper. Invalid/contradictory status/group or unresolved date bounds =400.

Staff itPriority additionally accepts UNPRIORITIZED to match null legacy values. Requester does not gain staff owner/priority management. Filter state must be encoded in URL and safely initialized from it; pagination resets to1 when a filter changes. Use canonical allow-listed query serializer; strip unapproved redirect/origin fields. All count/data queries share the same authorized predicate; page beyond end yields empty items with correct total/totalPages, never out-of-scope data.

## 6. Requester Dashboard

`GET /api/dashboards/requester` (REQUESTER only, no requester ID input).

```ts
type RequesterDashboard = {
  asOf: string; windowStart: string; displayTimeZone: 'Asia/Bangkok';
  metrics: { activeTickets: Metric; waitingForRequester: Metric;
    updatedLast7Days: Metric; resolvedLast7Days: Metric };
  attentionTickets: TicketSummary[]; // <=5 waiting, updated desc/id desc
  recentTickets: TicketSummary[]; // <=5 updated in the window
};
```

Metric predicates and links exactly match specification BR-23..32. No query actor selection; unknown new-dashboard query keys return400. Empty scope returns all numeric zeros and []; failure returns an error, not zeros. No description, email, comments, notes, action revisions or entire Ticket collection.

## 7. Staff/Admin Dashboard

`GET /api/dashboards/staff?actionPage=1&actionPageSize=5` (IT_STAFF/ADMIN).

```ts
type StaffDashboard = {
  asOf: string; windowStart: string; displayTimeZone: 'Asia/Bangkok';
  metrics: { unassignedActive: Metric; ownedActive: Metric;
    urgentActive: Metric; myUnfinishedActions: Metric };
  statusBuckets: { status: TicketStatus; value: number; drillDown: string }[]; // all8
  priorityBuckets: { priority: Priority | 'UNPRIORITIZED'; value: number; drillDown: string }[]; // all5, active only
  recentTickets: TicketSummary[]; urgentTickets: TicketSummary[]; // <=5 each
  myActions: Page<Pick<ActionView,'id'|'description'|'state'|'createdAt'|'assignee'>
    & {ticketNumber:string;ticketSummary:string;href:string}>;
};
```

actionPage >=1/actionPageSize1-20, defaults1/5. All parts from one repeatable-read snapshot. Own Action links `/staff/tickets/:ticketNumber#action-:id`; metric links anchor `#my-actions` with pagination preserving Dashboard URL/actionPage, not a broken fake list. Empty myActions still exposes total0/totalPages0 and disabled controls. Bucket zero values still have safe valid drill-down links. No internal notes/user secrets.

## 8. Concurrency implementation boundary

New service modules use generated Prisma types and `$transaction`, never a broad `any` provider hiding omitted predicates. Obtain parent lock with parameterized Prisma SQL (no string concatenation), then fetch child scoped by ticketId, verify versions, apply mutation, insert revision/event and increment. If a User can deactivate concurrently with assignment, lock/read candidate User in a consistent parent-then-user order shared by relevant assignment operations and revalidate at commit; document/test the rule. Never let two lock paths acquire Action before Ticket. Use bounded transaction timeout and safe 409 for retryable DB conflicts, no unlimited retry.

Resolution requests and Action writes must participate in the **same** locking discipline. A transaction that merely counts children then independently updates a Ticket without shared serialization is insufficient. Test on real PostgreSQL using two connections with barriers. At the successful resolution serialization point no unfinished Action may exist; competing request becomes stale or sees terminal parent.

## 9. Reproducible API evidence

Record actual commands/cwd/versions/commit, test-scoped DB **name only**, fixture counts, pass/fail/skip/retry totals and redacted output. Never retain Set-Cookie/CSRF/session/password/connection strings. Verify authorization first, then lookup; 404 bodies for missing/foreign children byte-identical. Include rollback tests forcing revision/event failure to prove parent/child counters and state remain unchanged.
