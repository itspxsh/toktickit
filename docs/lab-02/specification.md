# TokTickIT Lab 2 Sprint Engineering Specification

**Contract version:** 1.0
**Status:** Approved for implementation after peer review of L2-01
**Scope baseline:** `main` commit `854547e`

This document is the implementation contract for Lab 2. It records the
decisions made from the stakeholder request; it is intentionally shorter than
the handout. Detailed HTTP examples are in `api-spec.md`, the visual contract
is in `ui-spec.md`, and the planned evidence is in `tests.md`.

## 1. Sprint Goal

Deliver a professional, responsive Requester-facing ticketing slice in which a
student can choose a seeded Development Requester for testing, create and find
their own support Tickets, inspect a Ticket, and manage permitted Attachments.
The slice must be traceable from the UI through the REST API to PostgreSQL and
must leave a clean extension point for real authentication in Lab 3.

## 2. Stakeholder Request Interpretation

The IT department needs a safe Requester experience for describing a problem,
classifying it, selecting a requested priority, attaching evidence, and
submitting it. After submission the same Requester must be able to search,
filter, sort, paginate, and open only their own Tickets. Lab 2 uses a visible
Development Requester selector as a testing context; it is not login,
authentication, authorization, or security.

## 3. Scope

### Included

- Active Development Requester selection, persistence, switching, and route guard.
- Zen Green application shell and reusable responsive form, list, badge,
  validation, loading, empty, error, and pagination components.
- Create Ticket with backend-generated Ticket Number and Date.
- Active Categories and Related Systems loaded from PostgreSQL.
- My Tickets search, filters, stable sorting, pagination, and ownership isolation.
- Read-only Requester Ticket Detail.
- Attachment upload, metadata, active download/preview, and soft removal with
  reason and confirmation.
- Unit, API/integration, UI, style, responsive, accessibility, and E2E tests.
- GitHub Issues, feature branches, peer-reviewed PRs, staging integration, and
  one release PR into `main`.

### Explicitly excluded

- Passwords, login, logout, sessions, tokens, authentication, and real RBAC.
- IT Staff queues, claiming, reassignment, IT Priority editing, or administration.
- Public Comments, Internal Notes, Actions Taken, or collaboration history.
- Status transitions beyond the initial `NEW` status.
- Administrator CRUD for users or reference data.

## 4. Functional Requirements

- **FR-01:** Before Ticket screens are usable, the app shall require a selected
  active Development Requester.
- **FR-02:** The selector shall load active Requesters from PostgreSQL and show
  loading, empty, failure, keyboard, and responsive states.
- **FR-03:** The selected requester shall be shown in the shell and persisted
  locally as a testing context only.
- **FR-04:** Changing requester shall invalidate requester-scoped data and
  reload it; dirty Create Ticket data requires confirmation.
- **FR-05:** Create Ticket shall capture Category, Related System, Summary,
  Requested Priority, Description, and optional Attachments.
- **FR-06:** Ticket Number, Ticket Date, Requester, Current Status, and IT
  Priority shall be read-only/system-controlled.
- **FR-07:** Valid submission shall create one Ticket and display its official
  Ticket Number and next action.
- **FR-08:** Duplicate submission/retry shall be idempotent.
- **FR-09:** My Tickets shall list only Tickets owned by the selected Requester.
- **FR-10:** My Tickets shall support documented search, filters, sorting, and
  pagination with metadata.
- **FR-11:** My Tickets shall distinguish no Tickets from no matching results.
- **FR-12:** Ticket Detail shall show owned Ticket information read-only.
- **FR-13:** Ticket Detail shall list active and removed Attachment metadata.
- **FR-14:** An owner shall be able to add a permitted Attachment.
- **FR-15:** An owner shall be able to download/preview an active Attachment.
- **FR-16:** An owner shall be able to soft-remove an active Attachment with a
  confirmation and removal reason.
- **FR-17:** Removed Attachments shall not be downloadable or previewable.
- **FR-18:** All requester-scoped failures shall use safe errors and preserve
  recoverable form/list state.

## 5. Business Rules

- **BR-01:** The backend/database generates a unique Ticket Number in the form
  `TKT-YYYY-NNNNNN`; sequence gaps are allowed and numbers are never reused.
- **BR-02:** A new Ticket starts with Current Status `NEW`.
- **BR-03:** Lab 2's Development Requester selector is a testing mechanism, not
  authentication or security.
- **BR-04:** Only `isActive = true` Requesters appear in the selector.
- **BR-05:** A persisted requester id is revalidated against active data on boot;
  missing/inactive values are cleared.
- **BR-06:** A requester switch clears or reloads all requester-scoped data and
  cancels obsolete requests; dirty forms require confirmation.
- **BR-07:** Requester-scoped API calls require the testing context header
  `X-Development-Requester-Id`.
- **BR-08:** Ticket and Attachment access requires ownership by that requester;
  missing and not-owned resources both return safe `404` responses.
