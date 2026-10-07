# TokTickIT Lab 4 Peer-Review Record

This is the Lab 4 review ledger. It records only verifiable events; a requested review is not an approval, and approval is not a merge. Reviewer requested for Lab 4: [@justfepwx12](https://github.com/justfepwx12).

## Contract review (L4-01)

| Item | Evidence | Status |
| --- | --- | --- |
| Issue | `[Lab 4] L4-01 - Approve Sprint 4 engineering contract (Spec-DD/Test-DD)` ([#59](https://github.com/itspxsh/toktickit/issues/59)) | Open; peer review pending |
| Baseline | `main` at `da689edc95c7e19a209dc20ec964c04b14590d78` when the contract was prepared | Verified locally |
| Branch | `feature/lab4-01-engineering-contract` from `lab4-staging` at `da689edc95c7e19a209dc20ec964c04b14590d78` | Pushed; contract commit [3fd26cf](https://github.com/itspxsh/toktickit/commit/3fd26cfb817bdcb1b5d14b6e32fb3ff65052a614); review-record update [d9e0928](https://github.com/itspxsh/toktickit/commit/d9e0928c6c4748cb30f9925bc723abb046384007) |
| Contract PR | [#60](https://github.com/itspxsh/toktickit/pull/60), base `lab4-staging` | Open; follow-up fixes pushed; re-review requested |
| Reviewer / approval | [@justfepwx12](https://github.com/justfepwx12) reviewed PR #60 ([review](https://github.com/itspxsh/toktickit/pull/60#pullrequestreview-5440584685)) and was re-requested after the fix push | Awaiting re-review; approval pending |
| Merge | No contract merge has occurred | Pending |

### L4-01 review response log

| Review evidence | Findings and contract response | Status |
| --- | --- | --- |
| [@justfepwx12 review #5440584685](https://github.com/itspxsh/toktickit/pull/60#pullrequestreview-5440584685) | Dashboard `TicketSummary` omits owner (not required by UI); add nullable `resolvedAt` to summary and detail; require confirmation for every effective transition to RESOLVED; rename dashboard Open labels to Active; cap Actions/revisions pageSize at 100; define before-only and unknown-query behavior; state assignment/priority audit intent; strengthen FR-08 traceability; retain `performedBy` as an explicit unresolved contract decision. | Addressed by [3ff284b](https://github.com/itspxsh/toktickit/commit/3ff284befea6bf4dd391937fd83e9cd38c82012c); re-review requested |

The selected dashboard contract omits owner from summary rows to avoid expanding identity exposure. `resolvedAt` is exposed as UTC ISO or null (legacy/never resolved). No L4-02+ implementation Issue may start until the reviewer and author resolve the `performedBy` meaning and approve/merge this contract PR.

The fix response is recorded in [PR comment #6044678008](https://github.com/itspxsh/toktickit/pull/60#issuecomment-6044678008); re-review was requested in [PR event #32717620441](https://github.com/itspxsh/toktickit/pull/60#event-32717620441). GitHub currently shows the request awaiting `@justfepwx12`.

### Contract review checklist

- [ ] Confirm all 11 specification sections against the Lab 4 handout.
- [ ] Approve or revise each proposed Action lifecycle, ownership/assignee/performer, revision and idempotency decision.
- [ ] Approve or revise the Ticket transition matrix and the resolution gate, including legacy Tickets without truthful completed work.
- [ ] Approve or revise dashboard scopes, formulas, time windows, list limits and drill-down semantics.
- [ ] Verify API and UI contracts agree with the specification and contain no client-trusted authorization.
- [ ] Verify every AC maps to concrete planned tests and every Test ID maps to an intended file/behavior.
- [ ] Verify the additive migration and test strategy preserve all Lab 1–3 data, ticket numbers/sequences and attachment files.
- [ ] Approve the contract PR before any L4-02–L4-12 implementation Issue is created.

## Lab 4 implementation/release review log

| Issue / PR | Scope | Reviewer evidence | Approval | Merge commit |
| --- | --- | --- | --- | --- |
| None yet | Implementation work is gated on L4-01 approval and merge | No Lab 4 implementation review has occurred | Pending | Pending |

## Reviews given to partner repository

No Lab 4 peer reviews in the partner repository have been verified or recorded yet. Add entries only after checking the actual review and merge records; do not infer them from screenshots or issue titles.

## Release gate

Not started. A released `main` validation, final evidence, Issue-only Kanban completion, and final report remain future work. No test, migration, screenshot, performance, or approval result is claimed by this initial record.
