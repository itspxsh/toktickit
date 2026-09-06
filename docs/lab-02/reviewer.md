# Lab 2 Peer Review Record

This file is a living delivery record. Each completed row records the real
reviewer identity, Issue/PR URL, substantive comment, author response, and
approval. Work that is still awaiting a GitHub PR or peer review is labelled
explicitly as pending; no approval is inferred from local code or screenshots.

**Author:** Pawarisa Thongchua - 67070501032 - GitHub: [@itspxsh](https://github.com/itspxsh)
**Peer reviewer:** [@justfepwx12](https://github.com/justfepwx12)

## PRs authored by me

| Issue | Branch | PR | Review focus | Reviewer verdict |
|---|---|---|---|---|
| L2-01 Contract | `feature/lab2-01-engineering-contract` | [PR #12](https://github.com/itspxsh/toktickit/pull/12) | Spec completeness and traceability | Approved and merged into `lab2-staging` |
| L2-02 Data | `feature/lab2-02-data-foundation` | [PR #21](https://github.com/itspxsh/toktickit/pull/21) | Migration, seed, constraints, ownership indexes | Approved and merged into `lab2-staging` |
| L2-03 UI foundation | `feature/lab2-03-ui-foundation` | [PR #22](https://github.com/itspxsh/toktickit/pull/22) | Tokens, reusable components, keyboard/responsive behavior | Approved and merged into `lab2-staging` |
| L2-04 Requester | `feature/lab2-04-requester-context` | [PR #23](https://github.com/itspxsh/toktickit/pull/23) | Active-only selection, persistence, switching | Approved and merged into `lab2-staging` |
| L2-05 Create | `feature/lab2-05-create-ticket` | [PR #24](https://github.com/itspxsh/toktickit/pull/24) | Validation, number, idempotency, failure preservation | Approved and merged into `lab2-staging` |
| L2-06 My Tickets | `feature/lab2-06-my-tickets` | [PR #25](https://github.com/itspxsh/toktickit/pull/25) | Query contract and ownership isolation | Approved and merged into `lab2-staging` |
| L2-07 Detail | `feature/lab2-07-ticket-detail` | [PR #26](https://github.com/itspxsh/toktickit/pull/26) | Read-only detail and cross-owner rejection | Approved and merged into `lab2-staging` |
| L2-08 Attachments | `feature/lab2-08-attachments` | [PR #27](https://github.com/itspxsh/toktickit/pull/27) | File safety, soft removal, compensation | Approved and merged into `lab2-staging`; Issue #19 closed |
| L2-09 Release readiness | `feature/lab2-09-release-readiness` | [PR #28](https://github.com/itspxsh/toktickit/pull/28) | E2E, visual evidence, final audit | Approved and merged into `lab2-staging` |
| Release | `lab2-staging -> main` | _URL_ | Final branch, tests, PDF evidence | Pending |

For every PR that is opened, append its review URL, substantive review
comment, author response, any fix commits, and approval date below the matching
issue section. Do not fill those fields before the corresponding GitHub event
exists.

## PRs I reviewed for my partner

| Issue | PR | My substantive review comment | Partner response | Approval |
|---|---|---|---|---|
| Lab 2 Contract | [PR #68](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/68) | [Review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/68#pullrequestreview-5060992692): approved the contract after checking AC/test traceability, attachment storage safety, requester ownership, read-only tokens, state distinctions, and soft-removal semantics; noted atomic ticket numbering and centralized requester-header validation. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/68#issuecomment-5474271749): thanked reviewer and confirmed readiness to merge. | Approved; merged as `b3545d2` |
| App Shell & UI Foundation | [PR #70](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/70) | [Review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/70#pullrequestreview-5093407074): approved Zen Green tokens, responsive shell, active navigation, reusable Button/TextInput/Badge components, and 20/20 client tests. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/70#issuecomment-5528044787): thanked reviewer; stale schema was to be resolved by rebasing after the database PR. | Approved; merged as `1ff0b6e` |
| Development Requester Context | [PR #71](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/71) | [Initial review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/71#pullrequestreview-5121799437) requested lint fixes and preservation of the original redirect destination; [follow-up](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/71#pullrequestreview-5122122136) required ProtectedRoute to pass the destination through. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/71#issuecomment-5552974246): fixed lint, requester-selection redirect handling, and ProtectedRoute in `708935d`/`df4296b`. | [Approved](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/71#pullrequestreview-5122218581); merged as `48304ed` |
| Create Ticket | [PR #72](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/72) | [Review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/72#pullrequestreview-5122782951): approved dynamic references, validation, duplicate-submission protection, active requester ownership, generated ticket number, success state, and 25/25 client plus 12/12 server tests. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/72#issuecomment-5554399755): thanked reviewer and confirmed the merge. | Approved; merged as `5845773` |
| My Tickets | [PR #73](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/73) | [Review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/73#pullrequestreview-5122889500) requested strict, non-`parseInt` requester-header validation; re-review [approved](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/73#pullrequestreview-5122907982) after the regression test covered malformed values. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/73#issuecomment-5554646747): fixed in `c5aed96`, with 22/22 server tests and clean build. | Approved; merged as `afe9d82` |
| Ticket Detail | [PR #74](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/74) | [Initial review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/74#pullrequestreview-5125009310) requested strict ticket-ID validation and removal/implementation of the non-functional Download button; re-review [approved](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/74#pullrequestreview-5125133171) after the scoped removal. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/74#issuecomment-5558781472): fixed ID validation in `3236856` and removed the out-of-scope button in `2d388ea`; attachment APIs remain in later issues. | Approved; merged as `a9219bc` |
| E2E QA & Release Evidence | [PR #75](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/75) | [Review](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/75#pullrequestreview-5125447414) requested a Vitest-aware config because the client build failed; re-review [approved](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/75#pullrequestreview-5125554244) after the config/dependency fix and verification of tests, lint, builds, and E2E. | [Response](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/75#issuecomment-5559667814): fixed in `7a6cdd6`, upgraded Vitest for Vite 8 compatibility, and reran all checks. | Approved; merged as `4e5910d` |
| Final Lab 2 Release | [PR #76](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/76) | [Approval comment](https://github.com/justfepwx12/TokTikIT-CPE334-Software-Engineering/pull/76#pullrequestreview-5125770542): approved the staging-to-main promotion after checking the reviewed feature set, test/build/E2E evidence, artifact screenshots, and traceability. | No separate author response was required before merge; the PR description records the release scope and validation evidence. | Approved; merged into `main` as `ad176a7` |

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
- Review status: Approved by [@justfepwx12](https://github.com/justfepwx12) in [review](https://github.com/itspxsh/toktickit/pull/24#pullrequestreview-5123145060); the non-blocking read-only `/tickets/:ticketNumber` placeholder recommendation was addressed by `38c5ac9`. The PR was merged by the reviewer into `lab2-staging` as `4854743`; the reviewer confirmed post-merge with [LGTM approval](https://github.com/itspxsh/toktickit/pull/24#issuecomment-5558588020), and the author recorded the closure response [here](https://github.com/itspxsh/toktickit/pull/24#issuecomment-5558770792).

### L2-06 My Tickets / Issue #17

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#17](https://github.com/itspxsh/toktickit/issues/17)
- Branch: `feature/lab2-06-my-tickets`, based on `lab2-staging` merge `4854743`.
- Scope: requester-owned My Tickets list API, documented search/filter/sort/pagination, stable ordering, responsive table/card presentation, loading/empty/no-results/error recovery, and stale-request cancellation on requester changes.
- Explicit exclusions: ticket creation/editing, Ticket Detail implementation, attachments, authentication, Staff workflow, comments, Actions Taken, and status transitions.
- TDD commits: `7347262` (contract tests first), `f140b41` (server list API), `2c427d2` (client query API), and `ed85b4f` (My Tickets UI and route integration).
- Validation: client tests 26/26 and build; focused server Lab 2 suite 27/27 and build; `git diff --check` passed.
- PR: [#25](https://github.com/itspxsh/toktickit/pull/25), opened against `lab2-staging`; reviewer requested from [@justfepwx12](https://github.com/justfepwx12).
- Review status: Approved by [@justfepwx12](https://github.com/justfepwx12) in [review](https://github.com/itspxsh/toktickit/pull/25#pullrequestreview-5125140633) with follow-up approval [recorded here](https://github.com/itspxsh/toktickit/pull/25#pullrequestreview-5125146241); merged into `lab2-staging` as `ec5bd73`.

### L2-07 Ticket Detail / Issue #18

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#18](https://github.com/itspxsh/toktickit/issues/18)
- PR: [#26](https://github.com/itspxsh/toktickit/pull/26), opened against `lab2-staging`; reviewer requested from [@justfepwx12](https://github.com/justfepwx12).
- Branch: `feature/lab2-07-ticket-detail`, based on the merged L2-06 commit `ec5bd73`.
- Scope: requester-owned read-only Ticket Detail API/UI, safe cross-requester rejection, reference fields, UTC timestamps, attachment metadata, loading/error/retry states, and responsive accessible navigation.
- Explicit exclusions: Ticket editing, status transitions, attachment upload/download/removal, authentication, Staff workflow, comments, Actions Taken, and other Lab 3 behavior.
- TDD commits: `a40cbaa` (contract tests first) and `7a4d362` (API, typed client boundary, detail view, and responsive styles).
- Validation: server focused Lab 2 suite 31/31 and build; client suite 30/30 and build; `git diff --check` passed. Red state was confirmed before implementation; no tests are skipped or disabled.
- Review status: Approved by [@justfepwx12](https://github.com/justfepwx12); the reviewer verified the read-only detail contract, ownership-safe 404 behavior, attachment metadata, and responsive states. Merged into `lab2-staging` as `e2d6229` on 2026-09-06.

### L2-08 Attachments / Issue #19

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#19](https://github.com/itspxsh/toktickit/issues/19)
- PR: [#27](https://github.com/itspxsh/toktickit/pull/27), opened against `lab2-staging`; reviewer requested from [@justfepwx12](https://github.com/justfepwx12).
- Branch: `feature/lab2-08-attachments`.
- Scope: requester-owned attachment upload, private storage, download, metadata, soft removal, compensation, and the integrated Create Ticket/Detail UI lifecycle. Authentication, Staff workflow, comments, Actions Taken, and status transitions remain excluded.
- Review comment received: Approval verified ownership, extension/MIME/magic-byte checks, 5 MiB and five-active limits, safe UUID storage, active-only download, removal reason confirmation, compensation, and per-file upload outcomes. Two non-blocking hardening recommendations were recorded: make the active-count check atomic and treat file unlink cleanup as best-effort after a successful soft removal.
- Author response: The review was acknowledged; the recommendations remain explicitly non-blocking follow-up hardening and were not expanded into this closed Issue.
- Approval/closure: Approved by [@justfepwx12](https://github.com/justfepwx12) and merged into `lab2-staging` as `b403d57` on 2026-09-06. The merge closed Issue #19.

### L2-09 Release Readiness / Issue #20

- Reviewer: [@justfepwx12](https://github.com/justfepwx12)
- Issue: [#20](https://github.com/itspxsh/toktickit/issues/20)
- Branch: `feature/lab2-09-release-readiness`, based on the latest `lab2-staging` merge `b403d57`.
- Scope: integrated Playwright requester flows, responsive/accessibility evidence, documented test/build commands, contract-wide AC audit, and release evidence only. No new product behavior, authentication, Staff workflow, comments, Actions Taken, or status transitions.
- Local evidence: commits `c5ed319` through `5ebdc20`; server 39/39 tests, client 34/34 tests, both builds, Playwright desktop/tablet/mobile 3/3, and `git diff --check` passed on the feature branch.
- PR: [#28](https://github.com/itspxsh/toktickit/pull/28), opened against `lab2-staging`; reviewer requested from [@justfepwx12](https://github.com/justfepwx12).
- Review comment received: Approved after verifying the real-stack Playwright E2E journey, responsive/accessibility screenshots, evidence provenance, server start entrypoint, and AC/test traceability. The reviewer recorded the bash portability and package-scoped Playwright import as non-blocking recommendations.
- Author response: Thanked the reviewer for validating the E2E, responsive/accessibility evidence, and release traceability.
- Approval/merge: Approved by [@justfepwx12](https://github.com/justfepwx12) and merged into `lab2-staging` as `58b04cc` on 2026-09-06.
- Status: L2-09 implementation is complete. The remaining release step is the single `lab2-staging -> main` PR; no approval is inferred for that release PR yet.

## Lab 2 submission evidence map

The handout requires one concise PDF with these headings in this exact order.
The repository is the source of truth; screenshots and final command output
must be refreshed from `main` after the release PR is merged.

| PDF heading | Evidence to include | Repository source |
|---|---|---|
| Answer Part 1 | Git graph, Project board with all Issues Done, reviewer record, README, `.gitignore`, directory tree | GitHub Project, `reviewer.md`, `README.md`, `.gitignore` |
| Answer Part 2 | Numbered specification and proof it preceded implementation PRs | `specification.md`, contract commit history |
| Answer Part 3 | Planned tests, AC traceability, complete passing output from `main` | `tests.md`, test files and terminal captures |
| Answer Part 4 | LLM identity, 6-10 key prompts, reflection | `ai-use.md` |
| Answer Part 5 | Development Requester selection screen | E2E screenshots and UI tests |
| Answer Part 6 | Create Ticket states and backend-generated values | `artifacts/lab-02/screenshots/create-ticket/` |
| Answer Part 7 | My Tickets requester A/B, query states, pagination, isolation | `artifacts/lab-02/screenshots/my-tickets/` and E2E evidence |
| Answer Part 8 | Detail, attachment lifecycle, removal metadata, blocked access | `artifacts/lab-02/screenshots/ticket-detail/` and API tests |
| Answer Part 9 | Zen Green UI, responsive screenshots, completed visual checklist | `ui-spec.md`, `tests.md`, `artifacts/lab-02/screenshots/responsive/` |

## Board and release evidence

- Project URL: `https://github.com/users/itspxsh/projects/1`
- Final board screenshot: _path_
- Final `main` commit graph screenshot: _path_
- Directory tree screenshot: _path_
- Rendered README and `.gitignore`: _path_
- Final release PR approval: _URL_
