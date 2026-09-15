# TokTickIT Lab 3 API Specification

This document defines the JSON/API contract for the Lab 3 implementation issues.
The server derives the authenticated actor from an opaque session cookie; body,
query, and path fields never grant identity or authorization.

## 1. API conventions

* Base path is `/api`; JSON requests use `Content-Type: application/json`.
* Responses use the documented status and shape. Unexpected failures are
  logged server-side with a correlation ID but return only
  `{ "error": { "code": "INTERNAL_ERROR", "message": "Something went wrong." } }`.
* Validation is rejected before a database write with `400 VALIDATION_ERROR`.
  Authentication is `401 UNAUTHENTICATED`; authenticated-but-forbidden is
  `403 FORBIDDEN`; an owned resource that does not exist is `404 NOT_FOUND`;
  duplicate/race/invalid transition is `409 CONFLICT`; malformed route IDs are
  `400 INVALID_IDENTIFIER`.
* Safe not-found responses for ownership failures are indistinguishable and do
  not reveal another user’s ticket, comment, note, attachment, or existence.
* All list endpoints use `page` (default `1`), `pageSize` (default `20`, max
  `100`) and return `{items, page, pageSize, total, totalPages}`.
* Sort is deterministic: `updatedAt DESC, id DESC` unless an endpoint states a
  different allow-listed sort. Unknown query parameters are ignored; unknown
  enum values are validation errors.
* Unsafe cookie-authenticated methods require same-origin `Origin` and the
  `X-CSRF-Token` issued by `/auth/csrf`. The token is held in page memory only.
  GET/HEAD downloads do not mutate state and do not require the token.
* Passwords are accepted only over the local HTTPS/dev transport used by the
  course, hashed immediately, and never returned or logged. No endpoint returns
  a session token or password hash.
* Brute-force protection and request rate limiting are intentionally excluded
  from Lab 3; this limitation must be stated in release evidence rather than
  implied to be implemented.

## 2. Authentication and identity

### `POST /api/auth/login`

Request: `{ "email": "person@example.test", "password": "..." }`.
Email is canonicalized by the server. On success, set an opaque `tt_session`
cookie (`HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=43200`) with a fixed
12-hour absolute lifetime and no sliding extension, then return:

```json
{
  "user": {
    "id": 12,
    "name": "Example Requester",
    "email": "person@example.test",
    "role": "REQUESTER",
    "isActive": true,
    "mustChangePassword": true
  }
}
```

`200` is returned for an active correct credential. Unknown, inactive, and
wrong-password credentials all return `401` with
`{error:{code:"INVALID_CREDENTIALS",message:"Email or password is incorrect."}}`.

### `GET /api/auth/csrf`

Requires a valid session and returns `{ "csrfToken": "<opaque per-session value>" }`.
The value is not persisted in localStorage, logs, screenshots, or any User
field. `401` if unauthenticated.

### `GET /api/auth/me`

Requires a valid session and returns the safe `user` shape above. `401` for an
anonymous, expired, invalidated, or now-inactive session. If
`mustChangePassword=true`, the client must route to Change Password.

### `POST /api/auth/logout`

Requires session and CSRF token. Invalidate the server session, clear the
cookie, and return `204`. Repeated logout is idempotent (`204`); no token is
returned.

### `POST /api/auth/change-password`

Requires session, CSRF token, and `mustChangePassword=true` or a normal signed-in
user. Request: `{ "currentPassword": "...", "newPassword": "..." }`.
The new password is trimmed only for validation (the secret itself is never
echoed), must be 12–128 characters, and must differ from the current password.
On success rotate/invalidate the old session, issue a new cookie, set
`mustChangePassword=false`, and return the safe `user` shape (`200`). Wrong
current password is `401 INVALID_CREDENTIALS`; invalid values are `400`.

## 3. Authenticated Lab 2 requester APIs

The existing Lab 2 endpoints remain at their paths and response contracts. They
derive the requester from `req.user.id` and no longer accept a Development
Requester header or client requester ID. A Requester may access only their own
tickets/attachments; IT Staff/Admin may use staff detail endpoints below.

### `POST /api/tickets/:ticketNumber/resolution-indication`

Requester only, CSRF required. Body is `{ "appearsResolved": true }`. The server
records or clears the informational indication for the owned ticket and never
changes `currentStatus`. Return `{ "ticketNumber": "TKT-0001", "appearsResolved": true }`.

## 4. Staff queue and ticket operations

All endpoints in this section require IT Staff or Admin and CSRF for writes.

### `GET /api/staff/tickets`

Query: `q` (trimmed search over ticket number/summary), `status`, `itPriority`,
`assignment` (`unassigned`, `mine`, or `assigned`), `sort` (`updatedAtDesc`,
`priorityDesc`, or `statusAsc`), `page`, `pageSize`.

Response `200`:

```json
{
  "items": [{
    "ticketNumber": "TKT-0001",
    "summary": "VPN access",
    "requester": {"id": 12, "name": "Example Requester"},
    "itPriority": "HIGH",
    "currentStatus": "IN_PROGRESS",
    "assignedStaff": {"id": 21, "name": "Support One"},
    "updatedAt": "2026-09-15T08:00:00.000Z"
  }],
  "page": 1, "pageSize": 20, "total": 1, "totalPages": 1
}
```

Requester-only fields, password data, storage keys, and internal notes never
appear. Invalid filters return `400 VALIDATION_ERROR`.

### `GET /api/staff/tickets/:ticketNumber`

Returns `200`:

