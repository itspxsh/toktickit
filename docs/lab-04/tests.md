# TokTickIT Lab 4 Test Contract — APPROVED THROUGH L4-01 PEER REVIEW

The contract was approved through L4-01 peer review. The inventory below defines expected behavior and its canonical test path; current execution state is recorded in `reviewer.md` and commit-pinned artifacts. IDs are Lab 4-local. Bind each test ID to an actual named `it/test` or parameterized case and exact file; retain failed-red then green output/commits. Contract tests must not pass only because of unconditional stubs.

> Status: this test contract was approved through L4-01 peer review. The matrix records required behaviors and intended files; actual validation counts and red/green evidence are maintained in `reviewer.md` and the corresponding PRs.

## 1. Test file responsibilities

* `server/tests/lab-04/actions.unit.test.ts`: field normalization, state/gate predicates, strict parsing and canonical fingerprint.
* `server/tests/lab-04/actions-taken.api.test.ts`: create/read/edit/assignment/transitions/replays/real auth+CSRF wiring and query predicates.
* `server/tests/lab-04/ticket-workflow.api.test.ts`: complete role/transition matrix, gate, explicit versioned existing writes.
* `server/tests/lab-04/requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts`: scopes/formulas/windows/bounded responses/filters.
* `server/tests/lab-04/migration.integration.test.ts`: real PostgreSQL upgrade/deploy/seed/recovery fixtures.
* `server/tests/lab-04/workflow-concurrency.integration.test.ts`: real transactions and races using separate connections/barriers.
* `server/tests/lab-04/dashboard.integration.test.ts`: independently calculated metrics and performance-smoke fixture.
* `server/tests/lab-04/previous-labs.api.test.ts`: intended authenticated regression/priority/owner/attachment edge cases.
* `client/tests/lab-04/{ActionsTaken,TicketWorkflow,RequesterDashboard,StaffDashboard,DashboardRouting,Regression,previous-labs,VisualAccessibility}.test.tsx`: UI behavior with honest network fixture mocks; layout acceptance additionally live E2E + PNG review. This matches `client/vite.config.ts` include `tests/**/*.test.tsx`; do not put tests under src where they would be undiscovered.
* `e2e/lab-04/{actions-taken-flow,ticket-resolution,dashboards}.spec.ts`: three live end-to-end journeys, three approved viewports; nine executions if exactly one test per file. Add tests only with updated discovery/expected count; never force a claimed 9 when actual suite differs. Also execute adapted `e2e/lab-02/requester-ticket-flow.spec.ts` and all `e2e/lab-03/*.spec.ts` for final live regression. Supersede removed Development Requester identity steps with authenticated fixtures, preserving Ticket/Attachment behaviors and historical artifacts.
* `scripts/lab-04/verify-contract.mjs`: cross-file ID/path/coverage and docs-only close-out diff checks, no product privileges.

## 2. Unit / API test inventory

