# Lab 2 AI Use and Reflection

**LLM/agent used:** Codex (GPT-5), primary agent `/root`.

The student remains responsible for the specification, code, tests, design
decisions, commands, dependencies, and evidence. The records below are
faithful summaries of the key prompts used during the sprint; the resulting
documents, diffs, test output, and review comments were checked manually.

## Selected key prompts

| # | Prompt name | Prompt record | What I verified/changed |
|---|---|---|---|
| 1 | Contract audit | Read the Lab 2 handout and turn it into a numbered, testable engineering contract. Identify ambiguities and explicitly exclude Lab 3 behavior. | I reviewed and approved every decision before implementation. |
| 2 | API design | Review `specification.md` and propose an internally consistent REST contract for references, tickets, list queries, ownership, and attachments. Do not write code. | I checked statuses, payloads, safe errors, and ownership predicates. |
| 3 | Data design | Review the data requirements and propose Prisma models, indexes, sequence allocation, seed data, soft removal, and a Lab 3 migration path. Do not write code. | I verified constraints and migration choices against the contract. |
| 4 | UI design | Convert `ui-spec.md` into reusable components and explicit states for selector, create, list, detail, and attachment workflows. Do not add Staff or auth features. | I compared the output with the color, responsive, and accessibility checklist. |
| 5 | TDD implementation | For the current Issue only, implement planned failing tests first, show the expected failure, then make the smallest change needed for the specified ACs. | I reviewed changed files and test relevance before accepting the PR. |
| 6 | Ownership review | Audit every requester-scoped endpoint and test cross-requester access, safe 404 behavior, switching races, and stale response handling. | I manually checked the query predicates and failure evidence. |
| 7 | Attachment review | Audit type/signature/size/count validation, safe storage names, compensation, soft removal, retained metadata, and blocked download. | I verified both successful and failure paths. |
| 8 | Completion audit | Compare implementation, tests, screenshots, PRs, and board against every AC and Definition of Done. List missing evidence; do not claim done if anything is skipped. | I fixed gaps and recorded final commands/output. |
| 9 | Release readiness | Implement L2-09 from the binding Lab 2 contract with TDD: add the integrated Playwright requester flow first, verify an expected failure when the seeded DB is unavailable, then add only the configuration/documentation needed for real E2E, responsive, accessibility, and release evidence. Do not invent product behavior or skip tests. | I added a real-stack Playwright suite, documented its database preflight and evidence paths, and kept the unavailable local database as an explicit release risk. |

## My Reflection

Using the four Lab 2 contract documents as a fixed boundary made the agent's
output more precise: each implementation step could be tied to one Issue, AC,
and test file. The most important corrections came from manual review and peer
feedback, including the AC-16/AC-17 mapping, create-only seed upserts,
migration-safety verification, centralized ticket-number allocation, and the
real-stack Playwright preflight. I also checked the changed files, dependency
diffs, database commands, screenshots, and Git history instead of accepting a
test or completion claim without evidence. The remaining final-main and PDF
evidence is intentionally marked pending until the release PR is merged and
rerun from `main`.
