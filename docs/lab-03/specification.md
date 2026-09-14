# TokTickIT Lab 3 Sprint Engineering Specification

This specification is the reviewed contract for Lab 3. It extends the released
Lab 2 requester application at `main` commit `d4a034c` and is the gate before
any implementation issue is started.

## 1. Sprint Goal

Replace the Lab 2 Development Requester selector with real server-enforced
authentication and three single-role personas: Requester, IT Staff, and
Administrator. Preserve the Lab 2 ticket and attachment product while adding a
small, auditable staff workflow and minimalist user management. The sprint must
be secure, accessible, responsive, testable, and ready for later labs without
inventing Lab 4 capabilities.

## 2. Stakeholder Request Interpretation

The requester needs to sign in, keep using their own tickets and attachments,
and communicate publicly when a problem appears resolved. IT Staff need a
protected queue and detail view to claim/reassign work, set IT priority,
progress tickets through an agreed matrix, and communicate through public
comments and private internal notes. Administrators need only the smallest user
management surface: list/search/filter, create/edit one role, activation, and
initial-password reset.

Authentication is a real product boundary, not a UI simulation. The browser
may display identity and role, but every protected read and write derives the
actor from a server session. A client-supplied requester ID, role, owner,
author, timestamp, status, or priority is ignored or rejected.

## 3. Scope

### Included

* Email/password login, opaque server session, current-user, logout, expiry,
  inactive-account rejection, and mandatory first-login password change.
* One role per user: `REQUESTER`, `IT_STAFF`, or `ADMIN`.
* Authenticated continuation of Lab 2 ticket creation/list/detail and
  attachment lifecycle with server-side ownership checks.
* Requester public comments on owned tickets and a non-formal “problem appears
  resolved” indication.
* IT Staff/Admin queue search, filters, deterministic sorting, pagination,
  detail, claim, assign/reassign to active IT Staff, IT priority, permitted
  status transitions, public comments, and internal notes.
* Admin user list/search/optional role filter, create/edit, activation toggle,
  and set-new-initial-password with safety constraints.
* Prisma migration, deterministic idempotent seed, isolated test database,
  regression preservation of Lab 2 rows, API contract, UI contract, tests,
  accessibility, responsive evidence, and peer-review traceability.

### Explicitly excluded

Email delivery, email password-reset links, MFA, SSO, self-registration,
account deletion, account unlocking, multiple roles, profiles beyond the
fields required here, bulk/import/export/history, Actions Taken, SLA or
escalation, notifications, dashboards/KPIs, multi-tenancy, production
deployment, and any Lab 4 behaviour.

## 4. Functional Requirements

| ID | Requirement |
| --- | --- |
| FR-01 | Authenticate an active user with normalized email and password. |
| FR-02 | Require a first-login password change before role pages are usable. |
| FR-03 | Expose current safe identity and support logout, expiry, and invalidation. |
| FR-04 | Render role-aware navigation from server-provided identity. |
| FR-05 | Preserve Lab 2 requester ticket/list/detail/attachment behaviour under authenticated ownership. |
| FR-06 | Allow a Requester to append a public comment to an owned ticket. |
| FR-07 | Allow a Requester to indicate that a problem appears resolved without changing ticket status. |
| FR-08 | Provide IT Staff/Admin queue query with search, filters, sort, and pagination. |
| FR-09 | Provide ticket detail with requester summary, assignment, priority/status, comments, notes, and attachment metadata. |
| FR-10 | Allow IT Staff/Admin to claim, assign, and reassign tickets to active IT Staff. |
| FR-11 | Allow IT Staff/Admin to set IT priority from the controlled enum. |
| FR-12 | Enforce the documented status transition matrix and confirmations. |
| FR-13 | Allow permitted users to append public comments with server authorship. |
| FR-14 | Allow IT Staff/Admin to append internal notes hidden from Requesters. |
| FR-15 | Provide Admin user list/search/optional role filter with safe fields and pagination. |
| FR-16 | Provide Admin create/edit with exactly one role and duplicate-email/role validation. |
| FR-17 | Provide Admin activation/deactivation and initial-password reset with self/last-admin safeguards. |
| FR-18 | Deliver migration/seed safety, API/UI contracts, tests, accessibility, responsive evidence, and release traceability. |