| ID | AC | Named behavior / expected outcome | Exact path (under server/tests/lab-04/) |
| --- | --- | --- | --- |
| T-UNIT-01 | 03,04 | Trim and boundary cases, merged follow-up rule, immutable field rejection; complete/cancel predicates. | actions.unit.test.ts |
| T-UNIT-02 | 07,08 | Every from/to/role pair and resolution gate truth table, including zero/all-cancelled/follow-up. | actions.unit.test.ts |
| T-UNIT-03 | 09,12 | Fingerprint deterministic across normalized payloads, ignores expected version, differs on content/assignee; query dates/URLs allow-list. | actions.unit.test.ts |
| T-ACT-01 | 01,02 | Create correct parent/actor/time/PLANNED/version and different active support assignee; 201 safe shape. | actions-taken.api.test.ts |
| T-ACT-02 | 02,03 | Create/reassignment reject inactive, Requester, missing, or invalid assignees; both candidate-query predicates are asserted; forged actor/time/state/parent rejected; zero writes. | actions-taken.api.test.ts |
| T-ACT-03 | 03 | Description/result/follow-up/attachment-note upper bounds, boolean and UUID validation, control-character rejection, empty-patch rejection, follow-up note requirements, merged patch validation; 400 before data access. | actions-taken.api.test.ts; actions.unit.test.ts |
| T-ACT-04 | 04 | Start/complete/cancel permitted edges; terminal parent/Action and invalid edges fail; complete requires confirmation, performer=actor, Result and no follow-up; cancel requires confirmation/reason. Completion uses parent/action/version guarded updateMany. | actions-taken.api.test.ts |
| T-ACT-05 | 05 | Stable `createdAt`/`id` list ordering; server-derived immutable creation fields remain untouched on edit; one revision per effective mutation (EDIT for combined, ASSIGN for assignment-only); no delete route; no-op unchanged. | actions-taken.api.test.ts |
| T-ACT-06 | 06,18 | Owned Requester read includes terminal `CANCELLED` Actions; cross-owner/missing Ticket and child errors equal; no revisions/notes/secrets; requester writes 403. | actions-taken.api.test.ts |
| T-ACT-07 | 09 | Same key/payload/actor returns one 200 replay; different payload/actor (including a P2002 create race) returns 409; replay is re-authorized and precedes stale-version checks; Ticket and Action stale versions are independently rejected before writes. | actions-taken.api.test.ts |
| T-ACT-08 | 05,09 | Forced invalid revision actor fails specifically with PostgreSQL FK error P2003 and rolls back Action content/version, Ticket workflowVersion, and revision count; parent/action predicates are asserted by API mutation tests. | workflow-concurrency.integration.test.ts; actions-taken.api.test.ts |
| T-ACT-09 | 06 | Requester/Staff Action-list defaults, focusActionId page resolution, and pageSize 1..100 boundary; Staff revision defaults and pageSize 1..100; invalid/unknown query returns 400 before data access. | actions-taken.api.test.ts |
| T-WF-01 | 07 | Parameterized 8x8x3 role matrix, invalid/malformed/unchanged state, Admin-only cancelled reopen. | ticket-workflow.api.test.ts |
| T-WF-02 | 08 | Zero/all-cancelled/unfinished/follow-up fail; eligible work permits resolve/close; advisory flag does not bypass gate. | ticket-workflow.api.test.ts |
| T-WF-03 | 07,09 | Version required for claim/assignment/priority/status, stale409, atomic unassigned claim; terminal writes blocked; query conditions asserted. | ticket-workflow.api.test.ts |
| T-WF-04 | 05,15 | Legacy statuses unchanged; reopen then truthful work policy, resolvedAt lifecycle, ordered public status events. | ticket-workflow.api.test.ts |
| T-DASH-R-01 | 10 | Exact own 4 metrics/2 lists, foreign user/ticket isolation, summary-only projection, all-zero scope. | requester-dashboard.api.test.ts |
| T-DASH-R-02 | 10,12 | UTC inclusive lower/exclusive upper seven-day bounds, unknown legacy resolvedAt excluded only from recent card; drill-down equality. | requester-dashboard.api.test.ts |
| T-DASH-S-01 | 11 | Staff/Admin own/unassigned/urgent/status/priority/null buckets and five-item recent/urgent lists match fixtures. | staff-dashboard.api.test.ts |
| T-DASH-S-02 | 11,12 | My Actions counts child rows not distinct Tickets, supports page beyond first, ignores foreign assignee; active parent predicate. | staff-dashboard.api.test.ts |
| T-DASH-S-03 | 10,11 | Empty scopes zeros/[], safe failures not fake zeros, authenticated role mismatch403. | staff-dashboard.api.test.ts |
| T-DASH-S-04 | 11,18 | Staff Ticket list, dashboard, direct detail, workflow and Actions access/rechecks consistently require an active Requester linked to an active REQUESTER User; inactive/unlinked legacy owners remain hidden. | staff-dashboard.api.test.ts; ticket-workflow.api.test.ts; actions-taken.api.test.ts |
| T-QUERY-01 | 12 | Both list APIs all statuses/groups/time bounds/before/null priority/AND/pagination, exact authorization where/select/order asserted. | requester-dashboard.api.test.ts |
| T-SEC-01 | 06,18 | Real middleware representative protected GET/write checks: registrar default is fail-closed; shared requester route guard performs one session/requester lookup; anonymous/expired/inactive401, first-login403, and Requester-vs-support role403. | actions-taken.api.test.ts |
| T-SEC-02 | 18 | Real write wiring rejects missing/wrong CSRF and foreign Origin independently before mutation; session role change is effective on the next request. | actions-taken.api.test.ts |
| T-SEC-03 | 03,18 | Forged creator/performer/state/parent and unknown query fields are rejected before data access; strict body allow-list, correlation-only unexpected-error logging, and secret-free response projections. Plain-text/control validation is in T-UNIT-01. | actions-taken.api.test.ts; actions.unit.test.ts |
| T-REG-01 | 13,17 | Authenticated categories/diagnostic and anonymous401/public health; new Ticket itPriority=requestedPriority; active Admin Owner accepted. | previous-labs.api.test.ts |
| T-REG-02 | 17 | Attachment post-removal unlink failure still succeeds, ENOENT stays quiet, other cleanup errors are logged without private paths, and removed content remains inaccessible; five-active capacity concurrency is covered in T-RACE-04. | previous-labs.api.test.ts; lab-02/attachments.api.test.ts |

## 3. Real PostgreSQL integration / migration / performance

