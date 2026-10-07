# TokTickIT Lab 4 UI Contract — PROPOSED FOR L4-01 PEER REVIEW

Extends reviewed Lab 2/3 Zen Green tokens/components, not a redesign. Field names/IDs/status/metrics follow the companion specification/API drafts. Defaults below are choices for L4-01 approval.

## 1. Shell, identity and navigation

* Landing: REQUESTER -> `/dashboard`; IT_STAFF/ADMIN -> `/staff/dashboard`. `/` redirects after server-session bootstrap; logged-out remains Login, first-login remains Change Password.
* Requester: Dashboard, My Tickets, Create Ticket, Service status. Staff: Dashboard, Ticket Queue, Service status. Admin additionally Users. Only safe identity from `/auth/me`; no client requester ID/localStorage login.
* Deep links use existing RoleGuard/Forbidden. Dashboard owns aria-current=page; prefix matching never makes `/staff/tickets` active for Dashboard. Mobile menu button labelled, aria-expanded/controls and collapses after navigation.
* Refactor small manual router to track pathname + search + hash. Parse approved query values, support back/forward and same-path query changes. Preserve existing dirty-form navigation guard across dashboard links.
* No dead placeholder export, unfinished Lab 2 copy or handlers that do nothing. Keep public health API and authenticated Service status UI as real diagnostics, not the landing dashboard.

## 2. Shared states and accessibility

Every data view distinguishes loading, true-empty, filter-no-results, success, safe failure with retry, forbidden, not-found where relevant and stale-write conflict. Never flash zero metrics while loading or replace failed API data with 0. Authentication expiry offers sign-in without leaking data; abort/ignore stale requests after route/session changes.

Reuse FormField labels, hints/errors, required text, aria-invalid/describedby and role=alert. Buttons have actual accessible names, submit pending states, focus-visible outlines. Announcements use aria-live=polite for success and alerts for errors. ConfirmationDialog has focus trap, Escape cancellation, message description and focus return. Preserve draft after recoverable 400/409/500, don't silently refresh over it. Conflict offers Reload current data and explicitly discard/reconcile; no automatic overwrite or infinite retry.

Status/priority combine text and non-color cues. Private Internal Notes clearly labelled support-only; Actions/current Ticket status events labelled shared with Requester. Reuse controlled priority tones (LOW/MEDIUM/HIGH/URGENT) rather than unrelated status tones. Display UTC-source dates via shared formatter `Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',...})` and show "Times: Asia/Bangkok (UTC+7)". Original server creation timestamp remains inspectable, not user-editable.

## 3. Requester Dashboard `/dashboard`

Heading "My Dashboard", current signed-in Requester summary, last updated/asOf and Refresh. Four cards: "Open tickets", "Waiting for you", "Updated in the last 7 days", "Resolved in the last 7 days". Each card displays exact backend value with an accessible link naming metric/count, not a clickable div. Link destinations from API are allow-listed same-origin relative paths.

Attention list up to5 waiting Tickets; recent list up to5 updated within window. Rows include Ticket Number, summary, status, IT Priority when present and updated time. Show safe owned Detail link. State that these are summaries with My Tickets link; do not duplicate full search/list UI. Zero cards still visible; sections explain "No tickets waiting for you" / "No recent updates". Never show another owner/private note or action revision.

## 4. Staff/Admin Dashboard `/staff/dashboard`

Heading "Support Dashboard", four metric cards: "Unassigned open tickets", "My open tickets", "Urgent open tickets", "My unfinished actions". Status distribution all8 and active-priority distribution all5 including "Not prioritized"; use compact text/count lists, no chart dependency. Count links name the metric/filter.

Recent Tickets up to5 and Urgent Tickets up to5 include Number/summary/status/priority/owner if safe; direct Detail links. My Actions section `id=my-actions` is a paginated list5/page (max20), showing Action description/state/date/Ticket link and accessible Previous/Next/current-page. Links target Ticket Detail `#action-<id>` with focus/scroll after Action is loaded; if off-page, resolve the target's page server-side or fetch authorized target and then load that page, never silently leave anchor on an absent element. Admin shares this view, not a new analytics dashboard.

All counts/lists are API-driven; keep asOf visible. Loading skeletons have screen-reader loading label; skeletons cannot serve as final success screenshots. Failure includes Retry, no misleading zero metrics. Empty/forbidden states are independently tested.

## 5. Actions Taken - Support Ticket Detail

Retain Ticket summary, Owner, IT Priority, status, Comments, private Notes and Attachments. Add Actions Taken section with explicit shared-with-Requester label, item count and pagination. Stable createdAt/id ordering across edits; include completed/cancelled records.

List columns/cards: created date/time; description; assignee/activity; "Performed by" ("Not performed yet" until completion); state; follow-up cue; Result; Follow-up Note; Attachment Notes; controls. Created by shown separately. Terminal cancellation reason shown. Expand long text in place; never render HTML. Row/card `id=action-<id>` supports Dashboard links.