- **BR-09:** Category and Related System references must exist and be active.
- **BR-10:** Summary is required, trimmed, and 5-120 characters.
- **BR-11:** Description is required, trimmed, and 10-2,000 characters.
- **BR-12:** Requested Priority accepts only `LOW`, `MEDIUM`, `HIGH`, or `URGENT`.
- **BR-13:** System-generated values cannot be supplied or overridden by the UI.
- **BR-14:** Create requests use a unique `Idempotency-Key`; replaying the same
  key and payload returns the existing Ticket, while a different payload is a
  `409` conflict.
- **BR-15:** A failed create preserves user-entered values and allows retry.
- **BR-16:** List search matches Ticket Number and Summary, case-insensitively.
- **BR-17:** List filters are Category, Related System, Requested Priority, and
  Current Status.
- **BR-18:** List sorting permits only documented fields and always has a stable
  secondary `id` sort.
- **BR-19:** List pages are 1-based; page sizes are 10, 20, or 50; an out-of-range
  page returns an empty data array with valid metadata.
- **BR-20:** Empty-list and no-results states are distinct in the UI.
- **BR-21:** Allowed Attachment types are JPG/JPEG, PNG, WEBP, and PDF.
- **BR-22:** Maximum Attachment size is 5 MiB (5,242,880 bytes) per file.
- **BR-23:** A Ticket has at most five active Attachments; removed files do not
  count toward this limit.
- **BR-24:** Extension, declared MIME type, and file signature must agree with an
  allowed type.
- **BR-25:** Stored filenames are UUID-based; user filenames are metadata only and
  never become filesystem paths.
- **BR-26:** Upload storage is private and is never exposed as an Express static
  directory.
- **BR-27:** An initial Ticket may remain saved when one or more Attachment uploads
  fail; successful files remain and each failure is reported separately.
- **BR-28:** Soft removal records status, timestamp, reason, and removing requester;
  metadata remains visible, but content access is blocked.
- **BR-29:** Removal requires an explicit confirmation and a trimmed reason of
  5-250 characters; repeated removal returns a documented conflict.
- **BR-30:** Filesystem/DB failures use temporary-file cleanup and compensation so
  no inaccessible metadata or orphaned permanent file is knowingly left behind.
- **BR-31:** All timestamps are stored in UTC and returned as ISO-8601 values.
- **BR-32:** Lab 2 does not implement authentication, Staff workflow, comments,
  Actions Taken, or post-creation status changes.

## 6. UI Specification Summary

The application uses the Zen Green tokens in `ui-spec.md`: primary green
`#006B3C`, secondary green `#0B7A46`, pale green `#EAF6EF`, quiet near-white
background, white surfaces, charcoal-green text, distinct read-only fields,
red field errors, amber warnings, and text-plus-color success indicators.

The shell contains TokTickIT identity, My Tickets, Create Ticket, selected
Requester display, Change Requester, active navigation, and mobile navigation.
Create Ticket groups generated/read-only fields, classification, summary and
description, attachments, and actions. My Tickets uses a desktop table and
mobile cards. Ticket Detail uses read-only field groups and a separate
Attachment section. Each screen specifies initial, loading, empty, no-results,
validation, submitting, success, failure, and recovery behavior.

Desktop is multi-column at >=992px, tablet is two-column where practical at
768-991px, and mobile stacks fields below 768px without horizontal page scroll.
All labels, required markers, errors, focus indicators, button text, and icon
labels follow `ui-spec.md`.

## 7. Data Changes

Prisma models are `Requester`, `Category`, `RelatedSystem`, `Ticket`, and
`Attachment`. `Category` gains active state while retaining Lab 1 data. Ticket
has foreign keys to Requester, Category, and RelatedSystem; Attachment has a
foreign key to Ticket and audit requester references. Ticket Number allocation
uses a PostgreSQL sequence so concurrent creates remain unique and the official
number is backend-controlled. `clientRequestId`/`Idempotency-Key` is unique.

The migration must preserve existing Lab 1 categories. The repeatable seed must
contain the four required Categories, at least six realistic Related Systems,
at least four active Requesters, and at least one inactive Requester. Seed data
uses stable natural keys and upsert; it never commits credentials.

Indexes are documented in the migration and include requester/time list access,
common requester filters, attachment status, and active reference lookups.
The schema intentionally leaves authentication identity separate from the Lab 2
testing context so Lab 3 can introduce a real identity mapping without changing
Ticket ownership semantics.

## 8. API Contract

The complete endpoint, payload, query, error, status, ownership, and file
contract is in `api-spec.md`. The API uses a consistent safe error envelope,
1-based pagination, active reference filtering, and `404` for both missing and
not-owned requester resources.

## 9. Acceptance Criteria

Each criterion maps to at least one planned test in `tests.md`.

- **AC-01:** Given active seeded Requesters, when the selector loads, then only
  active Requesters appear and loading/success states are accessible. (UI-01,
  API-01)
