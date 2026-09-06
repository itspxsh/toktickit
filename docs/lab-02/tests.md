# TokTickIT Lab 2 Test Plan and Results

**Status:** Planned before implementation. Final results are intentionally
`Pending` until the relevant feature is merged and verified on `main`.

## 1. Test Strategy

Tests are written from the acceptance criteria in `specification.md`, using a
Red-Green-Refactor loop on each Issue. Unit tests isolate pure validation,
query, number, and file-safety rules. API tests import the Express app and use a
dedicated PostgreSQL test database with deterministic reset/seed helpers. UI
tests use Vitest, React Testing Library, and `user-event`, mocking only the API
boundary. Style and accessibility tests assert semantic labels, classes,
states, and keyboard behavior. Playwright covers responsive screenshots and
real browser flows against a seeded local stack.

No test may be skipped, disabled, or accepted solely from an AI agent's claim.
Every AC maps to one or more rows below, and every automated test identifies an
actual repository path.

## 2. Planned Tests

| Test ID | Type | Requirement / AC | What it tests | Expected result | Automated test file | Final |
|---|---|---|---|---|---|---|
| UNIT-01 | Unit | BR-05, AC-04 | Persisted requester is accepted only when active | Valid id retained; missing/inactive cleared | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UNIT-02 | Unit | BR-01, AC-05 | Ticket number format and sequence mapping | `TKT-YYYY-NNNNNN`, no reuse | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| UNIT-03 | Unit | BR-10-12, AC-06 | Trim and boundary validation | Valid boundaries pass; invalid values return field errors | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| UNIT-04 | Unit | BR-14, AC-07 | Idempotency key/fingerprint behavior | Same payload replays; changed payload conflicts | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| UNIT-05 | Unit | BR-16-19, AC-10 | Query parser and stable sort | Invalid values rejected; defaults deterministic | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| UNIT-06 | Unit | BR-21-26, AC-14-15 | File signature, size, extension, safe name | Only permitted files accepted; paths never trust user name | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-01 | API | FR-02, AC-01 | Active requester list | `200`, active rows only, ordered by name | `server/tests/lab-02/requesters.api.test.ts` | Pending |
| API-02 | API | FR-02, AC-02 | Empty/DB failure requester behavior | Empty list or safe `500` envelope | `server/tests/lab-02/requesters.api.test.ts` | Pending |
| API-03 | API | FR-05-07, AC-05 | Valid Ticket creation | `201`, one saved row, official number returned | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-04 | API | BR-09-12, AC-06 | Invalid fields and inactive references | `422` with field errors; no row created | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-05 | API | BR-14, AC-07 | Duplicate create retry | `200` replay; no duplicate row | `server/tests/lab-02/create-ticket.api.test.ts` | Pending |
| API-06 | API | BR-07-08, AC-09 | Ticket ownership in list | A sees only A; B sees only B | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-07 | API | FR-10, AC-10 | Search/filter/sort/page contract | Correct data and pagination metadata | `server/tests/lab-02/my-tickets.api.test.ts` | Pending |
| API-08 | API | FR-12-13, AC-12 | Owned Ticket Detail | Read-only fields and attachment metadata returned | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-09 | API | BR-08, AC-13 | Cross-requester detail/access | Safe `404`, no data disclosure | `server/tests/lab-02/ticket-detail.api.test.ts` | Pending |
| API-10 | API | FR-14, AC-14 | Valid Attachment upload | `201`, correct metadata and private storage | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-11 | API | BR-21-23, AC-15 | Invalid/oversized/sixth upload | `415`, `413`, or `409`; no active row | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-12 | API | FR-15-16, AC-16 | Download, soft removal, blocked download | Active streams; removed metadata remains; content blocked | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-13 | API | BR-27, AC-17 | Partial initial attachment failure | Ticket persists; per-file result and cleanup | `server/tests/lab-02/attachments.api.test.ts` | Pending |
| API-14 | API | FR-02, AC-01 | Active categories and systems | Only active reference rows returned | `server/tests/lab-02/reference-data.api.test.ts` | Pending |
| UI-01 | UI | FR-02, AC-01 | Requester selector loading and success | Accessible select and active options render | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UI-02 | UI | FR-02, AC-02 | Selector empty and failure states | Useful message, retry, no unsafe fallback | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UI-03 | UI | FR-03-04, BR-06, AC-03-04 | Persist and switch requester, including dirty-form confirmation | Cancel keeps the current requester and unsaved form; confirm switches identity and clears stale data | `client/tests/lab-02/RequesterSelection.test.tsx` | Pending |
| UI-04 | UI | FR-05, AC-06 | Create field validation | Required markers/messages; API not called | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-05 | UI | FR-07-08, AC-07 | Busy/disabled/idempotent submit | Double click cannot create two requests | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-06 | UI | FR-18, AC-08 | Create failure preservation | Values and file selections remain visible | `client/tests/lab-02/CreateTicket.test.tsx` | Pending |
| UI-07 | UI | FR-09-10, AC-10 | Ticket list controls | Search, filters, sort, page change request correct API | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-08 | UI | FR-11, AC-11 | Empty/no-results list | Distinct text and actionable controls | `client/tests/lab-02/MyTickets.test.tsx` | Pending |
| UI-09 | UI | FR-12, AC-12-13 | Detail read-only and not-found | Correct fields and safe error state | `client/tests/lab-02/RequesterTicketDetail.test.tsx` | Pending |
| UI-10 | UI | FR-14-15, AC-14 | Attachment active state | Add, preview, and download controls are labelled | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-11 | UI | FR-16-17, AC-15-16 | Invalid and removed attachment states | Error placement, reason dialog, no removed link | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| UI-12 | UI | FR-18, AC-17 | Per-file upload outcomes | Partial success is explicit and retryable | `client/tests/lab-02/AttachmentSection.test.tsx` | Pending |
| STYLE-01 | Style | UI spec, AC-18 | Zen Green tokens, field/button/badge classes | Required classes and visual state hooks present | `client/tests/lab-02/AppShell.test.tsx` | Pending |
| STYLE-02 | Style/A11y | AC-19 | Labels, required asterisks, focus and non-color cues | Keyboard and screen-reader semantics pass | `client/tests/lab-02/AppShell.test.tsx` | Pending |
| RESP-01 | Responsive | AC-18 | Create Ticket at desktop/tablet/mobile | Screenshots have no clipping or horizontal scroll | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| RESP-02 | Responsive | AC-18 | My Tickets table/cards at all breakpoints | Controls remain usable and readable | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| RESP-03 | Responsive | AC-18 | Ticket Detail/Attachment at all breakpoints | Attachment names/actions remain visible | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| A11Y-01 | Accessibility | AC-19 | Keyboard-only requester/create/detail flow | Logical tab order, visible focus, labelled controls | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-01 | E2E | AC-03,05,08,12 | Select -> create -> list -> detail | Official number and saved values visible | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-02 | E2E | AC-03,09,11,13 | A/B switching, dirty-form confirmation, and isolation | Cancel preserves the dirty form; confirmed switch changes context, A tickets disappear for B, and direct access is rejected | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| E2E-03 | E2E | AC-14-17 | Attachment lifecycle | Add/download/remove/blocked download and partial error | `e2e/lab-02/requester-ticket-flow.spec.ts` | Pending |
| TEST-01 | Release | AC-20 | Full final test command from main | No skipped/flaky tests; all required suites green | `docs/lab-02/tests.md` | Pending |
| RELEASE-01 | Release | DoD | Contract, board, PR, review, and PDF evidence audit | Every required link and screenshot exists | `docs/lab-02/reviewer.md` | Pending |

