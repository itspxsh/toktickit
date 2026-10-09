# TokTickIT Lab 4 Peer-Review Record

This is the Lab 4 review ledger. It records only verifiable events; a requested review is not an approval, and approval is not a merge. Reviewer requested for Lab 4: [@justfepwx12](https://github.com/justfepwx12).

## Contract review (L4-01)

| Item | Evidence | Status |
| --- | --- | --- |
| Issue | `[Lab 4] L4-01 - Approve Sprint 4 engineering contract (Spec-DD/Test-DD)` ([#59](https://github.com/itspxsh/toktickit/issues/59)) | Closed after approval and merge |
| Baseline | `main` at `da689edc95c7e19a209dc20ec964c04b14590d78` when the contract was prepared | Verified locally |
| Branch | `feature/lab4-01-engineering-contract` from `lab4-staging` at `da689edc95c7e19a209dc20ec964c04b14590d78` | Pushed; contract commit [3fd26cf](https://github.com/itspxsh/toktickit/commit/3fd26cfb817bdcb1b5d14b6e32fb3ff65052a614); review-record update [d9e0928](https://github.com/itspxsh/toktickit/commit/d9e0928c6c4748cb30f9925bc723abb046384007) |
| Contract PR | [#60](https://github.com/itspxsh/toktickit/pull/60), base `lab4-staging` | Merged 2026-10-08 |
| Reviewer / approval | [@justfepwx12](https://github.com/justfepwx12) approved PR #60 ([review](https://github.com/itspxsh/toktickit/pull/60#pullrequestreview-5454413837)) after verifying fix commit [3ff284b](https://github.com/itspxsh/toktickit/commit/3ff284befea6bf4dd391937fd83e9cd38c82012c) | Approved 2026-10-08 09:21:30 UTC |
| Merge | [08cdc4d](https://github.com/itspxsh/toktickit/commit/08cdc4de01ec50eba294433f2b1afe6cd2a6b0f9), merged into `lab4-staging` | Merged 2026-10-08 09:21:52 UTC |

### L4-01 review response log

| Review evidence | Findings and contract response | Status |
| --- | --- | --- |
| [@justfepwx12 review #5440584685](https://github.com/itspxsh/toktickit/pull/60#pullrequestreview-5440584685) | Dashboard `TicketSummary` owner is omitted consistently with UI; `resolvedAt` is exposed; confirmation required for effective RESOLVED/CANCELLED and RESOLVED→CLOSED transitions; dashboard labels use Active; Actions/revisions pageSize is 1..100; before-only and unknown-query behavior clarified; assignment/priority history intentionally not audited; FR-08 traceability strengthened; `performedBy` decision was resolved in approval. | Addressed in [3ff284b](https://github.com/itspxsh/toktickit/commit/3ff284befea6bf4dd391937fd83e9cd38c82012c); approved and merged |

The selected dashboard contract omits owner from summary rows to avoid expanding identity exposure. `resolvedAt` is exposed as UTC ISO or null (legacy/never resolved). The approved `performedBy` decision is: the authenticated actor who completes an Action is recorded as its performer; the assignee is a separate field and is not substituted automatically. This decision is binding for implementation Issues.

The fix response is recorded in [PR comment #6044678008](https://github.com/itspxsh/toktickit/pull/60#issuecomment-6044678008); re-review was requested in [PR event #32717620441](https://github.com/itspxsh/toktickit/pull/60#event-32717620441). The later approval and merge are recorded above.

### Contract review checklist

- [x] Confirm all 11 specification sections against the Lab 4 handout.
- [x] Approve the proposed Action lifecycle, ownership/assignee/performer, revision and idempotency decisions.
- [x] Approve the Ticket transition matrix and resolution gate, including legacy Tickets without truthful completed work.
- [x] Approve dashboard scopes, formulas, time windows, list limits and drill-down semantics.
- [x] Verify API and UI contracts agree with the specification and contain no client-trusted authorization.
- [x] Verify every AC maps to concrete planned tests and every Test ID maps to an intended file/behavior.
- [x] Verify the additive migration and test strategy preserve all Lab 1–3 data, ticket numbers/sequences and attachment files.
- [x] Approve and merge the contract PR before implementation Issues were created.

## Lab 4 implementation/release review log

| Issue / PR | Scope | Reviewer evidence | Approval | Merge commit |
| --- | --- | --- | --- | --- |
| L4-02 Issue [#61](https://github.com/itspxsh/toktickit/issues/61) / PR [#72](https://github.com/itspxsh/toktickit/pull/72) | Reconcile inherited contract and authenticated regression baseline | Base `lab4-staging` at `08cdc4d`; TDD red commits [78251f3](https://github.com/itspxsh/toktickit/commit/78251f3), [1480e30](https://github.com/itspxsh/toktickit/commit/1480e30), [5c1ff5f](https://github.com/itspxsh/toktickit/commit/5c1ff5f); implementation [24ff67e](https://github.com/itspxsh/toktickit/commit/24ff67e). Red failures reproduced: requester Ticket has null `itPriority`; Admin claim denied and Admin excluded from assignee query; protected reference fetches omit credentials. Validation: server 82/82, client 60/60, server/client builds, Prisma validation and `git diff --check` passed; no schema/migration changes. Reviewer [@justfepwx12](https://github.com/justfepwx12) [approved](https://github.com/itspxsh/toktickit/pull/72#pullrequestreview-5458518916) on commit `43f9839`; merged into `lab4-staging` at [5516376](https://github.com/itspxsh/toktickit/commit/55163763e1a777f63bceebd58ad5c03f93976f41) on 2026-10-08. Issue #61 closed after merge. |
| L4-03 Issue [#62](https://github.com/itspxsh/toktickit/issues/62) / PR [#73](https://github.com/itspxsh/toktickit/pull/73) | Add Actions and workflow data foundation, additive migration, deterministic seed, and guarded reset support. Base `lab4-staging` at `5516376`. TDD red commit [fd32bd2](https://github.com/itspxsh/toktickit/commit/fd32bd2); test assertion/recovery refinements [d83391a](https://github.com/itspxsh/toktickit/commit/d83391a), [bb7136c](https://github.com/itspxsh/toktickit/commit/bb7136c), [0d3cd3b](https://github.com/itspxsh/toktickit/commit/0d3cd3b); implementation [0691abe](https://github.com/itspxsh/toktickit/commit/0691abe). Initial red was missing Lab 4 tables on fresh migration deployment. Final validation: serial server 82/82, PostgreSQL migration suites 11/11 (Lab 2–4, T-MIG-01..05), client 60/60, server/client builds, Prisma validation and `git diff --check` passed; final commands had no skipped tests. The redacted serial PostgreSQL 18 run on a fresh disposable guarded database is recorded in [PR #73 comment](https://github.com/itspxsh/toktickit/pull/73#issuecomment-6084720930). PR #73 is open with `Lab4` label; approval and merge are pending. Do not close Issue #62 until peer approval and merge. |

L4-02 validation on `feature/lab4-02-inherited-regression`: server suite 82/82; client suite 60/60; server TypeScript build passed; client build passed; `./node_modules/.bin/prisma validate --schema prisma/schema.prisma` passed from `server`; `git diff --check` passed. No tests were skipped. PostgreSQL migration integration and live E2E are out of scope because this change has no schema migration or new user journey; existing suites remain the regression gate.

## Reviews given to partner repository

No Lab 4 peer reviews in the partner repository have been verified or recorded yet. Add entries only after checking the actual review and merge records; do not infer them from screenshots or issue titles.

## Release gate

Not started. A released `main` validation, final evidence, Issue-only Kanban completion, and final report remain future work. No test, migration, screenshot, performance, or approval result is claimed by this record.
