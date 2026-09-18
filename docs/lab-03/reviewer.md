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
| [L3-03 (#38)](https://github.com/itspxsh/toktickit/issues/38) / [PR #47](https://github.com/itspxsh/toktickit/pull/47) | Authentication, session, first-login password change, CSRF and session security | PR #47 review by `justfepwx12` on 2026-09-16 | Approved after all requested security/test fixes; validation recorded in PR | [8721df6](https://github.com/itspxsh/toktickit/commit/8721df6) into `lab3-staging` |
| [L3-04 (#39)](https://github.com/itspxsh/toktickit/issues/39) / [PR #48](https://github.com/itspxsh/toktickit/pull/48) | Server authorization and Lab 2 requester regression | [Approved review](https://github.com/itspxsh/toktickit/pull/48#pullrequestreview-5238556111) by `justfepwx12` on 2026-09-17 | Approved after requested authorization/CSRF fixes; follow-ups noted for later | [030b35d](https://github.com/itspxsh/toktickit/commit/030b35dd46e9cb3a822433a01101c96bdf01265d) into `lab3-staging` |
| [L3-05 (#40)](https://github.com/itspxsh/toktickit/issues/40) / [PR #49](https://github.com/itspxsh/toktickit/pull/49) | IT Staff queue, filters, pagination, and server-authorized access | Approved review by `justfepwx12` on 2026-09-18; non-blocking follow-ups recorded in PR | Approved; validation and TDD chain verified | [d28dc4b](https://github.com/itspxsh/toktickit/commit/d28dc4b) into `lab3-staging` |
| [L3-06 (#41)](https://github.com/itspxsh/toktickit/issues/41) / [PR #50](https://github.com/itspxsh/toktickit/pull/50) | IT Staff ticket detail/workflow/comments/notes | Approved review by `justfepwx12` on 2026-09-18; requested duplicate-route, Admin-reopen, test-coverage, and UI-error fixes verified | Approved; Lab 3 67/67 and Lab 2 regression 37/37 passed | [67e3b1c](https://github.com/itspxsh/toktickit/commit/67e3b1c) into `lab3-staging` |
| [L3-07 (#42)](https://github.com/itspxsh/toktickit/issues/42) / [PR #51](https://github.com/itspxsh/toktickit/pull/51) / [Review](https://github.com/itspxsh/toktickit/pull/51#pullrequestreview-5241209951) | Administrator user management | Approved review by `justfepwx12` on 2026-09-18; password-hash and CSRF follow-ups recorded as non-blocking | Approved; server 76/76, client 41/41, clean builds and Prisma validation | [e6534a4](https://github.com/itspxsh/toktickit/commit/e6534a4) into `lab3-staging` |
| [L3-08 (#43)](https://github.com/itspxsh/toktickit/issues/43) / [PR #52](https://github.com/itspxsh/toktickit/pull/52) | Authenticated role shell and UI integration | [Approved review](https://github.com/itspxsh/toktickit/pull/52#pullrequestreview-5250598354) by `justfepwx12` on 2026-09-18 | Approved; client 56/56, build and `git diff --check` passed after requested fixes | [e82f9b3](https://github.com/itspxsh/toktickit/commit/e82f9b378d17f1be708bd33a9a8d31e1f455b489) into `lab3-staging` |
| L3-09 | E2E, security, responsive/accessibility evidence | [PR #53](https://github.com/itspxsh/toktickit/pull/53) requested changes; skeleton-only status and live evidence deferred pending guarded environment | _pending_ | _pending_ |
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
| 2026-09-18 | [@justfepwx12](https://github.com/justfepwx12) | [PR #53 review](https://github.com/itspxsh/toktickit/pull/53#pullrequestreview-5251108145) | Requested ticket-number locator correction, exact E2E titles/steps, and live evidence; non-blocking notes covered rerun-safe resolution, reset commands, viewport mapping, and focus evidence. | pending |