## 5. Business Rules

| ID | Rule |
| --- | --- |
| BR-01 | Email is trimmed and compared case-insensitively; the stored canonical form is lowercase. |
| BR-02 | Every User has exactly one role and an `isActive` flag. No client role field grants access. |
| BR-03 | Passwords are salted, one-way hashes; clear-text passwords and hashes never appear in responses, logs, screenshots, or source. |
| BR-04 | A newly seeded or reset password sets `mustChangePassword=true`; only password change, current-user, and logout are available until it is cleared. |
| BR-05 | Sessions are opaque, server-side, expiry-bound, HttpOnly, Secure, SameSite=Lax cookies; logout and deactivation invalidate them. |
| BR-06 | Unsafe cookie-authenticated requests require a same-origin check and a server-issued CSRF token held only in page memory. |
| BR-07 | Anonymous, inactive, expired, or invalid sessions receive the same safe 401 envelope and no identity enumeration. |
| BR-08 | Requester reads/writes are scoped to the authenticated User; query/body requester IDs are never trusted. |
| BR-09 | IT Staff and Admin may access staff ticket operations; Requester cannot access staff or admin endpoints. |
| BR-10 | Only Admin may manage users; an Admin cannot create a second role on one User. |
| BR-11 | A ticket may be assigned only to an active IT Staff User; an atomic claim never overwrites an existing owner. |
| BR-12 | Queue defaults are page 1, 20 items, newest `updatedAt` then `id` descending; maximum page size is 100. |
| BR-13 | Queue filters are ANDed; status, IT priority, and assignment values are enum/controlled values. |
| BR-14 | IT priority is `LOW`, `MEDIUM`, `HIGH`, or `URGENT`; it is distinct from Lab 2 requester priority. |
| BR-15 | Statuses are `NEW`, `OPEN`, `IN_PROGRESS`, `WAITING_FOR_REQUESTER`, `RESOLVED`, `CLOSED`, `REOPENED`, and `CANCELLED`. |
| BR-16 | Allowed transitions are: `NEW→OPEN|IN_PROGRESS|CANCELLED`; `OPEN→IN_PROGRESS|WAITING_FOR_REQUESTER|RESOLVED|CANCELLED`; `IN_PROGRESS→WAITING_FOR_REQUESTER|RESOLVED|CANCELLED`; `WAITING_FOR_REQUESTER→OPEN|IN_PROGRESS|RESOLVED`; `RESOLVED→CLOSED|REOPENED`; `CLOSED→REOPENED`; `REOPENED→IN_PROGRESS|WAITING_FOR_REQUESTER|RESOLVED|CANCELLED`; `CANCELLED→REOPENED` only for Admin. |
| BR-17 | Status changes are IT Staff/Admin only; `RESOLVED→CLOSED` and any transition to `CANCELLED` require explicit confirmation in the UI and API payload. |
| BR-18 | A Requester’s resolved indication is a separate timestamp/flag and never silently changes status. |
| BR-19 | Public comments are nonblank, trimmed, plain text of 1–2,000 characters, append-only, and visible to Requester (own ticket), IT Staff, and Admin. |
| BR-20 | Internal notes are nonblank, trimmed, plain text of 1–2,000 characters, append-only, and visible only to IT Staff/Admin. |
| BR-21 | Comment/note author and created time are assigned by the server; supplied author/time fields are rejected or ignored. |
| BR-22 | Rendered comment/note content is text, not executable HTML; update/delete endpoints are not provided. |
| BR-23 | Admin cannot deactivate self or the last active Administrator; deactivation invalidates that User’s sessions. |
| BR-24 | Admin create/edit/reset accepts no bulk operation, duplicate canonical email, invalid role, or clear-text password persistence. |
| BR-25 | Migrations add User/session/workflow data without dropping Lab 2 Ticket, Attachment, Category, or RelatedSystem rows; counts and foreign keys are verified. |
| BR-26 | Seed is deterministic and idempotent: at least 4 active + 1 inactive Requester, 3 active + 1 inactive IT Staff, 1 active Admin, realistic distributed tickets, and safe comments/notes. |
| BR-27 | Seed updates are create-only for reference/users where reactivation would violate an explicit deactivation; reruns never reactivate soft-removed data. |
| BR-28 | Test reset is allowed only for a test-scoped database URL and is schema-complete. |
| BR-29 | API errors use the stable `{error:{code,message}}` envelope and never disclose whether a foreign owner or credential exists. |
| BR-30 | Every protected operation has a server authorization predicate and a corresponding negative test. |
| BR-31 | No source, log, localStorage, API body, or screenshot contains passwords, session tokens, or real secrets. |
| BR-32 | Lab 3 changes retain Lab 2 attachment storage-key/path safety and active-only download/removal semantics. |

