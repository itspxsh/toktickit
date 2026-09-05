# TokTickIT Lab 2 Zen Green UI Specification

**Version:** 1.0, aligned with `specification.md` and `api-spec.md`

## 1. Visual tokens

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#006B3C` | Header, primary actions, strong emphasis |
| `--color-secondary` | `#0B7A46` | Active navigation, links, focus, hover |
| `--color-pale` | `#EAF6EF` | Selected, success, subtle sections |
| `--color-background` | `#F5F7F6` | Page background |
| `--color-surface` | `#FFFFFF` | Cards and panels with restrained shadow |
| `--color-text` | `#18352A` | Charcoal-green readable body text |
| `--color-readonly` | `#EEF2EF` | System/read-only field background |
| `--color-error` | `#A61B1B` | Invalid border and message |
| `--color-warning` | `#8A5A00` | Warning callout/badge only |
| `--color-success` | `#176B3A` | Success text plus icon/label |

Use a system sans-serif stack, 16px base text, 1.5 line height, 24px field
labels, and a consistent 8px spacing scale. Content is centered with a maximum
width of 1200px. Cards use a 1px neutral border, 8px radius, and subtle shadow.

## 2. Shared component rules

- Labels are above controls with consistent weight and spacing.
- Required labels include a red `*` and the accessible text `(required)`; the
  asterisk never replaces the field-level message.
- Inputs share one height and clear neutral border. Description is taller and
  resizable only when layout remains intact.
- Read-only controls have `readOnly` semantics, subdued background, and a
  visible `Read-only`/system label where ambiguity is possible.
- Errors use red border, `aria-invalid="true"`, `aria-describedby`, and a
  message immediately below the related field.
- Buttons always have visible text. Icon-only buttons require an accessible
  name and tooltip. Primary, secondary, tertiary, destructive, disabled, and
  busy variants are visually distinct.
- Busy submit shows text such as `Creating...`, disables itself, and prevents a
  second submission.
- Focus indicators remain visible for keyboard users and are not removed by CSS.
- Status and priority badges include text and an icon or label; color alone is
  never the only signal.

Reusable components should include `AppShell`, `FormField`, `SelectField`,
`TextAreaField`, `StatusBadge`, `PriorityBadge`, `Alert`, `LoadingState`,
`EmptyState`, `ErrorState`, `Pagination`, `AttachmentList`, and
`ConfirmationDialog`.

## 3. Application shell and navigation

Desktop header: TokTickIT identity at left, `My Tickets` and `Create Ticket`
links, selected requester name, and `Change Requester` at right. The active
route has a secondary-green underline and an accessible `aria-current` value.
Mobile navigation collapses to a labelled menu; all links remain keyboard
reachable. A requester is never shown as authenticated; the selector copy must
say `Testing context - not a login screen`.

Routes requiring a requester redirect to `/select-requester` if context is absent.

## 4. Development Requester Selection

Centered white card on the quiet background:

1. TokTickIT title and short Lab 2 testing explanation.
2. Label `Development Requester (required)` and native/select-equivalent
   dropdown populated from the API.
3. Loading indicator while options load.
4. Pale-green hint when active options exist.
5. Empty state with setup guidance when none exist.
6. Safe error state with Retry; no automatic requester fallback.
7. Cancel and Continue buttons; Continue disabled until an active option is
   selected.
8. Amber callout states explicitly that authentication arrives in Lab 3.

## 5. Create Ticket screen

Use a card with these groups:

- **System information:** Ticket Number and Ticket Date show `Generated after
  submission` in read-only styling; Requester is the selected context and read-only.
- **Classification:** Category, Related System, Requested Priority.
- **Problem:** Summary single line and Description multiline with generous width.
- **Attachments:** file picker, fixed-rule hint (`JPG, PNG, WEBP, PDF; max 5 MiB;
  max 5 active`), per-file validation/upload state.
- **Actions:** primary `Submit Ticket`, secondary `Clear`, and navigation back.

Initial state shows reference-data loading and disabled controls until required
options exist. Validation, submitting, API failure, success, and partial file
failure are explicit. Success shows the backend Ticket Number in a prominent
confirmation plus `View Ticket`, `My Tickets`, and `Create another` actions.

## 6. My Tickets screen

The header contains title, selected requester, and `Create Ticket`. A toolbar
contains search, Category, Related System, Requested Priority, Current Status,
Sort, and `Clear filters`. Every control has a label and is usable by keyboard.

At desktop, show a table with Ticket Number, Date, Summary, Category, Requested
Priority, Current Status, Related System, Last Updated, and an explicit `Open`
action. At mobile, render each row as a card with the same essential fields and
an `Open ticket` button. Pagination shows current page, total, previous/next,
and permitted page size. Loading uses skeleton rows/cards. Empty state says the
requester has no Tickets and offers Create Ticket. No-results state repeats the
active search/filter summary and offers Clear filters.

## 7. Requester Ticket Detail screen

Use read-only field groups for Ticket Number, Date, Requester, Category, Related
System, Summary, Requested Priority, IT Priority (`Not assigned`), Current
Status (`New`), and Description. Do not show comment, Staff, workflow, or
Actions Taken controls. A separate Attachment panel contains add, metadata,
preview/download, and remove actions. Removed files remain as muted metadata
with `Removed`, reason, and time but have no content action.

## 8. States and responsive rules

Every screen defines initial, loading, success, validation, submitting, empty,
no-results, failure, and recovery states. Errors are near the failed field or
panel; never only a generic top-of-page message.

- Desktop (>=992px): centered max-width, multi-column form, full ticket table.
- Tablet (768-991px): two columns where practical; Summary/Description remain
  wide enough to read.
- Mobile (<768px): fields stack, touch targets are at least 44px high, navigation
  collapses, table becomes cards, and no horizontal page scroll is permitted.
- All sizes: no clipped labels, overlapping messages, hidden buttons, or
  unreadable attachment names.

## 9. Accessibility and visual inspection

- Use semantic headings, labels, fieldsets, buttons, links, and live regions for
  async status messages.
- Keyboard order follows visual order; focus is visible after navigation and
  dialog open. Escape closes confirmation dialogs without changing data.
- Error and success messages are announced and include text plus non-color cues.
- Check screenshots against this document, not personal memory.

Required screenshot paths:

```text
artifacts/lab-02/screenshots/create-ticket/
artifacts/lab-02/screenshots/my-tickets/
artifacts/lab-02/screenshots/ticket-detail/
artifacts/lab-02/screenshots/responsive/
```

For each screen capture initial, loading, validation/error, success, and the
required desktop/tablet/mobile views. Record viewport and commit in the test
evidence.