## 3. Acceptance-Criterion Traceability

| AC | Planned tests |
|---|---|
| AC-01 | API-01, UI-01 |
| AC-02 | API-02, UI-02 |
| AC-03 | UI-03, E2E-01, E2E-02 |
| AC-04 | UNIT-01, UI-03 |
| AC-05 | UNIT-02, API-03, E2E-01 |
| AC-06 | UNIT-03, API-04, UI-04 |
| AC-07 | UNIT-04, API-05, UI-05 |
| AC-08 | UI-06, E2E-01 |
| AC-09 | API-06, E2E-02 |
| AC-10 | UNIT-05, API-07, UI-07 |
| AC-11 | UI-08, E2E-02 |
| AC-12 | API-08, UI-09 |
| AC-13 | API-09, E2E-02 |
| AC-14 | UNIT-06, API-10, UI-10, E2E-03 |
| AC-15 | UNIT-06, API-11, UI-11 |
| AC-16 | API-12, UI-11, E2E-03 |
| AC-17 | API-13, UI-12, E2E-03 |
| AC-18 | STYLE-01, RESP-01, RESP-02, RESP-03 |
| AC-19 | STYLE-02, A11Y-01 |
| AC-20 | TEST-01, RELEASE-01 |

## 4. Responsive and Visual Checklist

