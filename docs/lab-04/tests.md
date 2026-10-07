# TokTickIT Lab 4 Test Contract — PROPOSED FOR L4-01 PEER REVIEW

All rows below are **PLANNED / NOT EXECUTED**. No final Pass count is promised. IDs are Lab 4-local. Bind each ID to an actual named `it/test` or parameterized case and exact file; retain failed-red then green output/commits. Companions `specification.md`, `api-spec.md`, `ui-spec.md` define expected behavior, not mocks. Contract tests must not pass only because of unconditional stubs.

## 1. Test file responsibilities

* `server/tests/lab-04/actions.unit.test.ts`: field normalization, state/gate predicates, strict parsing and canonical fingerprint.
* `server/tests/lab-04/actions-taken.api.test.ts`: create/read/edit/assignment/transitions/replays/rollback with asserted query predicates.
* `server/tests/lab-04/ticket-workflow.api.test.ts`: complete role/transition matrix, gate, explicit versioned existing writes.
* `server/tests/lab-04/requester-dashboard.api.test.ts`, `staff-dashboard.api.test.ts`: scopes/formulas/windows/bounded responses/filters.
* `server/tests/lab-04/authorization.api.test.ts`: **real** existing auth/CSRF middleware wired to new route registrars.
* `server/tests/lab-04/migration.integration.test.ts`: real PostgreSQL upgrade/deploy/seed/recovery fixtures.
* `server/tests/lab-04/workflow-concurrency.integration.test.ts`: real transactions and races using separate connections/barriers.
* `server/tests/lab-04/dashboard.integration.test.ts`: independently calculated metrics and performance-smoke fixture.
* `server/tests/lab-04/previous-labs.api.test.ts`: intended authenticated regression/priority/owner/attachment edge cases.
* `client/tests/lab-04/{ActionsTaken,TicketWorkflow,RequesterDashboard,StaffDashboard,DashboardRouting,Regression,VisualAccessibility}.test.tsx`: UI behavior with honest network fixture mocks; layout acceptance additionally live E2E + PNG review. This matches `client/vite.config.ts` include `tests/**/*.test.tsx`; do not put tests under src where they would be undiscovered.
* `e2e/lab-04/{actions-taken-flow,ticket-resolution,dashboards}.spec.ts`: three live end-to-end journeys, three approved viewports; nine executions if exactly one test per file. Add tests only with updated discovery/expected count; never force a claimed 9 when actual suite differs. Also execute adapted `e2e/lab-02/requester-ticket-flow.spec.ts` and all `e2e/lab-03/*.spec.ts` for final live regression. Supersede removed Development Requester identity steps with authenticated fixtures, preserving Ticket/Attachment behaviors and historical artifacts.
* `scripts/lab-04/verify-contract.mjs`: cross-file ID/path/coverage and docs-only close-out diff checks, no product privileges.

## 2. Unit / API test inventory

