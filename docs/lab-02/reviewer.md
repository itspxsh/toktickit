# Lab 2 Peer Review Record

This file is a living delivery record. Replace every placeholder with the real
reviewer identity, Issue/PR URL, substantive comment, author response, and
approval. Do not fabricate a review or mark a PR approved from a screenshot of
the code alone.

**Author:** Pawarisa Thongchua - 67070501032 - GitHub: [@itspxsh](https://github.com/itspxsh)
**Peer reviewer:** [@justfepwx12](https://github.com/justfepwx12)

## PRs authored by me

| Issue | Branch | PR | Review focus | Reviewer verdict |
|---|---|---|---|---|
| L2-01 Contract | `feature/lab2-01-engineering-contract` | [PR #12](https://github.com/itspxsh/toktickit/pull/12) | Spec completeness and traceability | Approved and merged into `lab2-staging` |
| L2-02 Data | `feature/lab2-02-data-foundation` | [PR #21](https://github.com/itspxsh/toktickit/pull/21) | Migration, seed, constraints, ownership indexes | Approved and merged into `lab2-staging` |
| L2-03 UI foundation | `feature/lab2-03-ui-foundation` | [PR #22](https://github.com/itspxsh/toktickit/pull/22) | Tokens, reusable components, keyboard/responsive behavior | Approved and merged into `lab2-staging` |
| L2-04 Requester | `feature/lab2-04-requester-context` | [PR #23](https://github.com/itspxsh/toktickit/pull/23) | Active-only selection, persistence, switching | Approved and merged into `lab2-staging` |
| L2-05 Create | `feature/lab2-05-create-ticket` | [PR #24](https://github.com/itspxsh/toktickit/pull/24) | Validation, number, idempotency, failure preservation | Merged into `lab2-staging`; post-merge follow-up approval pending |
| L2-06 My Tickets | `feature/lab2-06-my-tickets` | _URL_ | Query contract and ownership isolation | Implementation ready; review pending |
| L2-07 Detail | `feature/lab2-07-ticket-detail` | _URL_ | Read-only detail and cross-owner rejection | Pending |
| L2-08 Attachments | `feature/lab2-08-attachments` | _URL_ | File safety, soft removal, compensation | Pending |
| L2-09 Release readiness | `feature/lab2-09-release-readiness` | _URL_ | E2E, visual evidence, final audit | Pending |
| Release | `lab2-staging -> main` | _URL_ | Final branch, tests, PDF evidence | Pending |

For each row add:

```md
### Issue / PR
- Reviewer:
- Review URL:
- Comment received:
- Author response:
- Requested changes and fix commit (if any):
- Approval URL/date:
```

## PRs I reviewed for my partner

| Issue | PR | My substantive review comment | Partner response | Approval |
|---|---|---|---|---|
| _Record each partner PR_ | _URL_ | _Comment_ | _Response_ | Pending |

### L2-01 Contract / PR #12

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Review URL: [review comment](https://github.com/itspxsh/toktickit/pull/12#pullrequestreview-5122356383)
- Comment received: Required correction for AC-16 → UI-11 and AC-17 → UI-12; recommendation to make dirty Create Ticket requester-switch confirmation explicit in an AC and test mapping.
- Author response: Updated `specification.md` mappings, expanded AC-03 with explicit cancel/confirm behavior, aligned UI-03 and E2E-02 in `tests.md`, and documented the dialog behavior in `ui-spec.md`. [PR response comment](https://github.com/itspxsh/toktickit/pull/12#issuecomment-5553853215)
- Requested changes and fix commit: `e7d0851` (`fix(lab2): align review traceability and requester switch AC`); pushed to the PR branch.
- Approval URL/date: [approved review](https://github.com/itspxsh/toktickit/pull/12#pullrequestreview-5122487398), 2026-09-06; merged into `lab2-staging` as `2970cae`.

### L2-02 Data / PR #21

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- PR: [#21](https://github.com/itspxsh/toktickit/pull/21)
- Issue status: [#13](https://github.com/itspxsh/toktickit/issues/13) was completed through PR #21 and is now marked Done in the sprint project.
- Author response: Rebased `feature/lab2-02-data-foundation` onto `lab2-staging` at `2970cae`, then pushed the branch and opened PR #21. [Issue progress comment](https://github.com/itspxsh/toktickit/issues/13#issuecomment-5553946828)
- Validation: targeted data-foundation tests 5/5, TypeScript build, Prisma schema validation, and `git diff --check` passed.
- Review URL: [requested changes review](https://github.com/itspxsh/toktickit/pull/21#pullrequestreview-5122667468)
- Comment received: Required fixes for create-only reference upserts, real guarded-database migration verification, and one application-level Ticket number allocator pairing `ticketNumber` with `ticketSequence`.
- Author response: Changed all seed updates to `{}`, added the migration/seed safety integration probe, introduced `allocateTicketNumber`, removed the implicit sequence default, and aligned the migration workflow script with the README.
- Requested changes and fix commits: `f6d838c` (`fix(lab2): preserve reference state on seed reruns`), `76dd0e5` (`feat(lab2): centralize ticket number allocation`), and `6ec21c6` (`test(lab2): verify migration safety on guarded database`).
- Validation after fixes: server unit/API suite 11/11, migration-safety integration 1/1 against `toktickit_test`, build, Prisma validate/generate, and `git diff --check` passed.
- Approval URL/date: [approved re-review](https://github.com/itspxsh/toktickit/pull/21#pullrequestreview-5122739775), 2026-09-06; merged into `lab2-staging` as `27a5d3b`.

### L2-03 UI foundation / PR #22

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#14](https://github.com/itspxsh/toktickit/issues/14)
- PR: [#22](https://github.com/itspxsh/toktickit/pull/22)
- Branch: `feature/lab2-03-ui-foundation`, based on merged `lab2-staging` commit `27a5d3b`.
- Scope: Zen Green tokens, responsive AppShell/navigation, shared UI primitives, and keyboard/accessibility foundations; no requester or ticket workflow.
- TDD commits: `8c3861d` (contract tests first), `f10e010` (implementation).
- Validation: client tests 9/9, production build, and `git diff --check` passed.
- Review status: Approved by [@justfepwx12](https://github.com/justfepwx12); merged into `lab2-staging` as `b2f758e`.
- Approval URL/date: [approved review](https://github.com/itspxsh/toktickit/pull/22#pullrequestreview-5122808290), 2026-09-06; [follow-up approval](https://github.com/itspxsh/toktickit/pull/22#pullrequestreview-5122812066).
- Non-blocking recommendations recorded for later work: dedicated priority tones, page-link affordances for data-backed pagination, and focus trapping plus `aria-describedby` in the reusable confirmation dialog.

### L2-04 Requester context / PR #23

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#15](https://github.com/itspxsh/toktickit/issues/15)
- PR: [#23](https://github.com/itspxsh/toktickit/pull/23)
- Branch: `feature/lab2-04-requester-context`, based on `lab2-staging` merge `b2f758e`.
- Scope: active requester API/selector, safe errors, local testing-context persistence and revalidation, route guard, switching confirmation, and stale-request protection.
- TDD commits: `cf34aa2` (contract tests first), `aa6c3af` (API), `38449f7` (client implementation), and `83806ad` (explicit route-guard redirect test/fix).
- Validation: client tests 15/15 and build; server tests 14/14 and build; `git diff --check` passed.
- Review status: Approved by [@justfepwx12](https://github.com/justfepwx12); merged into `lab2-staging` as `84072db`.
- Approval URL/date: [approved review](https://github.com/itspxsh/toktickit/pull/23#pullrequestreview-5122882110), 2026-09-06; [follow-up approval](https://github.com/itspxsh/toktickit/pull/23#pullrequestreview-5122885332).

### L2-05 Create Ticket / PR #24

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#16](https://github.com/itspxsh/toktickit/issues/16)
- PR: [#24](https://github.com/itspxsh/toktickit/pull/24)
- Branch: `feature/lab2-05-create-ticket`, based on the merged L2-04 requester context and `lab2-staging`.
- Scope: active Category/Related System reference endpoints, requester-scoped Ticket creation, validation and trimming, sequence-backed ticket number/date, idempotency replay/conflict handling, accessible Create Ticket UI, failure preservation, and dirty navigation protection.
- Explicit exclusions: authentication, Staff workflow, comments, Actions Taken, status transitions, and attachment lifecycle (L2-08).
- TDD commits: `b687460` (contract tests first), `ca87413` (server API), `4a9a871` (client flow and shared navigation/a11y updates), `5851a6c` (placeholder route test first), and `38c5ac9` (read-only placeholder route).
- Validation: client tests 21/21 and build; focused server Lab 2 suite 21/21, build, Prisma validate, and `git diff --check` passed. Full server suite is 22/23 because the existing Lab 1 database-backed category test requires `DATABASE_URL` and returned the safe 500 in this environment.
- Review status: Initial review approved the implementation and requested a non-blocking read-only `/tickets/:ticketNumber` placeholder; the recommendation is addressed by `38c5ac9`. The PR was merged by the reviewer into `lab2-staging` as `4854743`; a separate post-merge approval comment is not yet recorded.

### L2-06 My Tickets / Issue #17

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#17](https://github.com/itspxsh/toktickit/issues/17)
- Branch: `feature/lab2-06-my-tickets`, based on `lab2-staging` merge `4854743`.
- Scope: requester-owned My Tickets list API, documented search/filter/sort/pagination, stable ordering, responsive table/card presentation, loading/empty/no-results/error recovery, and stale-request cancellation on requester changes.
- Explicit exclusions: ticket creation/editing, Ticket Detail implementation, attachments, authentication, Staff workflow, comments, Actions Taken, and status transitions.
- TDD commits: `7347262` (contract tests first), `f140b41` (server list API), `2c427d2` (client query API), and `ed85b4f` (My Tickets UI and route integration).
- Validation: client tests 26/26 and build; focused server Lab 2 suite 27/27 and build; `git diff --check` passed.
- Review status: Implementation is ready for peer review; PR URL and review evidence will be recorded after publication.

## Board and release evidence

- Project URL: `https://github.com/users/itspxsh/projects/1`
- Final board screenshot: _path_
- Final `main` commit graph screenshot: _path_
- Directory tree screenshot: _path_
- Rendered README and `.gitignore`: _path_
- Final release PR approval: _URL_
