# TokTickIT Lab 3 Test-DD Plan

This is the test-first contract for Lab 3. It is written before any Lab 3
application implementation and is the source of truth for the test paths,
fixtures, evidence, and acceptance-criterion traceability. Test IDs are stable
references used by the other Lab 3 contract documents.

## 1. Test strategy and boundaries

The released Lab 2 tree at `main`/`lab3-staging` commit `d4a034c` is the
regression baseline. The current Lab 3 release candidate is validated from
the pinned staging tip recorded in `reviewer.md`. Lab 3 tests run with an isolated PostgreSQL test database
whose name is explicitly test-scoped. No test may use a development or
production `DATABASE_URL`.

Tests are layered:

* server unit tests for password/session helpers, validation, transition
  matrices, safe error mapping, and policy predicates;
* server API tests with an in-memory session fixture and the guarded test DB;
* migration/seed integration tests that apply the Lab 2 baseline and prove
  Ticket and Attachment rows survive the User migration;
* client component tests for authentication, role navigation, forms, states,
  keyboard behaviour, and accessible names;
* Playwright E2E tests for the three roles and the complete staff/admin flows;
* style, responsive, accessibility, and screenshot checks at desktop, tablet,
  and mobile viewports.

The server is the authority. Tests deliberately send forged requester IDs,
role fields, owner IDs, authors, timestamps, statuses, and priorities to prove
that the API ignores or rejects them. Test fixtures use fake data and test-only
passwords supplied through the environment; no password, session token, or
real secret is committed.

## 2. Planned server tests