### Authorization matrix

| Operation | Requester | IT Staff | Admin |
| --- | --- | --- | --- |
| Login/current-user/logout/password change | own session | own session | own session |
| Own ticket/list/detail/attachments/comments/resolved indication | own only | no requester impersonation | no requester impersonation |
| Staff queue/detail/claim/assign/priority/status/public comment | no | yes | yes |
| Internal notes | no | yes | yes |
| User list/create/edit/activate/deactivate/reset | no | no | yes |

## 6. UI Specification Summary

The shared Zen Green shell from Lab 2 remains the visual baseline. Unauthenticated
users see Login; a first-login user sees Change Password; authenticated users
see only the navigation permitted by the server role. All screens define
loading, empty, validation, forbidden/not-found, retry, and success states.

The Requester area keeps Create Ticket, My Tickets, Ticket Detail, attachments,
public comments, and the non-formal resolved indication. IT Staff/Admin receive
Staff Queue and Staff Ticket Detail. Admin receives User Management. Every
destructive or terminal operation uses the accessible confirmation dialog from
Lab 2 with focus trap, Escape cancellation, `aria-describedby`, and restoration.

Controls use labels, keyboard focus, `aria-current`, `aria-invalid`,
`aria-describedby`, live announcements, and text plus glyph cues instead of
colour alone. Layouts support 320px mobile, 768px tablet, and desktop without
horizontal overflow; long email/name values wrap or ellipsize safely.

## 7. Data Changes

The implementation issues will evolve Prisma with a forward-only migration:

* `User`: `id`, `name`, canonical unique `email`, `passwordHash`, `role`,
  `isActive`, `mustChangePassword`, `createdAt`, `updatedAt`.
* `Session`: `id`, `userId`, `tokenHash`, `expiresAt`, nullable
  `invalidatedAt`, `createdAt`; only a hash is persisted.
* `Ticket` additions: authenticated `requesterUserId`, nullable
  `assignedStaffId`, controlled `itPriority`, extended `currentStatus`, and
  nullable `requesterResolvedAt`; existing Lab 2 ticket number/sequence and
  requester priority remain intact.
* `PublicComment`: `id`, `ticketId`, `authorUserId`, `body`, `createdAt`.
* `InternalNote`: `id`, `ticketId`, `authorUserId`, `body`, `createdAt`.
* Attachment removal ownership is migrated to the User identity while the
  old requester relationship is retained during the backfill verification;
  storage keys and files are not rewritten.

Migration order is create tables/enums and nullable columns; backfill Users
one-to-one from Lab 2 Requester natural keys; backfill Ticket/Attachment foreign
keys; assert counts, uniqueness, and ownership; then enforce non-null/foreign
keys and add indexes. The migration must be transactional where PostgreSQL
allows and must fail closed on a count mismatch. It must never reset or truncate
the development database. A rollback/runbook is documented in the migration
issue; destructive rollback is not run against shared data.

Seed uses environment-supplied test/development initial passwords, hashes them
before persistence, and documents the local hand-off without committing values.
It upserts by canonical natural keys inside one transaction and never reactivates
an explicitly inactive user.

## 8. API Contract

The exact method, payload, response, status, authentication, and error rules
are in [`api-spec.md`](api-spec.md). The API is same-origin JSON except the
existing attachment download stream. All protected routes derive `actor` from
the server session and apply the authorization matrix above.

## 9. Acceptance Criteria