| ID | AC | Named behavior / expected outcome | Exact path (under server/tests/lab-04/) |
| --- | --- | --- | --- |
| T-UNIT-01 | 03,04 | Trim and boundary cases, merged follow-up rule, immutable field rejection; complete/cancel predicates. | actions.unit.test.ts |
| T-UNIT-02 | 07,08 | Every from/to/role pair and resolution gate truth table, including zero/all-cancelled/follow-up. | actions.unit.test.ts |
| T-UNIT-03 | 09,12 | Fingerprint deterministic across normalized payloads, ignores expected version, differs on content/assignee; query dates/URLs allow-list. | actions.unit.test.ts |
| T-ACT-01 | 01,02 | Create correct parent/actor/time/PLANNED/version and different active support assignee; 201 safe shape. | actions-taken.api.test.ts |
| T-ACT-02 | 02,03 | Inactive/Requester/missing assignee and forged actor/time/state/parent rejected, zero writes. | actions-taken.api.test.ts |
| T-ACT-03 | 03 | All text limits, boolean types, follow-up true + omitted/short note, merged patch validation; 400 field errors. | actions-taken.api.test.ts |
| T-ACT-04 | 04 | Start/complete/cancel permitted edges; invalid edge/terminal edits fail; complete performer=actor and required Result/follow-up; cancel reason/confirmation. | actions-taken.api.test.ts |
| T-ACT-05 | 05 | Stable order under edits, one revision per effective mutation, original fields immutable, no delete route, no-op unchanged. | actions-taken.api.test.ts |
| T-ACT-06 | 06,18 | Owned all-state Requester read, cross-owner/missing Ticket and child errors equal, no revisions/notes/secrets; requester writes403. | actions-taken.api.test.ts |
| T-ACT-07 | 09 | Same key/payload/actor200 replay once, different payload/actor409; replay after lost response precedes stale-version check. | actions-taken.api.test.ts |
| T-ACT-08 | 05,09 | Forced revision insert error rolls back Action/Ticket counters and all data; parent/action predicate assertions. | actions-taken.api.test.ts |
| T-ACT-09 | 06 | Requester and Staff Action/revision pagination defaults, valid boundaries, and 400 for page<1 or pageSize outside 1..100. | actions-taken.api.test.ts |
| T-WF-01 | 07 | Parameterized 8x8x3 role matrix, invalid/malformed/unchanged state, Admin-only cancelled reopen. | ticket-workflow.api.test.ts |
| T-WF-02 | 08 | Zero/all-cancelled/unfinished/follow-up fail; eligible work permits resolve/close; advisory flag does not bypass gate. | ticket-workflow.api.test.ts |
| T-WF-03 | 07,09 | Version required for claim/assignment/priority/status, stale409, atomic unassigned claim; terminal writes blocked; query conditions asserted. | ticket-workflow.api.test.ts |
| T-WF-04 | 05,15 | Legacy statuses unchanged; reopen then truthful work policy, resolvedAt lifecycle, ordered public status events. | ticket-workflow.api.test.ts |
| T-DASH-R-01 | 10 | Exact own 4 metrics/2 lists, foreign user/ticket isolation, summary-only projection, all-zero scope. | requester-dashboard.api.test.ts |
| T-DASH-R-02 | 10,12 | UTC inclusive lower/exclusive upper seven-day bounds, unknown legacy resolvedAt excluded only from recent card; drill-down equality. | requester-dashboard.api.test.ts |
| T-DASH-S-01 | 11 | Staff/Admin own/unassigned/urgent/status/priority/null buckets and five-item recent/urgent lists match fixtures. | staff-dashboard.api.test.ts |
| T-DASH-S-02 | 11,12 | My Actions counts child rows not distinct Tickets, supports page beyond first, ignores foreign assignee; active parent predicate. | staff-dashboard.api.test.ts |
| T-DASH-S-03 | 10,11 | Empty scopes zeros/[], safe failures not fake zeros, authenticated role mismatch403. | staff-dashboard.api.test.ts |
| T-QUERY-01 | 12 | Both list APIs all statuses/groups/time bounds/before/null priority/AND/pagination, exact authorization where/select/order asserted. | requester-dashboard.api.test.ts |
| T-SEC-01 | 06,18 | Real middleware every new protected GET/write: anonymous/expired/inactive401, first-login403, wrong role403. | authorization.api.test.ts |
| T-SEC-02 | 18 | Real write wiring rejects missing/wrong CSRF and foreign Origin independently before mutation; session role change immediate. | authorization.api.test.ts |
| T-SEC-03 | 03,18 | Forged owner/performer/createdAt/state/role, text HTML payloads, safe errors and secret-free projections; validate strict bodies. | authorization.api.test.ts |
| T-REG-01 | 13,17 | Authenticated categories/diagnostic and anonymous401/public health; new Ticket itPriority=requestedPriority; active Admin Owner accepted. | previous-labs.api.test.ts |
| T-REG-02 | 17 | Attachment post-removal unlink failure still success, removed file inaccessible; five-active capacity concurrency covered in T-RACE-04. | previous-labs.api.test.ts |

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
| T-RACE-04 | 17 | Two uploads competing for fifth slot produce capacity<=5 and compensate file/DB safely; no orphan objects after rejected write. | workflow-concurrency.integration.test.ts |
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
| T-UI-WF-01 | 07,08 | Only permitted targets, Admin-only reopen, gate messages, close/cancel confirm and success summary refresh. | TicketWorkflow.test.tsx |
| T-UI-WF-02 | 07,09,14 | Versioned assignment/priority/claim/status requests, stale notice reset on Ticket navigation, no overwrite of unsaved forms. | TicketWorkflow.test.tsx |
| T-UI-DR-01 | 10,14 | Own cards/attention/recent links, exact values, loading vs empty vs failure/retry/forbidden. | RequesterDashboard.test.tsx |
| T-UI-DS-01 | 11,14 | Staff/Admin cards/buckets/recent/urgent/My Actions pagination links and empty/error/forbidden. | StaffDashboard.test.tsx |
| T-UI-NAV-01 | 12,13 | Server-derived role landing/guard/nav aria-current, query/hash/back/forward reload, no localStorage identity. | DashboardRouting.test.tsx |
| T-UI-NAV-02 | 12,14 | URL filters visibly applied/clearable, date bounds, search debounce, page>5 aria-current and same-path navigation. | DashboardRouting.test.tsx |
| T-UI-REG-01 | 13,17 | Auth first-login/session expiry/password/logout, Lab1 diagnostic, requester create/list/detail/comment/resolution/attachment and Staff/Admin representative flows. | Regression.test.tsx |
| T-STYLE-01 | 19 | Token reuse, priority/status non-color text, shared labels/errors/read-only semantics, no placeholder controls. | VisualAccessibility.test.tsx |
| T-A11Y-01 | 14,19 | Keyboard focus/dialog trap/Escape/restore, descriptions, live notices and metrics links accessible names. | VisualAccessibility.test.tsx |