| ID | Planned test | Concrete path | Level |
| --- | --- | --- | --- |
| T-UNIT-01 | Password hashing is one-way, verifies the correct password, and rejects a wrong password. | `server/tests/lab-03/auth.unit.test.ts` | unit |
| T-UNIT-02 | Session cookies are opaque, expire, and invalidated logout cannot authenticate. | `server/tests/lab-03/auth.unit.test.ts` | unit |
| T-UNIT-03 | First-login and password policy reject blank/short/reused values without returning hashes. | `server/tests/lab-03/auth.unit.test.ts` | unit |
| T-UNIT-04 | Role/status predicates and the status transition matrix accept only permitted transitions. | `server/tests/lab-03/authorization.unit.test.ts` | unit |
| T-UNIT-05 | Comment/note trimming, length, and safe rendering validation is deterministic. | `server/tests/lab-03/comments-notes.unit.test.ts` | unit |
| T-AUTH-01 | Login accepts an active email/password pair and returns the safe current-user shape. | `server/tests/lab-03/auth.api.test.ts` | API |
| T-AUTH-02 | Unknown, inactive, and wrong-password logins return the same safe 401 envelope. | `server/tests/lab-03/auth.api.test.ts` | API/security |
| T-AUTH-03 | `mustChangePassword` permits only the change-password and logout/current-user bootstrap operations. | `server/tests/lab-03/auth.api.test.ts` | API |
| T-AUTH-04 | Change password clears `mustChangePassword`, rotates the session, and old credentials no longer work. | `server/tests/lab-03/auth.api.test.ts` | API |
| T-AUTH-05 | Logout invalidates the session; current-user after logout is 401; no token is in a response. | `server/tests/lab-03/auth.api.test.ts` | API/security |
| T-AUTH-06 | CSRF/origin checks protect unsafe cookie-authenticated requests. | `server/tests/lab-03/auth.api.test.ts` | API/security |
| T-AUTHZ-01 | Anonymous requests to every protected route receive the standard 401 envelope. | `server/tests/lab-03/authorization.api.test.ts` | API |
| T-AUTHZ-02 | Requester cannot call staff/admin routes, forge role/owner/author fields, or read another requester’s ticket. | `server/tests/lab-03/authorization.api.test.ts` | API/security |
| T-AUTHZ-03 | IT Staff cannot call user-management routes; Administrator can, subject to safety rules. | `server/tests/lab-03/authorization.api.test.ts` | API/security |
| T-AUTHZ-04 | Inactive users and sessions are rejected even when a stale cookie is presented. | `server/tests/lab-03/authorization.api.test.ts` | API |
| T-AUTHZ-05 | First-login password-gated requests stop before requester/ticket lookups with `PASSWORD_CHANGE_REQUIRED`. | `server/tests/lab-03/authorization.api.test.ts` | API/security |
| T-STAFF-01 | Queue supports exact defaults, search, status/priority/assignment filters, deterministic sort, and pagination metadata. | `server/tests/lab-03/staff-queue.api.test.ts` | API |
| T-STAFF-02 | Queue never returns another requester’s private data or `passwordHash`/session fields. | `server/tests/lab-03/staff-queue.api.test.ts` | API/security |
| T-STAFF-03 | Claim is atomic; a race returns a conflict and does not overwrite an existing owner. | `server/tests/lab-03/staff-queue.api.test.ts` | API/concurrency |
| T-STAFF-04 | Assign/reassign accepts only active IT Staff users and rejects Requester/Admin targets. | `server/tests/lab-03/staff-queue.api.test.ts` | API |
| T-DETAIL-01 | Staff detail returns the exact ticket, requester summary, assignment, priority/status, comments, notes, and active attachment metadata. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | API |
| T-DETAIL-02 | Detail ownership is server-scoped; malformed, missing, inactive, and foreign identifiers are safe 404/400 responses. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | API/security |
| T-DETAIL-03 | Priority updates validate enum values and ignore client identity/timestamps. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | API |
| T-DETAIL-04 | Status updates enforce the matrix and required confirmation for terminal transitions. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | API |
| T-COMMENT-01 | Requester can append a public comment only to an owned active ticket. | `server/tests/lab-03/comments-notes.api.test.ts` | API |
| T-COMMENT-02 | IT Staff/Admin can append public comments; author and createdAt come from the session/server. | `server/tests/lab-03/comments-notes.api.test.ts` | API |
| T-COMMENT-03 | IT Staff/Admin can append internal notes; Requester receives indistinguishable 404/403 and no note body. | `server/tests/lab-03/comments-notes.api.test.ts` | API/security |
| T-COMMENT-04 | Blank, over-limit, HTML/script, and forged author/time inputs are rejected or safely rendered. | `server/tests/lab-03/staff-ticket-detail.api.test.ts` | API/security |
| T-COMMENT-05 | Comment and note records are append-only; update/delete endpoints do not exist. | `server/tests/lab-03/comments-notes.api.test.ts` | API |
| T-ADMIN-01 | Admin user list supports name/email search, optional role filter, deterministic pagination, and safe fields only. | `server/tests/lab-03/users-admin.api.test.ts` | API |
| T-ADMIN-02 | Create/edit accepts one valid role, normalizes email, and rejects duplicate email/invalid role. | `server/tests/lab-03/users-admin.api.test.ts` | API |
| T-ADMIN-03 | Activate/deactivate invalidates sessions; self-deactivation and removal of the last active Administrator are rejected. | `server/tests/lab-03/users-admin.api.test.ts` | API/security |
| T-ADMIN-04 | Initial-password reset stores only a hash, sets `mustChangePassword`, and never returns/logs the password. | `server/tests/lab-03/users-admin.api.test.ts` | API/security |
| T-MIG-01 | Guard rejects non-test database URLs before reset/migration tests run. | `server/tests/lab-03/migration.integration.test.ts` | integration |
| T-MIG-02 | Lab 2 migrations are applied, four Category rows and existing Ticket/Attachment rows survive, and foreign keys remain valid. | `server/tests/lab-03/migration.integration.test.ts` | integration |
| T-MIG-03 | Requester records map one-to-one to active/inactive Users without changing Ticket ownership. | `server/tests/lab-03/migration.integration.test.ts` | integration |
| T-MIG-04 | Seed is idempotent, creates the required role/status distribution, and never reactivates a deactivated reference/user. | `server/tests/lab-03/migration.integration.test.ts` | integration |
| T-MIG-05 | Session and password columns contain hashes/metadata only; no fixture secret is persisted in clear text. | `server/tests/lab-03/migration.integration.test.ts` | integration/security |
| T-REG-01 | All released Lab 2 requester ticket/list/detail/attachment tests pass with authenticated requester context. | `server/tests/lab-02/*.test.ts`, `client/tests/lab-02/*.test.ts` | regression |

## 3. Planned client tests