| ID | AC | Fixture and assertion | Exact file under server/tests/lab-04/ |
| --- | --- | --- | --- |
| T-MIG-01 | 15 | Fresh DB deploy entire unchanged historical chain + new migration, schema constraints/enums/indexes/FKs/versions; no destructive application SQL. | migration.integration.test.ts |
| T-MIG-02 | 15 | Deploy through Lab3, insert/snapshot earlier tables including inactive users/removed attachment/files/comments/notes/every status; deploy Lab4; compare IDs/content/relations/sequence/file hashes, zero synthetic Actions/events. | migration.integration.test.ts |
| T-MIG-03 | 15,16 | Seed twice counts/keys stable, preserve explicitly changed activation/password/status/owner/actions; zero/one/many all status/priority fixtures. | migration.integration.test.ts |
| T-MIG-04 | 15 | Invalid child/version/check-constraint insert fails; failed multi-row write rolls back; verify restore into separate guarded DB from snapshot and document forward correction. | migration.integration.test.ts |
| T-MIG-05 | 15,18 | Missing or non-test DB rejected independent NODE_ENV before destructive operation; no parallel reset of same DB. | migration.integration.test.ts |
| T-RACE-01 | 09 | Two connections update same Action version: one200, one409, one revision increment, no lost content. | workflow-concurrency.integration.test.ts |
| T-RACE-02 | 08,09 | Barrier-synchronized Action create versus resolve: serialization yields stale/read-only/gate conflict, never resolved with unfinished Action at commit. | workflow-concurrency.integration.test.ts |
| T-RACE-03 | 09 | Competing claim/assignment/priority/status and ABA use version CAS; verify rollback/events; candidate deactivation race cannot commit an invalid new assignment. | workflow-concurrency.integration.test.ts |
| T-RACE-04 | 17 | Two uploads competing for fifth slot produce capacity<=5 and compensate file/DB safely; the integration test covers the race, while the Lab 2 API test asserts the route invokes the lock query and rejected writes leave no orphan objects. | workflow-concurrency.integration.test.ts; lab-02/attachments.api.test.ts |
| T-DB-DASH-01 | 10,11 | Independent SQL aggregates at fixed clock reconcile API metrics and drill-down counts under same scope; repeatable snapshot race doesn't mix counts/lists. | dashboard.integration.test.ts |
| T-PERF-01 | 20 | Dedicated fixture5000 Tickets/10000 Actions; <=8 Requester/<=14 Staff data queries per response (excluding BEGIN/COMMIT); no per-row N+1. 5 warmups+20 timed calls, p95<=500ms on recorded local machine; retain EXPLAIN ANALYZE and measured counts, don't raise budget to hide a regression. | dashboard.integration.test.ts |

Do not run destructive migration files concurrently against one DB. Execute separate suite commands serially, or use distinct guarded databases per worker. PostgreSQL required, absence fails with useful message, never `skip`. Existing semicolon-split migration harness must not execute new procedural SQL; prefer repository-local Prisma migrate deploy / psql -v ON_ERROR_STOP=1 and test migration on a fresh guarded database. Preserve all historical migration checks, no editing deployed files.

## 4. UI/component/style test inventory

