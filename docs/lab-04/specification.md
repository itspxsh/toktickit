# TokTickIT Lab 4 Engineering Contract — PROPOSED FOR L4-01 PEER REVIEW

Prepared 2026-10-07 against released `main` `da689edc95c7e19a209dc20ec964c04b14590d78` and the instructor's `Lab/Lab4/Lab 4.pdf` (11 pages). This is a proposed contract for L4-01 peer review, not permission to implement. Resolve all open design choices with `justfepwx12`; create implementation Issues only after approval and merge of the L4-01 PR. Lab 4 IDs are namespaced by this directory; they do not replace identically numbered Lab 3 IDs.

## 1. Sprint Goal

Complete the service-desk increment with auditable Actions Taken, backend-enforced Ticket resolution, concise role dashboards, and verified preservation of Labs 1-3. Deliver a coherent Zen Green product with reproducible final-main evidence, not merely a green build or discovered E2E tests.

## 2. Stakeholder Request

The Ticket Owner coordinates the whole Ticket; another authorized member of support may plan, perform, and record individual actions. Requesters see every current Action on their own Tickets without editing support work. Dashboards summarize authoritative operational data and lead to the existing detailed screens. A Requester's resolution indication remains advisory.

## 3. Scope

Included: actions list/create/assign/edit/start/complete/cancel; immutable action revisions and Ticket transition events; final Ticket transition matrix and resolution gate; Requester and Staff dashboards (Admin reuses Staff); safe incremental migration/seed; stale-write protection; role/ownership/security regression; accessible responsive UI; performance smoke; live E2E and final-main close-out.

Excluded: SLA clocks/escalation/on-call/breach notices; external notifications; inventory/purchasing/cost; timesheets/payroll; multi-level approval/e-signatures; advanced BI/report builders/export warehouses; multi-tenancy/cloud operations; self-registration/MFA/SSO/email reset/user deletion/multiple roles. Attachment Notes is text, not a new Action file-upload subsystem. Audit records have no general export/history-management product.

Inherited contracts remain in force except these explicit corrections/extensions:

1. Lab 3 handout permits active IT Staff **or Admin** as Ticket Owner; extend the narrower Lab 3 implementation accordingly. New Ticket IT Priority copies Requested Priority. Preserve legacy null priorities without invented backfill.
2. Requester list supports all eight statuses and precise dashboard filters, replacing the old NEW-only limitation. Existing paths/envelopes/ownership remain.
3. Workflow writes require explicit versions. This deliberately extends existing write payloads; update all in-repo callers/tests together. Do not provide an unversioned bypass.
4. Public health stays public; categories remain authenticated after Lab 3. Adapt the obsolete Lab 1 positive test to a real authenticated fixture and retain an anonymous 401 test. Never weaken authorization to restore an obsolete test.
5. Historical Lab2 E2E Development Requester selection is superseded by real authentication. Port its retained Ticket/Attachment/dirty-form/isolation assertions to authenticated actors, document the supersession, and execute the adapted suite; never restore dev-ID trust or claim the obsolete script passes unchanged.

## 4. Functional Requirements

| ID | Observable requirement |
| --- | --- |
| FR-01 | Staff/Admin list all current Actions on an accessible Ticket; Requester lists all current Actions on an owned Ticket. |
| FR-02 | Staff/Admin create an Action with authenticated creator and active support assignee, independently of Ticket Owner. |
| FR-03 | Staff/Admin edit or reassign non-terminal Actions without silently overwriting another update. |
| FR-04 | Staff/Admin start, complete, or cancel Actions through the approved state machine. |
| FR-05 | Preserve immutable creation data and append a revision for each effective Action change. |
| FR-06 | Enforce the final Ticket state matrix and resolution gate on the server, including direct API calls. |
| FR-07 | Prevent stale claim/assignment/priority/status/action writes and conflicting cross-record operations. |
| FR-08 | Preserve Requester resolution indication and append-only public comments/private notes. |
| FR-09 | Compute Requester-only dashboard metrics and short attention/recent lists. |
| FR-10 | Compute Staff/Admin operational metrics, status/priority distributions, and recent/urgent lists. |
| FR-11 | Show the current support user's unfinished Actions with pagination and Ticket/action links. |
| FR-12 | Make dashboard drill-down URLs reproduce approved filters, including reload/back/forward. |
| FR-13 | Add role Dashboard navigation, permitted workflow controls, and accessible Action forms. |
| FR-14 | Preserve Users, reference data, Tickets/numbers, Attachments/files, Comments and Notes through tested migration. |
| FR-15 | Provide deterministic create-only seed fixtures for statuses/priorities/ownership/actions and empty scopes. |
| FR-16 | Harden previous authentication, attachments, user management, forms, and safe failure states. |
| FR-17 | Deliver unit/API/real-DB/UI/style/responsive/performance/E2E coverage and final-main evidence. |
| FR-18 | Maintain six contract/evidence documents, peer-review history and concise single-PDF submission. |