## 5. Live E2E / responsive / evidence

| ID | AC | Required executed journey/evidence | File |
| --- | --- | --- | --- |
| T-E2E-01 | 01..06,09,18 | Support creates multiple Actions on unique fresh Ticket, reassigns different support user, edits, starts/completes one, cancels another; Requester sees all read-only; direct unauthorized write denied. | e2e/lab-04/actions-taken-flow.spec.ts |
| T-E2E-02 | 07..09,17 | Requester create -> support claim/work -> blocked zero/unfinished resolution -> complete work -> resolve -> requester advisory/comment/readonly -> close -> role-appropriate reopen/cancel. UI controls, real backend; compare persisted events. | e2e/lab-04/ticket-resolution.spec.ts |
| T-E2E-03 | 10..14,17 | Requester/Staff/Admin dashboards exact independently calculated counts, current-user work, drill-down list/filter/back, owned isolation and representative auth/attachments/comments/notes/admin regression. | e2e/lab-04/dashboards.spec.ts |
| T-RESP-01 | 19,21 | All three files on1440x900/768x1024/320x800, no page overflow and usable menu/forms/dialogs; inspect loaded PNGs, not only DOM. | e2e/lab-04/*.spec.ts |
| T-EVID-01 | 21 | Commit-pinned redacted manifest for real screenshots/logs/migration/metrics; loaded-state assertions precede capture; no skipped/flaky/retried test masked as green. | scripts/lab-04/verify-contract.mjs + artifact inspection |
| T-CONTRACT-01 | 22 | Every FR/BR/AC and Test ID resolves to implementation Issue/file/test and final status; no nonexistent paths or duplicate IDs. | scripts/lab-04/verify-contract.mjs |
| RELEASE-01 | 23,24 | Reviewed staged integration, final-main full validation at pinned product SHA, docs-only close-out verified, Issue-only Done board and single Answer Part1..9 PDF links/redactions. | scripts/lab-04/verify-contract.mjs + reviewer/QA evidence |

Screenshot-only simulated failure states may use Playwright request interception **labelled simulated**; never present them as a live backend outage. Actual happy-path/race/migration evidence must use live backend/DB. E2E preserves/recreates test-scoped fixtures instead of depending on old first-login passwords or toggling a persisted boolean blindly. Use isolated scenario records and workers1/retries0. Screenshot assertions await actual rows/counts before save.

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

The acceptance criteria collectively include the proposed BRs in `specification.md`; implementation Issues must retain that BR-to-AC-to-Test chain when scoped. L4-01 review must identify any BR that is not covered before approving the contract.

| AC | Planned Test IDs |
| --- | --- |
| AC-01 | T-ACT-01, T-UI-ACT-01, T-E2E-01 |
| AC-02 | T-ACT-01..02, T-UI-ACT-02, T-E2E-01 |
| AC-03 | T-UNIT-01, T-ACT-02..03, T-SEC-03, T-UI-ACT-01 |
| AC-04 | T-UNIT-01, T-ACT-04, T-UI-ACT-02, T-E2E-01 |
| AC-05 | T-ACT-05/08, T-WF-04, T-UI-ACT-03, T-E2E-01 |
| AC-06 | T-ACT-06/09, T-SEC-01, T-UI-ACT-03, T-E2E-01 |
| AC-07 | T-UNIT-02, T-WF-01/03, T-UI-WF-01..02, T-E2E-02 |
| AC-08 | T-UNIT-02, T-WF-02, T-RACE-02, T-UI-WF-01, T-E2E-02 |
| AC-09 | T-UNIT-03, T-ACT-07..08, T-WF-03, T-RACE-01..03, T-UI-ACT-04, T-UI-WF-02 |
| AC-10 | T-DASH-R-01..02, T-DASH-S-03, T-DB-DASH-01, T-UI-DR-01, T-E2E-03 |
| AC-11 | T-DASH-S-01..03, T-DB-DASH-01, T-UI-DS-01, T-E2E-03 |
| AC-12 | T-UNIT-03, T-DASH-R-02, T-DASH-S-02, T-QUERY-01, T-UI-NAV-01..02, T-E2E-03 |
| AC-13 | T-REG-01, T-UI-NAV-01, T-UI-REG-01, T-E2E-03 |
| AC-14 | T-REG-01..02, T-UI-ACT-01/04, T-UI-WF-02, T-UI-DR-01, T-UI-DS-01, T-UI-NAV-02, T-UI-REG-01, T-A11Y-01, T-E2E-02..03 |
| AC-15 | T-MIG-01..05, T-WF-04 |
| AC-16 | T-MIG-03 |
| AC-17 | T-REG-01..02, T-RACE-04, T-UI-REG-01, T-E2E-02..03, all existing Labs1..3 tests and adapted live browser suites |
| AC-18 | T-ACT-06, T-SEC-01..03, T-MIG-05, T-E2E-01 |
| AC-19 | T-STYLE-01, T-A11Y-01, T-RESP-01 |
| AC-20 | T-PERF-01 |
| AC-21 | T-E2E-01..03, T-RESP-01, T-EVID-01 |
| AC-22 | T-CONTRACT-01 |
| AC-23 | RELEASE-01 |
| AC-24 | RELEASE-01 |

## 7. TDD and reproducible execution rules

1. Tests added only for current approved Issue. Run by exact file/test name; expected failure must be missing behavior/assertion, not missing imports/dependencies/DB. Record failure and commit **tests only** with `test(lab4): ...` before implementation.
2. Implement minimum change; run focused + required regression, build, local Prisma validation, diff check. Test fixture updates reflecting explicitly approved contract changes must retain security negatives, not merely delete failing tests.
3. Real DB tests do not share a reset database concurrently. Proposed names: `toktickit_lab4_migration_test`, `toktickit_lab4_integration_test`, `toktickit_lab4_e2e_test`; credentials stay local and values are never printed. Independent NODE_ENV-independent name guard before reset/deploy fixture work.
4. Whole server `npm test` excludes integration by existing config; final gate includes a **separate** `test:integration` serial run. A focused77/77 is not the full server suite. `--list` is discovery, not an E2E pass.
5. Commands from repo root use `npm --prefix server` / `npm --prefix client`; there is no root package.json. Prisma exact command: `(cd server && ./node_modules/.bin/prisma validate --schema prisma/schema.prisma)`; do not call an unrelated global `prisma` executable.
6. Final-main run includes all inherited suites plus Lab4; actual count may exceed baseline77server/58client. Capture totals from actual output. Latency budgets and fixture counts must be reviewer-approved and reproducible, not hand-edited green results.
7. Artifact index records command, cwd, UTC time, tested SHA/product-tree SHA, result counts, DB scope (name only), viewport, redaction and reviewer links. Do not close a live-evidence Issue on skeleton/discovery-only results.
8. Earlier E2E suites run serially with their own scenario data and evidence-root override under artifacts/lab-04/regression. Do not overwrite old screenshots or run unmodified removed Development Requester expectations and call failures acceptable. Retain old historical contracts/reports, explicitly document new authenticated equivalence.