| ID | AC | Named behavior | File under client/tests/lab-04/ |
| --- | --- | --- | --- |
| T-UI-ACT-01 | 01,03,14 | List/create form labels, follow-up conditional validation, active assignee lookup, 201 feedback, preserves draft on400/500. | ActionsTaken.test.tsx |
| T-UI-ACT-02 | 02,04 | Different support assignee; inactive cue/reassignment, start/complete/cancel conditions/dialogs; terminal readonly. | ActionsTaken.test.tsx |
| T-UI-ACT-03 | 05,06 | Stable all-state list/pagination, Requester readonly and no audit/private fetch; support revision disclosure. | ActionsTaken.test.tsx |
| T-UI-ACT-04 | 09,14 | Pending disables duplicate submit, same key on recoverable retry; 409 preserves draft and offers explicit refresh/reconcile. | ActionsTaken.test.tsx |
| T-UI-ACT-05 | 14 | A successful parent Ticket status mutation refreshes the Actions panel's ticket version so the next Action write does not use a stale version. | ActionsTaken.test.tsx |
| T-UI-WF-01 | 07,08 | Only permitted targets, Admin-only reopen, gate messages, close/cancel confirm and success summary refresh. | TicketWorkflow.test.tsx |
| T-UI-WF-02 | 07,09,14 | Versioned assignment/priority/claim/status requests, stale notice reset on Ticket navigation, no overwrite of unsaved forms. | TicketWorkflow.test.tsx |
| T-UI-DR-01 | 10,14 | Own cards/attention/recent links, exact values, malformed-payload rejection, strict UTC/calendar/range validation for server-provided drill-down dates, loading vs empty vs failure/retry/forbidden. | RequesterDashboard.test.tsx + DashboardViews.test.tsx + DashboardHardening.test.tsx |
| T-UI-DS-01 | 11,14 | Staff/Admin cards/buckets/recent/urgent/My Actions pagination links, rejects unsafe pagination values before fetch, and empty/error/forbidden. | StaffDashboard.test.tsx + DashboardViews.test.tsx + DashboardHardening.test.tsx |
| T-UI-NAV-01 | 12,13 | Server-derived role landing/guard/nav aria-current, query/hash/back/forward reload, dirty-form Back guard whose confirmation returns to the existing history entry without duplicating it, canonical URL replacement (no Back-loop), no localStorage identity. | DashboardRouting.test.tsx + DashboardHardening.test.tsx |
| T-UI-NAV-02 | 12,14 | URL filters visibly applied/clearable/canonicalized (unknown keys, invalid UTC dates, contradictory status/group and date ranges, lower-bound requires `before`, valid before-only, future-bound limit, requester IDs/priority), search debounce, page>5 aria-current and same-path navigation. | DashboardRouting.test.tsx + DashboardViews.test.tsx |
| T-UI-REG-01 | 13,17 | Failed authentication clears the password and exposes only the safe API message; authenticated requester E2E asserts rejected and successful per-file upload outcomes, View Ticket URL, summary/description/number detail values, dirty-form Cancel URL, resolution, attachment lifecycle, and cross-requester not-found screenshot; Staff public-comment/internal-note flows remain covered by Lab 3 E2E. | Regression.test.tsx; e2e/lab-02/requester-ticket-flow.spec.ts; e2e/lab-03/staff-ticket-flow.spec.ts |
| T-UI-REG-02 | 13,17 | Authenticated category diagnostics and Create Ticket reference requests include browser credentials required by the protected Lab3 endpoints. | previous-labs.test.tsx |
| T-STYLE-01 | 19 | Status and priority use distinct accessible text labels and visible non-color glyphs with the shared status-badge visual tokens; existing L1–4 tests cover labels/errors/read-only semantics and no placeholder controls. | VisualAccessibility.test.tsx; existing L1–4 client suites |
| T-A11Y-01 | 14,19 | Keyboard focus trap, Escape, focus restoration, dialog description, live notices and metrics links accessible names. | VisualAccessibility.test.tsx; existing L1–4 client suites |

## 5. Live E2E / responsive / evidence

| ID | AC | Required executed journey/evidence | File |
| --- | --- | --- | --- |
| T-E2E-01 | 01..06,09,18 | Support creates multiple Actions on unique fresh Ticket, reassigns different support user, edits, starts/completes one, cancels another; Requester sees all read-only; direct unauthorized write denied. | e2e/lab-04/actions-taken-flow.spec.ts |
| T-E2E-02 | 08,09,13,14,17 | Requester create -> support work -> blocked zero/unfinished resolution -> complete work -> resolve -> support adds a persisted public comment -> Requester sees comment/advisory/read-only Actions -> close -> Admin-only CANCELLED→REOPENED. The complete transition/role matrix belongs to T-WF-01; this journey does not claim to exercise every pair. | e2e/lab-04/ticket-resolution.spec.ts |
| T-E2E-03 | 10..14,17 | Requester dashboard all four metrics reconcile to its owned Ticket list; Staff and Admin share the support dashboard and independently reconcile current-user/unassigned/urgent metrics plus all status/priority buckets; bounded Recent/Urgent/Actions lists, role-specific UI, drill-down/back, ownership, responsive layout and visible keyboard focus. | e2e/lab-04/dashboards.spec.ts |
| T-RESP-01 | 19,21 | All three files on1440x900/768x1024/320x800, no page overflow and usable menu/forms/dialogs; inspect loaded PNGs, not only DOM. | e2e/lab-04/actions-taken-flow.spec.ts; e2e/lab-04/ticket-resolution.spec.ts; e2e/lab-04/dashboards.spec.ts |
| T-EVID-01 | 21 | Commit-pinned redacted manifest for real screenshots/logs/migration/metrics; loaded-state assertions precede capture; no skipped/flaky/retried test masked as green. | scripts/lab-04/verify-contract.test.mjs + artifact inspection |
| T-CONTRACT-01 | 22 | Every FR/BR/AC and Test ID resolves to implementation Issue/file/test and final status; no nonexistent paths or duplicate IDs. | scripts/lab-04/verify-contract.test.mjs |
| RELEASE-01 | 23,24 | Reviewed staged integration, final-main full validation at pinned product SHA, docs-only close-out verified, Issue-only Done board and single Answer Part1..9 PDF links/redactions. | scripts/lab-04/verify-contract.mjs + reviewer/QA evidence |

