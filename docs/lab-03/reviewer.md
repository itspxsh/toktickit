# TokTickIT Lab 3 Peer-Review Record

This file is intentionally a factual template until the peer reviewer leaves a
verifiable GitHub review. Do not mark a checkbox or write an approval that has
not happened. Reviewer for this lab: [@justfepwx12](https://github.com/justfepwx12).

## Contract review (L3-01)

| Item | Evidence | Status |
| --- | --- | --- |
| Issue | `[Lab 3] L3-01 - Approve Sprint 3 engineering contract (Spec-DD/Test-DD)` (#35) | Open / pending |
| Branch | `feature/lab3-01-engineering-contract` from `lab3-staging` at `d4a034c` | Prepared |
| Pull request | To be recorded after push; base must be `lab3-staging` | Pending |
| Reviewer | `justfepwx12` | Requested / pending |
| Approval | Record exact review URL, date, and summary | Pending |
| Merge | Record exact merge commit into `lab3-staging` | Pending |

### Contract checklist

- [ ] The 11 required specification sections are present and internally
  consistent with `Lab_3_sheet.pdf`.
- [ ] FR/BR/AC IDs have unambiguous wording and every AC maps to Test IDs.
- [ ] API payloads, status codes, safe error envelope, session/CSRF rules, and
  server authorization matrix agree with the data model and UI.
- [ ] Requester/IT Staff/Admin boundaries do not invent email, MFA, SSO,
  Actions Taken, SLA, notifications, dashboards, deletion, or Lab 4 behaviour.
- [ ] Migration explicitly preserves Lab 2 Ticket/Attachment data and maps
  requester ownership without a destructive reset.
- [ ] Test-DD exists before implementation and includes negative authorization,
  migration/regression, UI, accessibility, responsive, security, and E2E paths.
- [ ] Reviewer left a substantive comment and approved the PR.

## Implementation/release review log

| Issue/PR | Scope | Reviewer evidence | Approval | Merge commit |
| --- | --- | --- | --- | --- |
| L3-02 | Data model, migration, seed, guarded test DB | _pending_ | _pending_ | _pending_ |
| L3-03 | Authentication, session, password change | _pending_ | _pending_ | _pending_ |
| L3-04 | Server authorization and Lab 2 requester regression | _pending_ | _pending_ | _pending_ |
| L3-05 | IT Staff queue | _pending_ | _pending_ | _pending_ |
| L3-06 | IT Staff ticket detail/workflow/comments/notes | _pending_ | _pending_ | _pending_ |
| L3-07 | Administrator user management | _pending_ | _pending_ | _pending_ |
| L3-08 | Authenticated role shell and UI integration | _pending_ | _pending_ | _pending_ |
| L3-09 | E2E, security, responsive/accessibility evidence | _pending_ | _pending_ | _pending_ |
| L3-10 | Final Lab 3 evidence and release readiness | _pending_ | _pending_ | _pending_ |

## Release gate

The release PR may target `main` only after every implementation PR is merged
into `lab3-staging`, the final validation commands pass with no skipped/flaky
tests, screenshots are provenance-linked, all Lab 3 Issues are Done on the
Issues-only Kanban board, and the reviewer confirms the release. After the
release merge, record the final-main commit and rerun the complete validation.

## Reviewer response log

| Date | Reviewer | URL | Summary / required changes | Resolution commit |
| --- | --- | --- | --- | --- |
| _pending_ | _pending_ | _pending_ | _pending_ | _pending_ |
