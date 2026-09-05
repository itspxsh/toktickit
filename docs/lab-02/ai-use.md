# Lab 2 AI Use and Reflection

**LLM/agent used:** _Record the exact model and agent for each implementation run._

The student remains responsible for the specification, code, tests, design
decisions, commands, dependencies, and evidence. Prompts below are an initial
log; update them with the exact prompts used and a short reflection after each
meaningful interaction.

## Selected key prompts

| # | Prompt name | Actual prompt (record exact text) | What I verified/changed |
|---|---|---|---|
| 1 | Contract audit | Read the Lab 2 handout and turn it into a numbered, testable engineering contract. Identify ambiguities and explicitly exclude Lab 3 behavior. | I reviewed and approved every decision before implementation. |
| 2 | API design | Review `specification.md` and propose an internally consistent REST contract for references, tickets, list queries, ownership, and attachments. Do not write code. | I checked statuses, payloads, safe errors, and ownership predicates. |
| 3 | Data design | Review the data requirements and propose Prisma models, indexes, sequence allocation, seed data, soft removal, and a Lab 3 migration path. Do not write code. | I verified constraints and migration choices against the contract. |
| 4 | UI design | Convert `ui-spec.md` into reusable components and explicit states for selector, create, list, detail, and attachment workflows. Do not add Staff or auth features. | I compared the output with the color, responsive, and accessibility checklist. |
| 5 | TDD implementation | For the current Issue only, implement planned failing tests first, show the expected failure, then make the smallest change needed for the specified ACs. | I reviewed changed files and test relevance before accepting the PR. |
| 6 | Ownership review | Audit every requester-scoped endpoint and test cross-requester access, safe 404 behavior, switching races, and stale response handling. | I manually checked the query predicates and failure evidence. |
| 7 | Attachment review | Audit type/signature/size/count validation, safe storage names, compensation, soft removal, retained metadata, and blocked download. | I verified both successful and failure paths. |
| 8 | Completion audit | Compare implementation, tests, screenshots, PRs, and board against every AC and Definition of Done. List missing evidence; do not claim done if anything is skipped. | I fixed gaps and recorded final commands/output. |

## My Reflection

_Write a concise reflection after the sprint. Explain which constraints made
agent output more precise, which suggestions needed correction, and how manual
review of tests, migrations, UI screenshots, and Git history affected the final
result._