Screenshot-only simulated failure states may use Playwright request interception **labelled simulated**; never present them as a live backend outage. Actual happy-path/race/migration evidence must use live backend/DB. E2E preserves/recreates test-scoped fixtures instead of depending on old first-login passwords or toggling a persisted boolean blindly. Use isolated scenario records and workers1/retries0. Screenshot assertions await actual rows/counts before save.

## 6.1 Contract implementation index

This index is a coarse but executable bridge across implementation Issues; fine-grained behavior stays in the unit/API/UI/E2E rows above and the AC crosswalk below. The verifier expands each listed requirement range and rejects missing/duplicate mappings, nonexistent paths, unknown test IDs, or absent status.

| Requirement ID | Issue | Implementation files | Test IDs | Status |
| --- | --- | --- | --- | --- |
| FR-01..FR-08 | #62, #63, #65 | `server/src/routes/actions-taken.ts`; `server/src/routes/tickets.ts`; `client/src/actions-taken.tsx`; `client/src/requester-ticket-detail.tsx` | T-ACT-01, T-ACT-04, T-WF-01, T-UI-ACT-01, T-UI-WF-01, T-E2E-01, T-E2E-02 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| FR-09..FR-13 | #66, #67 | `server/src/routes/dashboards.ts`; `client/src/requester-dashboard.tsx`; `client/src/staff-dashboard.tsx`; `client/src/App.tsx` | T-DASH-R-01, T-DASH-S-01, T-QUERY-01, T-UI-DR-01, T-UI-DS-01, T-UI-NAV-01, T-E2E-03 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| FR-14..FR-16 | #61, #68 | `server/prisma/schema.prisma`; `server/prisma/migrations/20261009120000_lab4_actions_workflow/migration.sql`; `server/src/routes/tickets.ts`; `server/src/routes/attachments.ts` | T-MIG-01, T-MIG-02, T-MIG-03, T-MIG-05, T-REG-01, T-REG-02 | Migration/regression suites passed at final-main 0ec971f5 (see §6.2) |
| FR-17..FR-18 | #68, #69 | `e2e/lab-04/ticket-resolution.spec.ts`; `scripts/lab-04/verify-contract.mjs`; `docs/lab-04/reviewer.md`; `artifacts/lab-04/validation/evidence-manifest.json` | T-RESP-01, T-EVID-01, T-CONTRACT-01, RELEASE-01 | Automated suites passed at 0ec971f5; manual evidence and final report close-out remain pending |
| BR-01..BR-22 | #62, #63, #65 | `server/src/routes/actions-taken.ts`; `server/src/routes/staff-ticket-detail.ts`; `server/src/auth.ts` | T-UNIT-01, T-ACT-01, T-ACT-04, T-ACT-05, T-ACT-07, T-WF-01, T-RACE-01, T-RACE-02, T-SEC-01 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| BR-23..BR-32 | #66, #67 | `server/src/routes/dashboards.ts`; `server/src/routes/tickets.ts`; `client/src/App.tsx` | T-DASH-R-01, T-DASH-R-02, T-DASH-S-01, T-DASH-S-02, T-QUERY-01, T-DB-DASH-01, T-PERF-01 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| BR-33..BR-40 | #61, #68, #69 | `server/prisma/migrations/20261009120000_lab4_actions_workflow/migration.sql`; `server/prisma/seed.ts`; `scripts/lab-04/verify-contract.mjs`; `e2e/lab-04/ticket-resolution.spec.ts` | T-MIG-01, T-MIG-02, T-MIG-03, T-MIG-05, T-REG-02, T-EVID-01, T-CONTRACT-01 | Automated evidence checks passed at 0ec971f5; manual/report close-out remains pending |
| AC-01..AC-09 | #62, #63, #65 | `server/tests/lab-04/actions-taken.api.test.ts`; `client/tests/lab-04/ActionsTaken.test.tsx`; `e2e/lab-04/actions-taken-flow.spec.ts` | T-ACT-01, T-ACT-04, T-WF-01, T-WF-02, T-RACE-01, T-RACE-02, T-E2E-01, T-E2E-02 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| AC-10..AC-14 | #66, #67 | `server/tests/lab-04/requester-dashboard.api.test.ts`; `client/tests/lab-04/RequesterDashboard.test.tsx`; `e2e/lab-04/dashboards.spec.ts` | T-DASH-R-01, T-DASH-S-01, T-QUERY-01, T-UI-DR-01, T-UI-DS-01, T-E2E-03 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| AC-15..AC-18 | #61, #68 | `server/tests/lab-04/migration.integration.test.ts`; `server/tests/lab-04/previous-labs.api.test.ts`; `server/tests/lab-02/attachments.api.test.ts` | T-MIG-01, T-MIG-02, T-MIG-03, T-MIG-05, T-REG-01, T-REG-02 | Implemented; passed at final-main 0ec971f5 (run evidence §6.2) |
| AC-19..AC-22 | #67, #69 | `e2e/lab-04/dashboards.spec.ts`; `scripts/lab-04/verify-contract.mjs`; `client/tests/lab-04/VisualAccessibility.test.tsx` | T-RESP-01, T-A11Y-01, T-STYLE-01, T-EVID-01, T-CONTRACT-01 | Automated evidence/verifier passed at 0ec971f5; manual keyboard/overflow evidence and rendered-doc capture remain incomplete |
| AC-23..AC-24 | #69 | `docs/lab-04/reviewer.md`; `scripts/lab-04/verify-contract.mjs`; `artifacts/lab-04/validation/evidence-manifest.json` | T-CONTRACT-01, RELEASE-01 | Pending: RELEASE-01 and final report close-out are not complete |