```json
{
  "ticket": {
    "ticketNumber": "TKT-0001", "summary": "VPN access",
    "description": "Cannot connect", "ticketDate": "2026-09-15T07:00:00.000Z",
    "requestedPriority": "MEDIUM", "itPriority": "HIGH",
    "currentStatus": "IN_PROGRESS", "appearsResolved": false,
    "requester": {"id": 12, "name": "Example Requester", "email": "person@example.test"},
    "assignedStaff": {"id": 21, "name": "Support One"},
    "attachments": [{"id": 4, "originalName": "error.png", "mimeType": "image/png", "sizeBytes": 1234, "status": "ACTIVE", "createdAt": "2026-09-15T07:02:00.000Z"}],
    "publicComments": [{"id": 7, "author": {"id": 12, "name": "Example Requester", "role": "REQUESTER"}, "body": "It still happens.", "createdAt": "2026-09-15T07:10:00.000Z"}],
    "internalNotes": [{"id": 8, "author": {"id": 21, "name": "Support One", "role": "IT_STAFF"}, "body": "Checked gateway logs.", "createdAt": "2026-09-15T07:11:00.000Z"}]
  }
}
```

Requester detail remains the Lab 2 shape and never includes `internalNotes`.
Malformed or foreign/inactive ticket numbers return `400 INVALID_TICKET_NUMBER`
or safe `404 NOT_FOUND` before disclosure.

### `POST /api/staff/tickets/:ticketNumber/claim`

IT Staff/Admin only. Empty JSON body; actor must be an active IT Staff for a
staff assignment (Admin may claim as an explicit staff owner only if the UI
chooses an active IT Staff target). An unassigned ticket is atomically assigned
and returns `200` with `{ "assignedStaff": {"id":21,"name":"Support One"} }`.
Already assigned returns `409 TICKET_ALREADY_ASSIGNED` without overwriting.

### `PATCH /api/staff/tickets/:ticketNumber/assignment`

Body `{ "assignedStaffId": 21 }` where the target is an active IT Staff User.
The actor identity is session-derived. Return `200` with the updated assignment;
invalid/inactive/Requester target is `400 INVALID_ASSIGNMENT`; concurrent stale
update is `409 CONFLICT`.

### `PATCH /api/staff/tickets/:ticketNumber/priority`

Body `{ "itPriority": "URGENT" }`. Allow-list values are `LOW|MEDIUM|HIGH|URGENT`.
Return `200` with the new value or `400 INVALID_IT_PRIORITY`.

### `PATCH /api/staff/tickets/:ticketNumber/status`

Body `{ "currentStatus": "RESOLVED", "confirm": true }`. The server checks
the transition matrix in `specification.md`; `confirm:true` is required for a
transition to `CANCELLED` or `CLOSED`. Return `200` with the new status,
`400 INVALID_STATUS_TRANSITION` for a disallowed edge, and `409 CONFIRMATION_REQUIRED`
when a terminal transition is missing confirmation. The only permitted
`CANCELLED → REOPENED` transition is authorized for an Administrator; IT Staff
cannot reopen a cancelled ticket.

## 5. Comments and internal notes

### `POST /api/tickets/:ticketNumber/comments`

Requester (owned ticket), IT Staff, or Admin. Body `{ "body": "..." }` only;
author/time fields are rejected. Trimmed plain text length is 1–2,000. Return
`201` with `{ "comment": {"id", "author", "body", "createdAt"} }`.

### `POST /api/staff/tickets/:ticketNumber/internal-notes`

IT Staff/Admin only. Same body and response rules, returning `{ "note": ... }`.
Requester access is a safe `404 NOT_FOUND`/`403 FORBIDDEN` envelope with no note
body. There are no update or delete routes for comments or notes.

## 6. Administrator user management

All endpoints require an active Admin and CSRF for writes.

### `GET /api/admin/users`

Query: `q` (name/email), optional `role` (`REQUESTER|IT_STAFF|ADMIN`), `isActive`,
`page`, `pageSize`. Response uses the list envelope and item shape
`{id,name,email,role,isActive,mustChangePassword,createdAt,updatedAt}`. No hash,
session, or initial password is returned.

### `POST /api/admin/users`

Body `{ "name": "...", "email": "...", "role": "REQUESTER", "initialPassword": "..." }`.
Name is 1–120 characters; email is canonical; role is exactly one allow-listed
value; initial password follows the 12–128 policy. Return `201` safe User shape
with `mustChangePassword:true`. Duplicate canonical email is
`409 EMAIL_ALREADY_EXISTS`; invalid role/value is `400 VALIDATION_ERROR`.

### `PATCH /api/admin/users/:userId`

Body may contain `name`, canonical `email`, `role` (one value), or `isActive`.
The server enforces duplicate email, self-deactivation, and last-active-Admin
rules. Deactivation invalidates all sessions for that User. Return `200` safe
User shape; invalid user ID is `400`, missing user is `404`, and safety failures
are `409 ADMIN_SAFETY_RULE`.

### `POST /api/admin/users/:userId/reset-initial-password`

Body `{ "initialPassword": "..." }`. Store only a new hash, set
`mustChangePassword:true`, invalidate existing sessions, and return `200` safe
User shape. The password is never echoed or logged.

## 7. Error and migration invariants

Every route must use the stable error envelope and avoid stack traces. A ticket
lookup must first combine ticket number, session ownership/role, and active
User state in one authorization-aware query where practical. Prisma errors are
mapped to the documented conflict/validation codes, never leaked.

Migration tests must prove Lab 2 Ticket/Attachment/Category/RelatedSystem counts,
foreign keys, ticket number/sequence pairing, and storage files survive. Seed
reruns are idempotent and do not reactivate rows explicitly deactivated by an
operator.