| ID | Acceptance criterion |
| --- | --- |
| AC-01 | Active users can log in/logout, retrieve current-user, and receive safe failures with opaque expiring sessions. |
| AC-02 | First-login and reset users are forced through password change with session rotation before role navigation. |
| AC-03 | Every protected route enforces the role matrix server-side; forged client identity fields cannot change access or ownership. |
| AC-04 | Lab 2 requester ticket/list/detail/attachment flows continue under authenticated User ownership and preserve existing rows/files. |
| AC-05 | Staff Queue implements specified query defaults, filters, deterministic sorting, pagination, and isolation. |
| AC-06 | Claim/assign/reassign is restricted to active IT Staff targets and is atomic under a race. |
| AC-07 | Staff Ticket Detail exposes controlled priority/status and rejects invalid transitions or missing confirmations. |
| AC-08 | Public comments are validated, server-attributed, append-only, and visible to the permitted roles. |
| AC-09 | Internal notes are validated, server-attributed, append-only, and never disclosed to Requesters. |
| AC-10 | Admin can list/search/filter/create/edit one-role Users with duplicate and invalid-input errors. |
| AC-11 | Admin activation/deactivation/reset follows self and last-active-Administrator safeguards and invalidates sessions. |
| AC-12 | Upgrade migration preserves all Lab 2 Ticket/Attachment/Category/RelatedSystem rows and ownership mappings. |
| AC-13 | Seed is idempotent, meets role/ticket distribution, and does not reactivate inactive rows or persist clear-text secrets. |
| AC-14 | API responses/statuses/errors match `api-spec.md`, contain only safe fields, and pass negative authorization tests. |
| AC-15 | UI fulfils role states, form/dialog semantics, keyboard accessibility, non-colour cues, and responsive rules. |
| AC-16 | Security review finds no client-trusted identity, cross-owner disclosure, token/hash leakage, or unsafe comment rendering. |
| AC-17 | Lab 2 regression plus Lab 3 focused/unit/API/integration suites pass with zero skipped/flaky tests. |
| AC-18 | E2E desktop/tablet/mobile evidence is reproducible with pinned commit, viewport, command, and screenshot provenance. |
| AC-19 | Contract and implementation trace every AC to concrete Test IDs and a reviewer confirmation. |
| AC-20 | Product and course Definition of Done are satisfied without any excluded Lab 4 behaviour. |

## 10. Definition of Done

### Product completion

Implementation issues are merged into `lab3-staging` only after focused red-
then-green tests, regression tests, migration evidence, server authorization
negative tests, API/UI contract checks, responsive/a11y/security checks, and
reviewer approval. `main` receives only the reviewed release PR. No protected
route relies on hidden controls or client role state, and no secret is present
in the repository or evidence.

### Course delivery

The repository contains the four contract documents, implementation test paths,
reviewer and AI-use records, migration/seed provenance, complete AC/Test
traceability, screenshots at required viewports, final test/build counts, and
the release PR. Issues are labelled `Lab3`, assigned, and represented on the
Kanban board as Issues only; branches are not board items. The peer reviewer is
`justfepwx12`. The Lab 3 submission PDF is generated locally from the released
tree after final-main validation and is not required to be committed if the
course submission path accepts the artifact separately.

## 11. Assumptions and Decisions

1. Session cookies are selected over browser-stored bearer tokens so tokens do
   not enter localStorage or screenshots; SameSite and Origin/CSRF checks cover
   unsafe requests.
2. A User has one role only. A person who needs another role is represented by
   a separate account; multi-role aggregation is outside Lab 3.
3. Admin is allowed the same staff read/write operations as IT Staff so that
   user-management support does not require an unscoped back door; all actions
   still use the staff authorization predicate.
4. Requester resolved indication is informational and distinct from Resolved or
   Closed status. It is not an Actions Taken record.
5. Comment and note bodies are plain text with server-side escaping, not rich
   HTML or markdown, keeping rendering deterministic and safe.
6. Initial-password values are supplied out-of-band through ignored environment
   files or test fixtures. The API never returns them and no real credential is
   used for evidence.
7. Pagination is offset/page based for this lab; cursor pagination and advanced
   reporting are deferred.
8. Existing Lab 2 `RequestedPriority` remains separate from the new IT priority
   enum. Existing ticket numbers and sequences remain the single allocation
   path.
9. `docs/lab-03/tests.md` is written before implementation and is updated only
   with measured results and provenance after tests actually run.
10. No implementation Issue may start and no L3-02+ Issue may be created until
    this contract is peer-reviewed and merged into `lab3-staging`.