## 6. AC crosswalk

The following bridge makes functional requirements traceable through acceptance criteria to the planned Test IDs below. A requirement may map to multiple acceptance criteria and suites; this table does not claim tests have been implemented or run.

| Functional requirement | Acceptance criteria |
| --- | --- |
| FR-01 | AC-01, AC-06 |
| FR-02 | AC-01, AC-02, AC-03 |
| FR-03 | AC-02, AC-03, AC-09 |
| FR-04 | AC-04, AC-07, AC-08 |
| FR-05 | AC-05 |
| FR-06 | AC-07, AC-08 |
| FR-07 | AC-09 |
| FR-08 | AC-06, AC-13, AC-14, AC-17 |
| FR-09 | AC-10, AC-12 |
| FR-10 | AC-11, AC-12 |
| FR-11 | AC-11, AC-12 |
| FR-12 | AC-12 |
| FR-13 | AC-13, AC-14, AC-19 |
| FR-14 | AC-15, AC-17 |
| FR-15 | AC-16 |
| FR-16 | AC-17, AC-18 |
| FR-17 | AC-19, AC-20, AC-21 |
| FR-18 | AC-22, AC-23, AC-24 |

The acceptance criteria collectively include the approved BRs in `specification.md`; implementation Issues retain that BR-to-AC-to-Test chain. The execution status is recorded separately in §6.2 and the source-pinned run index.

| AC | Planned Test IDs |
| --- | --- |
| AC-01 | T-ACT-01, T-UI-ACT-01, T-E2E-01 |
| AC-02 | T-ACT-01..02, T-UI-ACT-02, T-E2E-01 |
| AC-03 | T-UNIT-01, T-ACT-02..03, T-SEC-03, T-UI-ACT-01 |
| AC-04 | T-UNIT-01, T-ACT-04, T-UI-ACT-02, T-E2E-01 |
| AC-05 | T-ACT-05/08, T-WF-04, T-UI-ACT-03, T-E2E-01 |
| AC-06 | T-ACT-06/09, T-SEC-01, T-UI-ACT-03, T-E2E-01 |
| AC-07 | T-UNIT-02, T-WF-01/03, T-UI-WF-01..02 |
| AC-08 | T-UNIT-02, T-WF-02, T-RACE-02, T-UI-WF-01, T-E2E-02 |
| AC-09 | T-UNIT-03, T-ACT-07..08, T-WF-03, T-RACE-01..03, T-UI-ACT-04, T-UI-WF-02 |
| AC-10 | T-DASH-R-01..02, T-DASH-S-03, T-DB-DASH-01, T-UI-DR-01, T-E2E-03 |
| AC-11 | T-DASH-S-01..04, T-DB-DASH-01, T-UI-DS-01, T-E2E-03 |
| AC-12 | T-UNIT-03, T-DASH-R-02, T-DASH-S-02, T-QUERY-01, T-UI-NAV-01..02, T-E2E-03 |
| AC-13 | T-REG-01, T-UI-NAV-01, T-UI-REG-01..02, T-E2E-02..03 |
| AC-14 | T-REG-01..02, T-UI-ACT-01/04/05, T-UI-WF-02, T-UI-DR-01, T-UI-DS-01, T-UI-NAV-02, T-UI-REG-01, T-A11Y-01, T-E2E-02..03 |
| AC-15 | T-MIG-01..05, T-WF-04 |
| AC-16 | T-MIG-03 |
| AC-17 | T-REG-01..02, T-RACE-04, T-UI-REG-01..02, T-E2E-02..03, all existing Labs1..3 tests and adapted live browser suites |
| AC-18 | T-ACT-06, T-DASH-S-04, T-SEC-01..03, T-MIG-05, T-E2E-01 |
| AC-19 | T-STYLE-01, T-A11Y-01, T-RESP-01 |
| AC-20 | T-PERF-01 |
| AC-21 | T-E2E-01..03, T-RESP-01, T-EVID-01 |
| AC-22 | T-CONTRACT-01 |
| AC-23 | RELEASE-01 |
| AC-24 | RELEASE-01 |

