# TokTickIT Lab 3 UI Specification

Lab 3 reuses the Lab 2 Zen Green visual language and shared primitives. This
document defines the screen states and interaction contract; server API
authorization remains authoritative even if a control is hidden.

## 1. Shared shell and tokens

Use the existing Zen Green CSS custom properties and `ZEN_GREEN_TOKENS` source
from Lab 2. Preserve the shell header, skip link, responsive container, card,
FormField, StatusBadge, PriorityBadge, Pagination, and ConfirmationDialog
patterns. Add role badges with text and a non-colour glyph. Every interactive
element has visible `:focus-visible` styling.

The shell displays the authenticated user’s server-provided name, email, role,
Change Password, and Logout. `aria-current="page"` marks the active route;
navigation entries are role-filtered for convenience only and are never treated
as an authorization boundary.

## 2. Routes and role navigation

| Route | Anonymous | Requester | IT Staff | Admin |
| --- | --- | --- | --- | --- |
| `/login` | view | redirect if signed in | redirect if signed in | redirect if signed in |
| `/change-password` | redirect login | if `mustChangePassword` | if `mustChangePassword` | if `mustChangePassword` |
| `/tickets`, `/create-ticket`, `/tickets/:ticketNumber` | login | own tickets | optional read-only handoff only | optional read-only handoff only |
| `/staff/tickets` | login | forbidden state | view | view |
| `/staff/tickets/:ticketNumber` | login | forbidden state | view/edit allowed | view/edit allowed |
| `/admin/users` | login | forbidden state | forbidden state | view/edit allowed |

Deep links first load `/api/auth/me`; a 401 returns to Login, a 403 renders a
safe Forbidden state, and `mustChangePassword` always routes to Change Password.
No route guard trusts a URL role, hidden input, or localStorage value.

## 3. Login and first-login Change Password

Login has labelled email/password fields, a submit button, loading state,
generic invalid-credential error, inactive-account error that does not reveal
account existence, and a keyboard-visible focus ring. Password values are
cleared after a failed attempt and never stored in localStorage or telemetry.

Change Password explains the mandatory first-login requirement, validates
12–128 characters and confirmation, shows a generic server error, and disables
role navigation until success. On success it refreshes current-user, routes to
the role home, and does not display the password or session token.

## 4. Requester continuity

Create Ticket, My Tickets, Ticket Detail, and Attachment panels retain the Lab 2
semantics but obtain identity from the authenticated session. Public comments
show author name/time and a labelled text area. “Problem appears resolved” is a
separate labelled action with confirmation/status text and never presents it as
a formal Resolved or Closed transition. Internal notes are not rendered for a
Requester, including during loading/error states.

## 5. Staff Ticket Queue

The queue provides a labelled search field, Status, IT Priority, Assignment,
Sort, page-size, and Reset controls. Loading uses a polite live region; an empty
result states the active filters; errors have a Retry button. Each row/card
exposes ticket number, summary, requester name, IT priority, current status,
assignment, and updated time with a keyboard-accessible link to detail.

Pagination exposes real buttons/links with disabled boundaries and
`aria-current="page"` on the active page control, not on a plain span. Mobile
stacks filters and cards; no horizontal scrolling is required.

## 6. Staff Ticket Detail

Detail is read-only for requester identity, ticket number, description, and
timestamps. Staff/Admin receive labelled Claim, Assign/Reassign, IT Priority,
and Status controls. Assignment options contain active IT Staff only. Invalid
transitions and race conflicts remain on the page with an alert and refreshed
server state.

Public Comments are visible in chronological order with an append-only form.
Internal Notes are visible only to Staff/Admin in a visually distinct but
non-colour-only panel. Comment/note input uses `aria-describedby`,
`aria-invalid`, a 1–2,000 character counter, and safe plain-text rendering.
Attachments reuse Lab 2 active-only metadata/download/remove behaviour.

## 7. Administrator User Management

Admin-only `/admin/users` contains a labelled name/email search, optional role
filter, active filter, pagination, and a table/card list with Name, Email, Role,
Status, First-login state, and Edit action. Create/Edit uses one role select,
email/name validation, and server errors. Activation/deactivation and initial
password reset require focused ConfirmationDialog instances; self-deactivation
and last-active-Administrator failures are clear, non-destructive alerts.

No delete, bulk, import, export, multi-role, profile, or password display
controls are present.

## 8. Dialog and keyboard rules

ConfirmationDialog sets `role="dialog"`, `aria-modal="true"`, and
`aria-describedby` to its message; traps Tab/Shift+Tab within the dialog,
closes on Escape without confirming, and restores focus to the invoking control.
Terminal status changes, deactivation, reset, and attachment removal use this
primitive. A disabled Confirm button must explain the validation reason.

## 9. Responsive, accessibility, and visual evidence

At 320px the shell stacks header/actions, form fields are full width, cards
wrap, and long names/emails ellipsize or wrap. At 768px filters and detail
panels may form two columns; desktop uses the full queue/detail layout. Global
`box-sizing:border-box`, `min-width:320px`, contrast, and focus rules prevent
overflow and keyboard traps. Every status, role, and priority has text plus a
glyph/data attribute; colour is supplementary.

Required screenshots and provenance are under
`artifacts/lab-03/screenshots/{authentication,staff-queue,staff-ticket-detail,user-management}`
for desktop/tablet/mobile loading, empty/error, and successful states. Screenshots
must contain fake data only and no password/session token.

## 10. UI exclusions

Do not add dashboards, SLA timers, notifications, Actions Taken timelines,
email/MFA/SSO screens, self-registration, account deletion, bulk tools, or Lab 4
features. A forbidden or unavailable route is represented honestly rather than
simulated with a hidden control.