## 5. Business Rules

| ID | Rule |
| --- | --- |
| BR-01 | Every Action belongs to exactly one existing Ticket; the parent cannot be changed after creation. |
| BR-02 | Action assignee/performer may differ from Ticket Owner. Owner, assignee, creator and actual performer are separate concepts. |
| BR-03 | Only active authenticated IT_STAFF/ADMIN with password-change gate cleared may mutate Actions/workflow. Requesters never write Actions. |
| BR-04 | Requester scope is server session User -> owned Ticket, never a client requester/owner/role ID. All current Actions including cancelled ones are visible on owned Tickets. Internal Notes and audit revisions remain support-only. |
| BR-05 | Actor IDs, creation/update/completion times and audit entries are server-derived. Reject supplied creator/performer/time/parent/version-counter fields except expected-version inputs. |
| BR-06 | Description is trimmed plain text 1-2000 chars; Result 0-2000 (1-2000 on complete); Attachment Notes 0-1000. Reject control characters; render as text, never HTML. |
| BR-07 | Follow-Up Required is boolean. True requires trimmed Follow-up Note 5-2000 chars; false permits empty note. Completing requires false; previous follow-up content survives in revisions. |
| BR-08 | Assignee is required and must be active IT_STAFF or ADMIN at create/reassignment and at start/complete. Deactivated historical people stay visible; existing unfinished Actions require reassignment before start/complete, not automatic reassignment. |
| BR-09 | Action states: PLANNED -> IN_PROGRESS or CANCELLED; IN_PROGRESS -> COMPLETED or CANCELLED. No other transition, deletion or reopening. Creation is PLANNED; terminal records are immutable. Corrections use a new Action on an editable Ticket. |
| BR-10 | performedBy is null until completion, then the authenticated completing actor, not an editable assignee field. createdBy and createdAt never change. Any authorized support actor can act, not only the assignee or Ticket Owner. |
| BR-11 | Cancel requires explicit confirmation and plain-text reason 5-250 chars; preserve reason and actor/time in the terminal revision. Complete requires explicit confirmation and nonblank Result. |
| BR-12 | Current Actions order by createdAt ASC, id ASC; revisions by version ASC; status events/comments/notes by createdAt ASC, id ASC. Never reorder by latest edit. |
| BR-13 | An effective create/edit/assignment/transition appends exactly one immutable ActionRevision in the same transaction. No-op edits return current data without increment or duplicate revision; a repeated transition with stale versions returns conflict, never a second event. |
| BR-14 | Unsafe requests require existing server session, password-change gate, role/ownership and Origin + CSRF checks; GET never mutates. Real middleware tests are required, not only stubbed authorization. |
| BR-15 | Ticket states remain NEW, OPEN, IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CLOSED, REOPENED, CANCELLED. Use the exact matrix below. |
| BR-16 | Only ADMIN can CANCELLED -> REOPENED; other listed transitions allow IT_STAFF/ADMIN. Requesters cannot set formal status. To CANCELLED and RESOLVED -> CLOSED require confirm=true (retain the existing API field name). |
| BR-17 | To RESOLVED or CLOSED: at least one COMPLETED Action with nonblank Result, zero PLANNED/IN_PROGRESS Actions, and no follow-up flag on non-cancelled work. Cancelled work is no longer outstanding, but all-cancelled or zero-action Tickets still fail. Requester indication is neither required nor sufficient. |
| BR-18 | Action mutations allowed only while parent is NEW/OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER/REOPENED. RESOLVED/CLOSED/CANCELLED are read-only. Legacy RESOLVED without work must be reopened and supplied truthful work before closing; never fabricate work or change legacy status in migration. |
| BR-19 | Every effective Ticket claim/assignment/priority/status and Action mutation takes the same parent-row lock and checks workflowVersion. Action edit/transition also checks Action.version. Increment counters atomically; no timestamps as optimistic-lock tokens. |
| BR-20 | Serialize parent first, then child. Resolution check and status update share one transaction/lock with Action creation/update. Assert real parallel requests: no lost update, sixth active attachment, or resolve-with-unfinished-action success. |
| BR-21 | Create Action requires UUID clientRequestId unique within Ticket. Same actor/key/canonical payload replay returns 200 and the existing Action; differing payload/actor returns 409. Authorize before replay; check replay before expected version so a lost successful response can be retried. |
| BR-22 | Safe 400 validation, 401 session, 403 role/CSRF, indistinguishable 404 ownership/missing resource, 409 stale/workflow/idempotency conflict, 500 generic failure; no stack, SQL, storageKey, secrets, session data or raw bigint. |
| BR-23 | Active Ticket set = NEW/OPEN/IN_PROGRESS/WAITING_FOR_REQUESTER/REOPENED. Resolved set = RESOLVED/CLOSED. CANCELLED is neither. Dashboard definitions below use these sets consistently. |
| BR-24 | Requester scope includes only that active session User's linked Requester and owned Tickets. Staff scope matches queue/detail: active Requester and linked active requester User. Inactive/unlinked legacy owners are retained but absent from operational scope, not deleted. |
| BR-25 | Dashboard counts and lists come from one repeatable-read database snapshot, not loaded client collections. Backend chooses asOf (UTC); seven-day window is [asOf - 7*24h, asOf). UI displays dates explicitly in Asia/Bangkok. |
| BR-26 | Requester cards: activeTickets, waitingForRequester, updatedLast7Days, resolvedLast7Days. Attention list = waiting Tickets; recent list = updatedLast7Days; each at most 5, updatedAt DESC/id DESC. See metric queries below. |
| BR-27 | Staff cards: unassignedActive, ownedActive (current actor), urgentActive, myUnfinishedActions. Include all-eight status and four-priority + UNPRIORITIZED active buckets; recent 5 Tickets and urgent 5 active Tickets. |
| BR-28 | My unfinished Actions = current assignee, state PLANNED/IN_PROGRESS, operationally visible active parent. Paginate 5, max 20, createdAt ASC/id ASC. Count Actions (not distinct Tickets); dashboard card anchors this paginated section. |
| BR-29 | All counts are >=0; missing data means count 0 and lists []; never render missing values as a successful zero on API failure. Admin reuses Staff metrics, no extra admin analytics. |
| BR-30 | List filters are ANDed and allow-listed; requester default status becomes all; page=1/pageSize=20/max100. statusGroup=active|resolved, updatedSince/resolvedSince are validated UTC ISO timestamps; conflicting status and statusGroup returns 400. |
| BR-31 | Dashboard responses include backend drillDown links built from controlled paths/filters. Browser parses only approved relative URLs; foreign origins cannot become navigation targets. Query state survives reload and browser history. |
| BR-32 | resolvedAt is set on each fresh transition to RESOLVED, retained on CLOSED, cleared on REOPENED. Legacy null = unknown; exclude unknown dates from recent-resolved only, never infer actual resolution date from updatedAt. |
| BR-33 | Migration is forward-only/additive; preserve earlier row IDs/data, sequence progression, file bytes and relations. No DROP/TRUNCATE of application tables. New workflowVersion defaults to 1; no fabricated Actions/status events. |
| BR-34 | Seed only inserts missing named fixtures, never changes existing passwords/activation/owner/status/work. Include all eight Ticket statuses, four priorities, null legacy priority, zero/one/many Actions, support/admin/different-performer and empty Requester scope. |
| BR-35 | Test reset/drop allowed only in explicitly guarded *_test databases independently of NODE_ENV; all test suites that reset share no DB concurrently. No dev database reset or seed overwrites to make screenshots pass. |
| BR-36 | Public Comments/Internal Notes stay append-only with server author/time; Requester never receives private notes/revisions. Existing attachment five-active/5 MiB/path/signature/ownership/removal rules remain, including atomic capacity and best-effort post-removal file cleanup. |
| BR-37 | Preserve form input after recoverable failure; disable repeated submit; retry create with same key until success/payload changes. 409 preserves draft and requires refresh/review, never silent automatic overwrite. |
| BR-38 | Keep Zen Green tokens, labelled controls, non-color status cues, visible focus, keyboard dialogs and no page overflow at 320/768/1440px. |
| BR-39 | New dependencies require justification in the Issue/PR. Use existing Express/Prisma/PostgreSQL/React/Vitest/Playwright/Intl/crypto, not new routing/chart/state libraries by default. |
| BR-40 | Completion requires actual zero-fail/zero-skip/zero-retry validation, traceable screenshots/output and independent peer review; discovery-only, historical evidence and environmental blockage cannot be reported as green live runs. |