### 6.1.1 Actual AC execution status at final-main

This table overlays the AC-to-Test mapping above with the retained run index below. “Automated pass” means the mapped tests actually ran successfully on the pinned final-main source; it does not certify unrecorded manual observation or complete visual capture.

| AC range | Actual mapped run result at `0ec971f5` | Acceptance/evidence status | Limit or pending item |
| --- | --- | --- | --- |
| AC-01..AC-09 | Mapped unit/API/UI and Lab 4 E2E tests passed in the recorded server, client, integration and 9/9 browser runs. | Automated checks passed | Selected screenshots demonstrate representative states; not every mutation/error state has its own figure. |
| AC-10..AC-14 | Dashboard SQL/API, server/client UI, navigation and Lab 4 E2E mapped tests passed. | Automated checks passed | The exact SQL/API metric pairs are not printed in retained stdout; loading/forbidden/error and all drill-down states lack selected screenshots. |
| AC-15..AC-18 | Migration 4/4, PostgreSQL integration 20/20, regression and authorization suites passed. | Automated checks passed | Existing test evidence is retained; this Phase 4 did not rerun it. |
| AC-19 | T-STYLE-01, T-A11Y-01 and T-RESP-01 automated checks passed, including the 1440×900/768×1024/320×800 browser matrix. | Automated checks passed; manual evidence partial | Manual keyboard-only traversal, focus restoration and measured page overflow were not recorded. |
| AC-20 | T-PERF-01 passed with the recorded fixture, query counts, p95 values and EXPLAIN output. | Automated check passed | Dashboard reconciliation test passed, but exact SQL/API metric pairs were not retained. |
| AC-21 | T-E2E-01..03, T-RESP-01 and T-EVID-01 passed; Lab 4 browser matrix 9/9, one worker, zero retries; captured artifacts are hash-indexed. | Automated/provenance checks passed | Only selected screenshots are assigned as report figures; the full two-repository PR archive is not screenshot-complete. |
| AC-22 | T-CONTRACT-01 and contract/evidence suite passed 24/24. | Automated check passed | The report's visual source excerpts and final assembled crosswalk remain to be completed in Phase 5. |
| AC-23 | Independent review/merge records exist for L4-01 through L4-11 and are linked in `reviewer.md`. | Partial | PR #83 is open with changes requested in review #5722784089; Issue #71 is in Fixing on that same close-out. Peer approval/merge, final PDF QA and the all-Done condition remain unmet. |
| AC-24 | Final-main validation passed on `0ec971f5`; PR #82 is reviewed and merged. | Partial / release close-out pending | Documentation-only close-out review/merge, one final PDF QA and Issue #71 completion remain. |

## 6.2 Actual execution status at final-main