- [ ] Primary `#006B3C`, secondary `#0B7A46`, pale `#EAF6EF`, background,
  surface, text, error, warning, and success tokens match `ui-spec.md`.
- [ ] Editable fields are white; read-only fields are visibly distinct but readable.
- [ ] Required labels have red asterisks plus nearby text validation messages.
- [ ] Busy/disabled buttons cannot be activated and retain visible text.
- [ ] Every icon-only action has an accessible label and tooltip.
- [ ] Desktop table and mobile card/list representations are both legible.
- [ ] Empty-list and no-results states are distinct.
- [ ] No clipped labels, overlapping errors, hidden buttons, unreadable filenames,
  or unintended horizontal page scrolling at any target viewport.
- [ ] Active/removed/uploading/invalid/unavailable Attachment states are clear
  without relying on color alone.
- [ ] Screenshots are stored under `artifacts/lab-02/screenshots/` with the
  state, viewport, and commit recorded.

## 5. Test Commands

Commands must be run from a clean checkout of final `main` and recorded with
their actual output:

```bash
cd server && npm ci && npx prisma migrate deploy && npm run test
cd ../client && npm ci && npm run test && npm run build
cd .. && npx --prefix client playwright test -c client/playwright.config.ts e2e/lab-02
```

The README must document how to set `DATABASE_URL_TEST`, seed/reset the test
database, start both dev servers, and run the same commands locally and in CI.
Because Playwright is installed in the `client` package, the repository-root
equivalent is `npx --prefix client playwright test -c
client/playwright.config.ts e2e/lab-02` (or `cd client && npm run test:e2e`).

## 6. Final Results

| Suite | Command | Result | Evidence |
|---|---|---|---|
| Server unit/API | `cd server && npm run test` | Pending | Add terminal capture from final `main` |
| Client unit/UI | `cd client && npm run test` | Pending | Add terminal capture from final `main` |
| Client build | `cd client && npm run build` | Pending | Add output and confirm no generated source `.js` files |
| Playwright E2E/responsive | `npx playwright test -c client/playwright.config.ts e2e/lab-02` | Pending | Add report and screenshots |

### L2-09 staging verification (not final-main evidence)

The following checks were run on `feature/lab2-09-release-readiness` after
`lab2-staging` commit `b403d57` on 2026-09-06. They are intentionally not
marked as final until the release branch is merged and rerun from `main`.
The screenshot set below was regenerated during staging verification at merge
commit `58b04cc` after the implementation/test corrections in commits
`1fe874e` through `93c996f`.

| Check | Result | Evidence / risk |
|---|---|---|
| `cd client && npm run test` | 34/34 passed | Local Vitest output |
| `cd client && npm run build` | Passed | TypeScript and Vite production build |
| `cd server && npm run build` | Passed | TypeScript server build |
| `cd server && npm run test` | 39/39 passed | Lab 1 and Lab 2 suites pass after applying the committed migrations and deterministic seed |
| `npx --prefix client playwright test -c client/playwright.config.ts e2e/lab-02` | 3/3 passed | Desktop, tablet, and mobile Chromium projects; screenshots are stored under `artifacts/lab-02/screenshots/` |

## 7. Known Limitations or Deferred Tests

- The Development Requester header is deliberately not a security boundary;
  real authentication and authorization are deferred to Lab 3.
- No IT Staff workflow, collaboration, or post-creation status transition is
  tested because those features are explicitly out of scope.
- Local filesystem storage is an MVP implementation; an object-store adapter is
  a future concern after the API and metadata contract remain stable.