### Final Ticket matrix (all unlisted transitions forbidden)

| From | Destinations (IT_STAFF/ADMIN unless noted) |
| --- | --- |
| NEW | OPEN, IN_PROGRESS, CANCELLED |
| OPEN | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| IN_PROGRESS | WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| WAITING_FOR_REQUESTER | OPEN, IN_PROGRESS, RESOLVED |
| RESOLVED | CLOSED, REOPENED |
| CLOSED | REOPENED |
| REOPENED | IN_PROGRESS, WAITING_FOR_REQUESTER, RESOLVED, CANCELLED |
| CANCELLED | REOPENED (ADMIN only) |

Same-value status save is a version-checked 200 no-op before transition/gate checks, no new event; UI offers current value plus only permitted destinations. Resolution gate applies to actual listed transitions into RESOLVED/CLOSED, not a no-op that preserves truthful legacy state. Assignment and priority changes use versions, cannot mutate terminal Tickets, and allow active IT_STAFF/ADMIN owners. Claim remains atomic unassigned-only.

### Dashboard calculation and destination contract

`S` = server-authorized scope (BR-24); `A` = active set; `R` = resolved set; `W` = UTC window above. Counts are distinct Tickets except myUnfinishedActions. Dates use >= lower and < upper; list drill-downs carry both lower `*Since` and upper `before=asOf` to preserve time-window semantics.