The following is the actual retained Phase 2 run for released main source commit [0ec971f5fe2ddfd7da16575aa959d844bc254811](https://github.com/itspxsh/toktickit/commit/0ec971f5fe2ddfd7da16575aa959d844bc254811), not a new Phase 3/4 run. Exact command, UTC start/end, exit code, database name (no URL), log path and SHA-256 are in [run-index.json](../../artifacts/lab-04/final-main/0ec971f5/run-index.json) and the [selected evidence index and retained logs](../../artifacts/lab-04/final-main/0ec971f5/README.md). Phase 3 and Phase 4 did not rerun product suites.

| Actual IDs / scope | Result at 0ec971f5 | Retained evidence and limit |
| --- | --- | --- |
| T-UNIT-01..03, T-ACT-01..07/09, T-WF-01..04, T-DASH-R-01..02, T-DASH-S-01..04, T-QUERY-01, T-SEC-01..03, T-REG-01..02, plus inherited Lab 1–3 server cases | Full server suite 175/175 passed; 24 files; final run was serial with one worker and file-parallelism disabled; zero failures, skips or retries. | Final log: server-tests-final-serial.log. Test names also appear in verbose discovery/run logs; T-ACT-08 is counted in PostgreSQL integration below. Initial default-parallel attempts with intermittent Supertest transport failures are retained and disclosed in reliability-investigation.md; they were not discarded. |
| T-ACT-08, T-MIG-01..05, T-RACE-01..04, T-DB-DASH-01, T-PERF-01 | PostgreSQL integration 20/20 passed across 6 files; the test database was isolated and ended in _test. Four migrations deployed on a fresh guarded database. | postgres-integration.log, migration-deploy.log and migration-inventory.log. Dashboard SQL/API reconciliation passed under one repeatable-read snapshot, but its retained stdout does not contain the numeric metric pairs. |
| T-UI-ACT-01..05, T-UI-WF-01..02, T-UI-DR-01, T-UI-DS-01, T-UI-NAV-01..02, T-UI-REG-01..02, T-STYLE-01, T-A11Y-01, and inherited client cases | Client suite 134/134 passed across 30 files. | client-tests.log; actual logged Test IDs are listed in the [source-pinned run index](../../artifacts/lab-04/final-main/0ec971f5/run-index.json). |
| T-CONTRACT-01, T-EVID-01 and contract/evidence verifier cases | Contract/evidence tests 24/24 passed; zero failures, skips or retries. Historical evidence verifier exited 0. | contract-tests.log and historical-evidence-verifier.log. The verifier run checks the retained historical evidence; it is not a new screenshot capture. |
| Lab 2 T-UI-REG-01 | Authenticated Lab 2 Playwright 3/3 passed. | lab2-e2e.log; three viewport project runs, one worker and zero retries. |
| Lab 3 T-E2E-01..03 | Lab 3 Playwright 9/9 passed. | lab3-e2e.log; three journeys × 1440×900, 768×1024, 320×800; one worker, zero retries. |
| Lab 4 T-E2E-01..03, T-RESP-01 | Lab 4 Playwright 9/9 passed. | lab4-e2e.log; three journeys × 1440×900, 768×1024, 320×800; one worker, zero retries. |
| T-RESP-01 automated viewport/focus assertions | Passed within the live browser runs above. | This is automated evidence. Separate manual keyboard-only traversal and measured overflow observation were not retained; do not describe those as manually verified. |
| RELEASE-01 | Pending. | Peer-reviewed docs-only close-out, final report PDF QA and Issue #71 Done state have not happened. |

Other final-main checks at the same source SHA: server and client builds passed; repository-local Prisma CLI and client version were 5.22.0, and `./node_modules/.bin/prisma validate --schema prisma/schema.prisma` passed; `git diff --check` passed. Migration deploy applied, in order: 20260816095224_init, 20260906010000_lab2_data_foundation, 20260915150000_lab3_data_foundation and 20261009120000_lab4_actions_workflow. The test database URL and synthetic credentials are redacted and not reproduced here.

The first default-parallel server attempt reported 174 passed and one T-DASH-S-03 HTTP parser/transport failure before the handler assertion. Other default-parallel runs included another isolated Supertest socket transport error; those diagnostic runs remain archived. The evidence does not establish a specific root cause. Repeated one-worker serial full-suite comparisons passed; the final source-pinned serial run was 175/175 with zero failures/skips/retries. See the committed [reliability investigation](../../artifacts/lab-04/final-main/0ec971f5/runs/reliability-investigation.md) and [run index](../../artifacts/lab-04/final-main/0ec971f5/run-index.json).

## 7. TDD and reproducible execution rules

1. Tests added only for current approved Issue. Run by exact file/test name; expected failure must be missing behavior/assertion, not missing imports/dependencies/DB. Record failure and commit **tests only** with `test(lab4): ...` before implementation.
2. Implement minimum change; run focused + required regression, build, local Prisma validation, diff check. Test fixture updates reflecting explicitly approved contract changes must retain security negatives, not merely delete failing tests.
3. Real DB tests do not share a reset database concurrently. Proposed names: `toktickit_lab4_migration_test`, `toktickit_lab4_integration_test`, `toktickit_lab4_e2e_test`; credentials stay local and values are never printed. Independent NODE_ENV-independent name guard before reset/deploy fixture work.
4. Whole server `npm test` excludes integration by existing config; final gate includes a **separate** `test:integration` serial run. A focused77/77 is not the full server suite. `--list` is discovery, not an E2E pass.
5. Commands from repo root use `npm --prefix server` / `npm --prefix client`; there is no root package.json. Prisma exact command: `(cd server && ./node_modules/.bin/prisma validate --schema prisma/schema.prisma)`; do not call an unrelated global `prisma` executable.
6. Final-main run includes all inherited suites plus Lab4; actual count may exceed baseline77server/58client. Capture totals from actual output. Latency budgets and fixture counts must be reviewer-approved and reproducible, not hand-edited green results.
7. Artifact index records command, cwd, UTC time, tested SHA/product-tree SHA, result counts, DB scope (name only), viewport, redaction and reviewer links. Do not close a live-evidence Issue on skeleton/discovery-only results.
8. Earlier E2E suites run serially with their own scenario data and evidence-root override under artifacts/lab-04/regression. Do not overwrite old screenshots or run unmodified removed Development Requester expectations and call failures acceptable. Retain old historical contracts/reports, explicitly document new authenticated equivalence.