- **AC-02:** Given no active Requesters or a failed endpoint, then the selector
  shows a useful empty/error recovery state. (UI-02, API-02)
- **AC-03:** Given a valid selection, when the app refreshes or the requester
  changes, then the shell and all requester-scoped data use the new context. If
  the Create Ticket form has unsaved values, changing requester first requires
  an explicit confirmation to discard them; cancelling keeps the current
  requester and form unchanged, while confirming clears the dirty form and
  reloads requester-scoped data. (UI-03, E2E-01, E2E-02)
- **AC-04:** Given an inactive/missing persisted id, when the app starts, then it
  clears the id and returns to selection. (UNIT-01, UI-03)
- **AC-05:** Given valid Ticket data, when submitted, then one database Ticket is
  saved with matching requesterId, backend Ticket Number, Date, and `NEW` status.
  (UNIT-02, API-03, E2E-01)
- **AC-06:** Given invalid or boundary fields/reference ids, then field errors or
  documented API errors appear and no invalid Ticket is saved. (UNIT-03, API-04,
  UI-04)
- **AC-07:** Given a retry or double click with the same idempotency key, then no
  duplicate Ticket is created. (UNIT-04, API-05, UI-05)
- **AC-08:** Given a create failure, then entered values remain available for
  correction/retry. (UI-06, E2E-01)
- **AC-09:** Given Requester A and B, each My Tickets response contains only the
  selected owner's Tickets. (API-06, E2E-02)
- **AC-10:** Given list search, filters, sorting, and pagination, then results and
  metadata match the documented query contract and stable order. (UNIT-05,
  API-07, UI-07)
- **AC-11:** Given zero owned Tickets or a filter with zero matches, then empty and
  no-results messages are distinct and actionable. (UI-08, E2E-02)
- **AC-12:** Given an owned Ticket Number, then detail is read-only and includes
  correct references, status, priorities, and attachment metadata. (API-08, UI-09)
- **AC-13:** Given a Ticket owned by another requester, detail and attachment
  operations return safe rejection. (API-09, E2E-02)
- **AC-14:** Given an allowed file within size/count limits, then upload stores
  safe metadata and the owner can retrieve it. (UNIT-06, API-10, UI-10)
- **AC-15:** Given a wrong type/signature, oversized file, or sixth active file,
  then upload is rejected with the documented status and no active metadata is
  created. (UNIT-06, API-11, UI-11)
- **AC-16:** Given an active owned Attachment, download/preview succeeds; after
  soft removal it is blocked while metadata remains visible. (API-12, UI-11,
  E2E-03)
- **AC-17:** Given a partial initial upload failure, the Ticket remains saved,
  successful files remain, and each failed file has a retryable message. (API-13,
  UI-12, E2E-03)
- **AC-18:** Given desktop, tablet, and mobile viewports, all required screens
  have no clipping, overlap, hidden action, or horizontal page scroll. (STYLE-01,
  RESP-01, RESP-02, RESP-03)
- **AC-19:** Given keyboard-only use, labels, focus indicators, required markers,
  and non-color status cues are available. (A11Y-01, STYLE-02)
- **AC-20:** Given the final `main` branch, every planned required test passes,
  every AC has traceable evidence, and no test is skipped or disabled. (TEST-01,
  RELEASE-01)

## 10. Definition of Done

### Product completion

- [ ] All included FRs and ACs are implemented without excluded Lab 3 behavior.
- [ ] Prisma migration, seed, constraints, indexes, and ownership queries are
  reviewed and reproducible.
- [ ] API, validation, error, idempotency, Attachment, and compensation rules
  are covered by passing tests.
- [ ] UI matches approved `ui-spec.md` in all required states and viewports.
- [ ] Unit, API/integration, UI, style, accessibility, responsive, and E2E tests
  pass from documented commands; none are skipped or disabled.
- [ ] README setup/test/database instructions are current and safe.

### Course delivery

- [ ] Every Issue has its own feature branch and peer-reviewed PR into
  `lab2-staging`.
- [ ] Every review comment has an author response; `reviewer.md` records both
  directions and approvals.
- [ ] Project board uses the exact six statuses and ends with every Issue Done.
- [ ] Final release PR is `lab2-staging -> main` and is peer approved.
- [ ] One concise PDF contains `Answer Part 1` through `Answer Part 9`, readable
  links, rendered documents, test output, and screenshots.

## 11. Assumptions and Decisions

- The Lab 2 testing header is intentionally spoofable and must never be described
  as a security control.
- A Ticket is created before its initial Attachments; partial attachment failure
  does not erase a valid user request.
- Local private filesystem storage is sufficient for this MVP; a storage service
  interface keeps a future object-store migration localized.
- Search uses case-insensitive matching on Ticket Number and Summary only; this
  keeps the contract predictable and avoids an unrequested full-text feature.
- `itPriority` is nullable/read-only as `Not assigned`; only IT Staff may change
  it in a later lab.
- The selected requester is cleared on inactive state rather than silently
  falling back to another requester.