"Add action" opens labelled form: Description required; active support Assignee required (searchable paginated lookup, default current actor only if eligible); Result optional until complete; Follow-up Required checkbox; Follow-up Note conditionally required; Attachment Notes optional text with hint "Describe a file already attached to this Ticket; this does not upload a file". Create time/creator/performer/state are readonly server fields, not editable text boxes. UUID key created once per draft, retained for retry.

PLANNED: Edit, Reassign, Start, Cancel. IN_PROGRESS: Edit, Reassign, Complete, Cancel. COMPLETED/CANCELLED: View only, optional support-only revision disclosure. Terminal parent disables all Action writes and explains reopen policy. Inactive assignee marked with text and blocks start/complete until reassigned.

Edit shows current versions but does not let user edit counters. Field validation adjacent, form-wide safe error visible. Complete dialog shows Result and follow-up rules, explicit confirmation; Cancel dialog requires 5-250-char reason and explicit confirmation. Focus returns to Action card after success. Mutation success refreshes Action and Ticket summary/gate together. Conflict retains draft and states work changed elsewhere.

Audit disclosure is support-only, ordered versions with actor/time/kind and previous snapshot fields. No revision update/delete controls. It is not an advanced history/report UI.

## 6. Requester Ticket Detail Actions

Same current Action content/state/order and all-state pagination, strictly read-only. No Add/Edit/Assign/Start/Complete/Cancel controls or support-only revision request. Public completed work and cancellation reasons visible as contract states. Requester resolution toggle remains separate with aria-pressed/live message; does not turn the Ticket formally RESOLVED. Internal Notes/revisions not rendered or fetched. Foreign Ticket/Action displays indistinguishable not-found.

## 7. Final Ticket workflow

Staff Detail status control includes current status plus server `allowedTransitions` only. Label read-only Requester status. Admin-only cancelled reopen excluded from Staff UI and forbidden on server. On a candidate RESOLVED/CLOSED change, show gate summary (completed/unfinished/follow-up) and specific safe blockers; backend rechecks on save regardless of UI state.

Close/Cancel require confirmation, cancellation dialog explains parent becomes read-only. Legacy zero-action resolved Ticket is not silently repaired: show explanation that truthful work requires permitted Reopen first. Status event timeline uses stable ascending time/id, immutable actor/from/to. Do not conflate Comments, Internal Notes, Actions or status events.

Assignment dropdown uses active support endpoint, not empty injected options; Admin can be Owner. Claim derives actor on server. Version conflicts refresh only with user consent. Disable duplicate mutations until settled. Summary/status/gate update after success without losing unrelated unsaved Action/comment drafts.

## 8. List/drill-down integration and regression

My Tickets offers all8 statuses, explicit All/active/resolved groups where appropriate; time window filters from dashboard visible as removable chips/summary. Queue supports same status group/date fields and unprioritized bucket. Do not silently ignore URL filters. q search debounce250ms; filter changes reset page1; empty state shows active filters and Clear filters. Pagination aria-current works beyond page5, accessible links/buttons and boundaries.

Retain auth login/logout/change-password/expiry/first-login; owned create/list/detail/attachments/comments/resolution; support queue/claim/assign/priority/status/comments/notes; Admin user create/edit/activate/reset/self/last-admin safeguards. Current server auth and CSRF stay in force. Stale/deactivated identities lose access immediately.

## 9. Responsive/visual acceptance

Viewports: desktop1440x900, tablet768x1024, mobile320x800 (handout inheritance; no silent substitution820/390). Desktop >=992px allows multi-column dashboard; 768px two cards when readable; 320px one-column cards/forms. Tables may have contained accessible scrolling or card alternatives, but `document.documentElement.scrollWidth <= innerWidth` always.

Use existing CSS tokens, card spacing/type hierarchy and focus styles. Long Ticket numbers/emails/description/follow-up wrap without overflow. Touch controls >=44px where practical. Do not shrink text to fit screenshots. Dialog fully usable by keyboard and narrow view; no overlapping controls. Visual review is human/agent inspection of rendered PNGs, not just a `:focus` selector assertion.

## 10. Screenshot/evidence inventory

Required folders: `artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken}`; add ticket-workflow and regression subfolders. Major successful screens at all3 viewports: both Dashboards; support Actions list/create/edit; Requester read-only Actions; workflow. Capture representative validation/inactive-assignee/conflict/empty/forbidden/API-failure states as focused evidence, not every duplicate state at every viewport. Capture only after assertions for data loaded/polling counts, never just after navigation.

Manifest columns: relative path, SHA256, commit, UTC capture time, viewport, role, state, AC IDs, Test IDs, command/run ID, redaction check. Pin screenshots to the product tree actually tested; new artifact commit itself does not need to pretend it existed before capture. Use synthetic example.test identities; mask passwords before screenshot, never capture DevTools cookies/tokens/DB URLs. All claims in the final PDF have links/ledger evidence; keep the PDF concise with representative readable panels and repository links for full review threads.