| ID | Planned test | Concrete path |
| --- | --- | --- |
| T-UI-01 | Login labels, errors, loading, inactive/invalid credentials, and no secret persistence. | `client/tests/lab-03/Login.test.tsx` |
| T-UI-02 | First-login change-password flow blocks role pages until success and supports logout. | `client/tests/lab-03/ChangePassword.test.tsx` |
| T-UI-03 | Role-aware navigation exposes only permitted destinations and has accessible active state. | `client/tests/lab-03/RoleShell.test.tsx` |
| T-UI-04 | Staff queue renders loading, empty, error, retry, filters, pagination, and keyboard-accessible rows. | `client/tests/lab-03/StaffTicketQueue.test.tsx` |
| T-UI-05 | Staff detail renders read-only requester data, assignment/priority/status controls, comments, notes, and safe errors. | `client/tests/lab-03/StaffTicketDetail.test.tsx` |
| T-UI-06 | Requester sees only own comments/tickets and a non-formal “problem appears resolved” action. | `client/tests/lab-03/RequesterRegression.test.tsx` |
| T-UI-07 | Admin list/search/filter/create/edit/activation/password-reset forms expose validation and confirmation states. | `client/tests/lab-03/UserManagement.test.tsx` |
| T-UI-08 | Shared dialog focus trap, Escape cancellation, `aria-describedby`, and focus restoration work in all role flows. | `client/tests/lab-03/Accessibility.test.tsx` |
| T-UI-09 | 320px, 768px, and desktop layouts have no horizontal overflow and preserve non-color status/role cues. | `client/tests/lab-03/Responsive.test.tsx` |

## 4. Planned E2E and evidence tests

| ID | Scenario | Concrete path |
| --- | --- | --- |
| T-E2E-01 | Requester logs in, changes an initial password, views own Lab 2 ticket, adds a public comment, indicates the problem appears resolved, and logs out. | `e2e/lab-03/authentication.spec.ts` |
| T-E2E-02 | IT Staff logs in, filters/paginates the queue, claims a ticket, updates priority/status, adds a public comment/internal note, and verifies requester isolation. | `e2e/lab-03/staff-ticket-flow.spec.ts` |
| T-E2E-03 | Administrator creates/edits/activates/deactivates users, resets an initial password, and verifies self/last-admin safeguards. | `e2e/lab-03/user-administration.spec.ts` |
| T-E2E-04 | Desktop/tablet/mobile screenshots cover Login, Change Password, Staff Queue, Staff Detail, and User Management states. | `artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}/` |
| T-E2E-05 | Fresh migration/seed and an upgrade from Lab 2 are run from a clean test database with command output retained. | `artifacts/lab-03/migration/` |

## 5. Contract and release evidence checks

| ID | Check | Concrete path/evidence |
| --- | --- | --- |
| T-CONTRACT-01 | All four contract documents contain the required sections, stable IDs, exclusions, and mutually consistent API/UI/test rules. | `docs/lab-03/specification.md`, `api-spec.md`, `ui-spec.md`, `tests.md` |
| T-CONTRACT-02 | Every acceptance criterion maps to concrete Test IDs and the peer-review record links the implementation and release decisions. | This matrix and `docs/lab-03/reviewer.md` |
| RELEASE-01 | All Lab 3 Issues are closed/Done on the Issues-only Kanban, the release PR is reviewer-approved, and final-main validation is recorded after merge. | GitHub Project #1, release PR, `reviewer.md`, and final command output |

## 6. Acceptance-criterion traceability

