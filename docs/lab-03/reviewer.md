# TokTickIT Lab 3 Peer-Review Record

This file records verifiable peer-review evidence for Lab 3. Reviewer for this
lab: [@justfepwx12](https://github.com/justfepwx12).

## Contract review (L3-01)

| Item | Evidence | Status |
| --- | --- | --- |
| Issue | `[Lab 3] L3-01 - Approve Sprint 3 engineering contract (Spec-DD/Test-DD)` ([#35](https://github.com/itspxsh/toktickit/issues/35)) | Closed after merge |
| Branch | `feature/lab3-01-engineering-contract` from `lab3-staging` at `d4a034c` | Merged |
| Pull request | [#36](https://github.com/itspxsh/toktickit/pull/36), base `lab3-staging` | Merged and closed |
| Reviewer | [@justfepwx12](https://github.com/justfepwx12) | Approved |
| Approval | [Approved review](https://github.com/itspxsh/toktickit/pull/36#pullrequestreview-5201636789), 2026-09-14; contract and requested traceability fixes accepted | Verified |
| Merge | [1713542](https://github.com/itspxsh/toktickit/commit/1713542ab41a66535f26800b9d0c3dbba008aafd) | Merged into `lab3-staging` on 2026-09-14 |

### Contract checklist

- [x] The 11 required specification sections are present and internally
  consistent with `Lab_3_sheet.pdf`.
- [x] FR/BR/AC IDs have unambiguous wording and every AC maps to Test IDs.
- [x] API payloads, status codes, safe error envelope, session/CSRF rules, and
  server authorization matrix agree with the data model and UI.
- [x] Requester/IT Staff/Admin boundaries do not invent email, MFA, SSO,
  Actions Taken, SLA, notifications, dashboards, deletion, or Lab 4 behaviour.
- [x] Migration explicitly preserves Lab 2 Ticket/Attachment data and maps
  requester ownership without a destructive reset.
- [x] Test-DD exists before implementation and includes negative authorization,
  migration/regression, UI, accessibility, responsive, security, and E2E paths.
- [x] Reviewer approved the PR; the review record is linked above.

## Implementation/release review log

| Issue/PR | Scope | Reviewer evidence | Approval | Merge commit |
| --- | --- | --- | --- | --- |
| [L3-02 (#37)](https://github.com/itspxsh/toktickit/issues/37) / [PR #46](https://github.com/itspxsh/toktickit/pull/46) | Data model, migration, seed, guarded test DB | [Approved review](https://github.com/itspxsh/toktickit/pull/46#pullrequestreview-5207381544) by `justfepwx12` on 2026-09-15 | [8099912](https://github.com/itspxsh/toktickit/commit/80999129c74ca8fd782b70751528462dab03fd61) into `lab3-staging` |
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
