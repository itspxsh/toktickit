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
| L2-02 Data | `feature/lab2-02-data-foundation` | [PR #21](https://github.com/itspxsh/toktickit/pull/21) | Migration, seed, constraints, ownership indexes | Pending peer review |
| L2-03 UI foundation | `feature/lab2-03-ui-foundation` | _URL_ | Tokens, reusable components, keyboard/responsive behavior | Pending |
| L2-04 Requester | `feature/lab2-04-requester-context` | _URL_ | Active-only selection, persistence, switching | Pending |
| L2-05 Create | `feature/lab2-05-create-ticket` | _URL_ | Validation, number, idempotency, failure preservation | Pending |
| L2-06 My Tickets | `feature/lab2-06-my-tickets` | _URL_ | Query contract and ownership isolation | Pending |
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
- Issue status: [#13](https://github.com/itspxsh/toktickit/issues/13) is Started in the sprint project.
- Author response: Rebased `feature/lab2-02-data-foundation` onto `lab2-staging` at `2970cae`, then pushed the branch and opened PR #21. [Issue progress comment](https://github.com/itspxsh/toktickit/issues/13#issuecomment-5553946828)
- Validation: targeted data-foundation tests 5/5, TypeScript build, Prisma schema validation, and `git diff --check` passed.
- Approval URL/date: Pending peer review.

## Board and release evidence

- Project URL: `https://github.com/users/itspxsh/projects/1`
- Final board screenshot: _path_
- Final `main` commit graph screenshot: _path_
- Directory tree screenshot: _path_
- Rendered README and `.gitignore`: _path_
- Final release PR approval: _URL_
