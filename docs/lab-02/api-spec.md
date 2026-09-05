# TokTickIT Lab 2 API Specification

**Version:** 1.0, aligned with `specification.md`

## 1. API conventions

Base URL is `/api`. JSON responses use UTF-8. Dates are ISO-8601 UTC. Every
requester-scoped endpoint requires:

```http
X-Development-Requester-Id: <positive integer>
```

This header is a temporary test context, not authentication or authorization.
The server still performs ownership checks. The client must not send passwords,
tokens, cookies, or claims that this header is secure.

Errors use this envelope and never expose stack traces, SQL, absolute paths, or
filesystem names:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "fieldErrors": { "summary": "Summary must contain 5-120 characters." }
  }
}
```

Common statuses are `200` retrieval/replay/removal, `201` creation/upload,
`204` only where no response body is needed, `400` malformed input, `404`
missing or not-owned resource, `409` conflict, `413` oversized file, `415`
unsupported file, `422` field validation, and `500` safe unexpected failure.

## 2. Reference data

### `GET /api/categories`

Returns active categories ordered by `name ASC`:

```json
[{ "id": 1, "name": "Account and Access" }]
```

Success: `200`. Unexpected DB failure: `500`.

### `GET /api/related-systems`

Returns active related systems ordered by `name ASC` with the same response
shape and statuses as categories.

### `GET /api/requesters`

Returns active Development Requesters ordered by `name ASC`:

```json
[{ "id": 1, "name": "Jennifer Anderson", "email": "jennifer@example.test" }]
```

Inactive requesters are never returned. Success: `200`; unexpected failure:
`500`.

## 3. Ticket creation

### `POST /api/tickets`

Headers:

```http
Content-Type: application/json
X-Development-Requester-Id: 1
Idempotency-Key: <UUID>
```

Request body:

```json
{
  "categoryId": 2,
  "relatedSystemId": 7,
  "summary": "Laptop battery drains quickly",
  "requestedPriority": "MEDIUM",
  "description": "The battery drains faster than usual during normal use."
}
```

The server trims Summary and Description, validates active references and enum
values, obtains a sequence value for `TKT-YYYY-NNNNNN`, sets current status to
`NEW`, and stores the selected requester id. The response is:

```json
{
  "data": {
    "id": 1,
    "ticketNumber": "TKT-2026-000001",
    "ticketDate": "2026-09-06T00:00:00.000Z",
    "requester": { "id": 1, "name": "Jennifer Anderson" },
    "category": { "id": 2, "name": "Hardware" },
    "relatedSystem": { "id": 7, "name": "Corporate Laptop" },
    "summary": "Laptop battery drains quickly",
    "requestedPriority": "MEDIUM",
    "description": "The battery drains faster than usual during normal use.",
    "itPriority": null,
    "currentStatus": "NEW",
    "createdAt": "2026-09-06T00:00:00.000Z",
    "updatedAt": "2026-09-06T00:00:00.000Z"
  },
  "replayed": false
}
```

Statuses: `201` new Ticket, `200` same-key replay, `400` missing/malformed
requester context or idempotency key, `404` requester missing, `403` requester
inactive, `409` idempotency conflict, `422` field/reference validation, `500`
safe failure. A failed request must not leak database details.

## 4. Ticket list

### `GET /api/tickets`

Supported query parameters:

| Parameter | Allowed/default | Meaning |
|---|---|---|
| `search` | optional, max 100 chars | Ticket Number or Summary, case-insensitive |
| `categoryId` | positive integer | Category filter |
| `relatedSystemId` | positive integer | Related System filter |
| `requestedPriority` | enum | Priority filter |
| `status` | `NEW` | Current Status filter |
| `sortBy` | `updatedAt` | `updatedAt`, `createdAt`, `ticketNumber`, `requestedPriority` |
| `sortOrder` | `desc` | `asc` or `desc` |
| `page` | `1` | 1-based page number |
| `pageSize` | `10` | `10`, `20`, or `50` |

The requester filter is always applied from the header, never from a client
query parameter. Default and secondary sort is `updatedAt DESC, id DESC`.
Invalid parameters return `400`. A valid page beyond the last page returns an
empty `data` array.

Response:

```json
{
  "data": [{ "id": 1, "ticketNumber": "TKT-2026-000001", "summary": "..." }],
  "pagination": { "page": 1, "pageSize": 10, "totalItems": 1, "totalPages": 1 }
}
```

Success: `200`; malformed context: `400`; missing/inactive requester: `404` or
`403`; unexpected DB failure: `500`.

## 5. Ticket detail

### `GET /api/tickets/:ticketNumber`

Returns the full read-only Ticket plus Attachment metadata. The server checks
the requester header in the same query. Success: `200`; missing or not-owned:
`404`; malformed number: `400`; unexpected failure: `500`.

## 6. Attachments

### `GET /api/tickets/:ticketNumber/attachments`

Returns metadata for active and removed files, ordered active first then
`createdAt ASC`. Removed entries include `status`, `removedAt`, and
`removalReason`, but no download URL. Success: `200`; ownership/missing: `404`.

### `POST /api/tickets/:ticketNumber/attachments`

Uses `multipart/form-data` with one field named `file`. The server checks owner,
active count, size (<=5,242,880 bytes), extension, declared MIME, and file
signature before moving a UUID-named private file into permanent storage.

Success (`201`):

```json
{
  "data": {
    "id": 10,
    "originalName": "battery.png",
    "mimeType": "image/png",
    "sizeBytes": 18234,
    "status": "ACTIVE",
    "createdAt": "2026-09-06T00:00:00.000Z"
  }
}
```

Other statuses: `400` missing file, `404` missing/not-owned Ticket, `409` five
active files, `413` oversized, `415` unsupported/signature mismatch, `422`
metadata validation, `500` safe failure. Temporary files are removed on every
failure; a DB insert/rename failure invokes compensation.

### `GET /api/tickets/:ticketNumber/attachments/:attachmentId`

Returns metadata, including removed metadata. It never returns a storage path.
Success: `200`; missing/not-owned: `404`.

### `GET /api/tickets/:ticketNumber/attachments/:attachmentId/download`

Streams only an active, owned file with a safe `Content-Disposition` filename.
Removed, missing, and not-owned files all return `404`. Storage paths are never
accepted from the client.

### `DELETE /api/tickets/:ticketNumber/attachments/:attachmentId`

Request body:

```json
{ "reason": "Uploaded the wrong screenshot." }
```

The owner must confirm in the UI; the API trims and requires 5-250 characters.
It changes status to `REMOVED`, records timestamp/reason/removing requester, and
returns `200` with metadata. Missing/not-owned: `404`; already removed: `409`;
invalid reason: `422`; unexpected failure: `500`. The content is never served
after removal.

## 7. Ownership and failure rules

Every Ticket and Attachment query includes the requester ownership predicate.
The server does not trust requester ids in URL/query/body to override the
testing header. Error responses are safe and consistent. Client request races
must be cancelled or ignored after requester switching so old data cannot
overwrite the new context.