| Metric | Exact predicate in S | Drill-down |
| --- | --- | --- |
| activeTickets | currentStatus in A | /tickets?statusGroup=active |
| waitingForRequester | currentStatus=WAITING_FOR_REQUESTER | /tickets?status=WAITING_FOR_REQUESTER |
| updatedLast7Days | updatedAt in W, all statuses | /tickets?updatedSince=lower&before=asOf |
| resolvedLast7Days | currentStatus in R AND resolvedAt in W | /tickets?statusGroup=resolved&resolvedSince=lower&before=asOf |
| unassignedActive | status in A AND assignedStaffId=null | /staff/tickets?statusGroup=active&assignment=unassigned |
| ownedActive | status in A AND assignedStaffId=actor.id | /staff/tickets?statusGroup=active&assignment=mine |
| urgentActive | status in A AND itPriority=URGENT | /staff/tickets?statusGroup=active&itPriority=URGENT |
| myUnfinishedActions | Action.assigneeId=actor.id AND Action.state unfinished AND parent in S/A | /staff/dashboard#my-actions |

Status distribution covers S across all statuses; priority distribution covers S/A, includes null UNPRIORITIZED. Buckets link to corresponding queue filters (itPriority=UNPRIORITIZED allowed). Staff recent includes S/all statuses ordered updatedAt DESC/id DESC; urgent list uses S/A/URGENT ordered updatedAt DESC/id DESC. Window counts can change after later edits; snapshot consistency is per response, not a promise to freeze future transactions after clicking a link.

## 6. UI Specification Summary

See `ui-spec.md`. Dashboard is signed-in landing screen; Service status remains a labelled diagnostic. Requester Dashboard/My Tickets/Create/Detail remain distinct. Staff/Admin have Dashboard/Queue/Detail, Admin additionally Users. Actions is a real Detail section, not a placeholder. Create/edit retain drafts on errors; terminal Actions have no editable controls; Requester sees read-only public Action content, not revision log/private notes. Show permitted transitions, actionable gate failures, refresh confirmations and stale conflict recovery.