| AC | Contract outcome | Required evidence |
| --- | --- | --- |
| AC-01 | Login, logout, current user, opaque session, and safe failures. | T-AUTH-01..06, T-UI-01, T-E2E-01 |
| AC-02 | Mandatory first-login password change and session rotation. | T-AUTH-03..04, T-UI-02, T-E2E-01 |
| AC-03 | Server-enforced role navigation and authorization matrix. | T-AUTHZ-01..05, T-UI-03, T-E2E-02..03 |
| AC-04 | Lab 2 requester ticket/attachment regression and ownership continuity. | T-REG-01, T-MIG-02..03, T-UI-06, T-E2E-01 |
| AC-05 | Staff queue query, filters, pagination, and isolation. | T-STAFF-01..02, T-UI-04, T-E2E-02 |
| AC-06 | Claim, assign, and reassign ownership safely under a race. | T-STAFF-03..04, T-UI-05, T-E2E-02 |
| AC-07 | Ticket detail, IT priority, and permitted status transitions. | T-DETAIL-01..04, T-UI-05, T-E2E-02 |
| AC-08 | Public comments are append-only, attributed by server, and visible to permitted roles. | T-COMMENT-01..05, T-UI-05..06, T-E2E-01..02 |
| AC-09 | Internal notes are append-only and hidden from Requesters. | T-COMMENT-03..05, T-UI-05, T-E2E-02 |
| AC-10 | Admin search/list/create/edit and one-role assignment. | T-ADMIN-01..02, T-UI-07, T-E2E-03 |
| AC-11 | Admin activation/deactivation and initial-password reset safeguards. | T-ADMIN-03..04, T-UI-07, T-E2E-03 |
| AC-12 | Migration preserves Lab 2 data and maps requester ownership. | T-MIG-01..03, T-E2E-05 |
| AC-13 | Idempotent role/ticket/comment seed with no reactivation or secrets. | T-MIG-04..05, T-E2E-05 |
| AC-14 | API payloads, validation, status codes, and safe error envelope are exact. | T-AUTH-01..06, T-AUTHZ-01..05, T-STAFF-01..04, T-DETAIL-01..04, T-COMMENT-01..05, T-ADMIN-01..04 |
| AC-15 | UI states, accessibility, focus management, responsive layout, and non-color cues. | T-UI-01..09, T-E2E-04 |
| AC-16 | Security review finds no client-trusted identity, secret leakage, or cross-owner disclosure. | T-AUTHZ-02..04, T-COMMENT-03..04, T-MIG-05, T-E2E-02..03 |
| AC-17 | Regression suite remains green from the Lab 2 released baseline. | T-REG-01 and complete Lab 2 command output |
| AC-18 | Evidence is reproducible, screenshot provenance is recorded, and every AC maps to a concrete test. | T-E2E-04..05, this matrix, `reviewer.md` |
| AC-19 | Contract and implementation trace every AC to concrete Test IDs and a reviewer confirmation. | T-CONTRACT-01..02, this matrix, `reviewer.md` |
| AC-20 | Product and course Definition of Done are satisfied without any excluded Lab 4 behaviour. | RELEASE-01, `reviewer.md`, `ai-use.md`, and the reviewed release PR |

## 7. Commands and pass criteria

Implementation issues must run the focused suite first, then the regression
suite. The final release issue must retain the exact commands and counts:

```text
cd server && npm test -- tests/lab-03 && npm run build && npx prisma validate
cd server && npm run test:integration -- tests/lab-03/migration.integration.test.ts
cd client && npm test -- tests/lab-03 && npm run build
cd client && npm run test:e2e -- ../e2e/lab-03
git diff --check
```

The required pass condition is zero skipped, flaky, or untraceable tests. A
missing live service must be reported as a failed prerequisite, never silently
converted to a pass.

For reproducibility, the Prisma validation command is the repository-local
executable `cd server && npx prisma validate` (Prisma CLI 5.22.0). A successful
run prints `The schema at prisma/schema.prisma is valid.`; `prisma validate` is
not exposed as an npm script.

## 8. Responsive/accessibility/security checklist

Evidence must cover 320px mobile, 768px tablet, and a desktop viewport. Check
keyboard-only traversal, visible `:focus-visible`, labelled controls, field
errors via `aria-describedby`/`aria-invalid`, dialog focus trap and Escape,
table/list semantics, live status announcements, sufficient contrast, no
horizontal overflow, and text labels for every color-coded role/status/priority.

Security evidence must include forged identity fields, cross-requester IDs,
inactive users, stale cookies, CSRF/origin failures, path/query tampering,
password-hash/token redaction, and no secrets in screenshots or logs.

## 9. Deferred items (explicitly outside Lab 3)

No test is planned for email delivery, MFA, SSO, self-registration, password
reset email, Actions Taken, SLA/escalation/notifications, dashboards/KPIs,
multi-tenancy, production deployment, account deletion, bulk/import/export,
history/audit log, or any Lab 4 behavior.