## 7. Data Changes

Proposed Prisma additions (all timestamps `DateTime @db.Timestamptz(3)`, text lengths enforced application + SQL CHECK where expressible):

* Ticket: workflowVersion Int NOT NULL DEFAULT 1; resolvedAt nullable. Keep existing ticketSequence allocator, requester/owner fields and data.
* ActionTaken: Int id, ticketId FK RESTRICT, UUID clientRequestId, payloadFingerprint text, createdById FK, assigneeId FK, performedById nullable FK, description/result/followUpRequired/followUpNote/attachmentNotes, state enum, cancellationReason nullable, completedAt/cancelledAt nullable, version Int DEFAULT 1, createdAt/updatedAt. Unique(ticketId,clientRequestId). Index(ticketId,createdAt,id), (assigneeId,state,createdAt,id). All User FKs ON DELETE RESTRICT/ON UPDATE CASCADE; deleted User product not supported.
* ActionRevision: id, actionId FK RESTRICT, version, actorId FK RESTRICT, kind CREATE|EDIT|ASSIGN|START|COMPLETE|CANCEL, snapshot Json, createdAt. Unique(actionId,version). Snapshot contains safe action content plus IDs, not credentials. One effective request that edits and reassigns is one EDIT revision containing both changes; ASSIGN reserved for assignment-only change.
* TicketStatusEvent: id, ticketId FK RESTRICT, fromStatus/toStatus, actorId FK RESTRICT, createdAt; index(ticketId,createdAt,id). Only new effective transitions emit events.
* Ticket indexes: (requesterUserId,resolvedAt,id), (currentStatus,resolvedAt,id); retain useful existing composite indexes; verify query plans before adding overlapping indexes.
* SQL CHECKs: positive versions, follow-up note requirement, terminal result/performer/timestamps, mutually exclusive completed/cancelled metadata, nonblank description, bounded text. Cross-row active assignee/role and resolution predicate require transaction code, not fictional SQL CHECK subqueries.

Design decision 1: normalized Action parent-child with explicit assignee and actual performer preserves ownership separation and enables indexed current-user work queries. Decision 2: current mutable projection + immutable revision/event records reconciles required edit with append-only evidence without rewriting historical content. Decision 3: shared parent lock + explicit counters protects aggregate resolution from write skew/ABA; independent unique fields or status-only comparisons do not. Decision 4: null legacy resolvedAt means unknown rather than fabricated analytics.

Migration tests snapshot every earlier table's rows/important columns, ticket sequence and fixture file hashes before applying the **new** migration; compare after (except new columns). Cover empty deployment and Lab 3 upgrade with removed Attachments, inactive Users, comments/notes and every Ticket status. Verify rollback of failed mutation, seed rerun/deactivation preservation and real concurrent writes. Do not edit already-applied migration files. Recovery = verified backup/restore into a separate guarded database or a forward corrective migration; never destructive down-migration as normal rollback.

## 8. API Contract

`api-spec.md` pins paths, bodies, versions, safe projections and errors. Existing auth remains authoritative. No client identity/author/time/status privilege is trusted. Action create accepts data + assignee + idempotency key + expectedTicketVersion; state changes have their own endpoint. Dashboard queries return aggregates and bounded summaries, not full collections. Older write callers are upgraded atomically with version requirements, and old omission now deliberately returns 400.

## 9. Acceptance Criteria

| ID | Acceptance criterion |
| --- | --- |
| AC-01 | Valid Staff/Admin create yields one PLANNED child under the intended accessible Ticket, server creator/time and active support assignee. |
| AC-02 | Another support assignee/performer, not Ticket Owner, can record work; inactive/non-support assignees fail without mutation. |
| AC-03 | All required field boundaries, follow-up conditions, server-only fields and plain-text rendering are enforced. |
| AC-04 | Only approved Action transitions succeed; complete requires Result/no-follow-up, cancel requires reason/confirmation; terminal edits fail. |
| AC-05 | Actions/revisions/status events have stable order, immutable original metadata and append-only history. |
| AC-06 | Requesters see all owned current Actions, never private history/notes and cannot write; cross-owner reads match missing-resource errors. |
| AC-07 | Every Ticket transition pair/role is tested; UI only offers permitted targets, including Admin-only cancelled reopen. |
| AC-08 | Zero/all-cancelled/unfinished/follow-up work blocks resolve/close; valid completed work permits it; Requester indication cannot bypass it. |
| AC-09 | Stale workflow/action writes, simultaneous claims, action-create versus resolve, and duplicate create retries cannot silently corrupt work. |
| AC-10 | Requester metrics/lists reflect only own data, exact UTC windows, legacy unknown dates, empty scope and working drill-downs. |
| AC-11 | Staff/Admin metrics, buckets, recent/urgent lists and current-user Actions match independent database calculations. |
| AC-12 | Dashboard/list filters survive reload/back/forward, AND correctly and return safe validation failures. |
| AC-13 | Login/gates/role navigation/dashboard links/diagnostic work without client identity storage or dead controls. |
| AC-14 | All major screens meet loading/empty/no-results/validation/success/forbidden/not-found/error/conflict feedback and draft preservation. |
| AC-15 | Additive migration preserves all earlier rows/relationships/files/numbers/sequence; legacy zero-action Tickets stay truthful. |
| AC-16 | Seed reruns create no duplicates and overwrite no existing credentials/activation/work; demonstrate zero/one/many and all statuses/priorities. |
| AC-17 | Complete Labs 1-3 regression remains green under the current authenticated contract, including attachment races/cleanup and user safeguards. |
| AC-18 | No forged session/role/owner/actor/time, XSS, CSRF or unsafe projection breaks server authorization; failures expose no secrets. |
| AC-19 | 320/768/1440px UI is coherent Zen Green, keyboard usable, non-color distinguishable and free from page overflow. |
| AC-20 | Dashboard/list query counts are bounded without N+1 and performance smoke has recorded fixture size/timing/query plan. |
| AC-21 | Live full browser matrix passes with zero retries/skips and rendered/redacted/screenshots have exact source provenance. |
| AC-22 | Every AC maps to actual planned tests, every implemented test has real result evidence, contracts preceded implementation. |
| AC-23 | All implementation/release PRs have independent review and merge history; Issue-only Kanban ends Done. |
| AC-24 | Final released main is validated and documentation-only close-out plus one concise Answer Part 1-9 PDF retain traceable evidence. |

## 10. Product Definition of Done

* L4-01 approved before implementation; all decisions below agreed, no contradictory contract files.
* All ACs traced to real files/tests; focused + complete unit/API/UI + migration/integration + performance + live E2E pass without skips/flakes/retries. Record actual totals, never predict green counts from plan.
* Latest released product commit pinned; screenshots wait for loaded data, show all required states/roles/viewports, independently reconciled counts. Logs/PNGs reviewed for secrets.
* Forward migration/recovery evidence retained. Earlier product preserved; exceptions resolved, not labelled environmental non-regression indefinitely.
* All PRs reviewed by justfepwx12, Issues completed, board Issue-only, final-main records and README current; no product change hidden in documentation-only PR.
* Exactly one concise readable PDF: Answer Part 1 through 9, working commit-pinned links, rendered spec/tests/UI/reviewer/AI records, 6-10 genuine selected prompts and brief My Reflection. No copied partner facts/identities/screenshots.

## 11. Assumptions and Decisions Requiring L4-01 Approval

The PDF mandates fields, assignment/edit/status/complete/cancel, append-only behavior and a backend resolution rule but does not choose their detailed design. Proposed BR-07..13, BR-17..21, legacy rule BR-18/32, dashboard formulas/windows and text limits are **our choices**, not quoted instructor rules. Approve or revise all four contract drafts together before coding. The performer-on-completion interpretation labels incomplete work as "Not performed yet" and separately shows the server creator; if reviewer interprets Performed by as the recording actor, resolve now, not mid-implementation. Do not invent a performed historical action for a plan.

Use no new runtime dependency initially. Preserve existing three roles; Admin shares support behavior, never requester impersonation. Local-only Secure-cookie override remains explicit development configuration; do not weaken production defaults. The planning audit ran no destructive DB reset and no fresh live E2E; its baseline is not release evidence.
