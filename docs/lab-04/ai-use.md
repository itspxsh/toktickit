# TokTickIT Lab 4 AI Use and Provenance

This record is limited to accessible conversation, GitHub and repository evidence. Selected prompt descriptions below are explicitly paraphrased, not presented as verbatim prompts. Human decisions and approvals remain attributed to the author/reviewer. The exact model variant for each historical assistant turn is not retained in the available records.

## Tools, model and human verification

- **Assistant:** Codex desktop assistant. Per-turn model/version identifiers are unavailable in the retained history; no specific GPT/Luna version is claimed.
- **Verified tools:** local repository review and editing; GitHub connector reads of Issues, pull requests, paginated review submissions, conversation comments, inline review threads and timelines; retained PostgreSQL/Vitest/Prisma/Playwright run records. The checked run index pins validation commands to source 0ec971f5fe2ddfd7da16575aa959d844bc254811.
- **Human review:** justfepwx12 performed independent review and approval on PRs #60, #72–#82. Only GitHub review records count as peer approval; assistant inspection is not a substitute.
- **Limit:** The source does not retain exact per-turn model IDs or full prompt/provider metadata. This record therefore does not claim that a named smaller model produced the historical code, nor that every selected paraphrase was sent to one fixed model.

## Selected prompt history

These eight items are paraphrases of actual user requests/instructions visible in the task history and are paired with repository records. They summarize intent; none is quoted as an exact prompt.

| # | Date / source | Selected prompt (paraphrase) | Assistant contribution | Human check / outcome |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-07; L4-01 Issue #59 / PR #60 | Inspect the Lab 4 handout and released Lab 1–3 project, then draft a contract and dependency-ordered peer-review workflow before implementation. | Organized FR/BR/AC, API/UI/test contracts and explicit design decisions for review. | justfepwx12 requested contract changes, then approved PR #60; final decision record is linked in reviewer.md. |
| 2 | 2026-10-09; Issue #62 / PR #73 | Start the next assigned issue from current staging, use red-test-first commits, preserve prior data and prepare the change for peer review. | Helped implement migration/seed work and report test-first evidence. | Reviewer verified real PostgreSQL migration evidence and approved PR #73; merge 1d9876b. |
| 3 | 2026-10-16; Issue #67 / PR #78 | Prepare role dashboards and navigation under the approved contract; address review findings before requesting another review. | Contributed UI changes and follow-up fixes, with tests and scope notes. | Reviewer approved PR #78; merge 6dcdad0. |
| 4 | 2026-10-18; Issue #68 / PR #79 | Read all change requests and fix the transaction, regression-coverage, seed-order and evidence issues before re-review. | Supported code/test fixes and validation evidence updates. | Seven review findings were resolved; seeded browser and isolated PostgreSQL reruns were retained; PR #79 was approved and merged at 5743a90. |
| 5 | 2026-10-24–29; Issue #69 / PR #80 | Recheck the complete review history, correct cross-platform evidence hashing and provenance, and separate retained runs from fresh approval reruns. | Helped reconcile source SHAs, test-ID attribution, line-ending normalization and the evidence record. | Reviewer approved PR #80 at e90daa6 and merged it at 9f91471; provenance distinctions are preserved in reviewer.md. |
| 6 | 2026-10-29; Issue #70 / PR #81 | Correct validation provenance and unverifiable board claims, keeping close-out documentation limited to verified facts. | Separated approval-verified reruns from retained E2E/Prisma records and linked the merge evidence. | After two change-request rounds, justfepwx12 approved PR #81; merge c11b848. |
| 7 | 2026-10-30; PR #82 | Promote only the reviewed staging tree and keep final-main validation explicitly pending until after merge. | Prepared the release record with exact source and validation provenance. | justfepwx12 approved the exact staging head and merged PR #82 to main at 0ec971f5. |
| 8 | 2026-10-31; Issue #71 / Phase 4 | Repair the review ledger, record reciprocal partner reviews, correct approved-contract metadata, and draft the report from verified final-main evidence. | This phase: current-state ledger, selected prompt record, Test/AC execution status and a nine-part report-content draft. | Review/merge and PDF QA for Issue #71 remain pending; no completion is claimed. |

## My Reflection — evidence-grounded draft

The review history shows why I needed to keep the engineering contract, code changes and release evidence separate. Review requests exposed real gaps in authorization, transaction boundaries, E2E coverage and evidence provenance; recording each fix beside its test and merge SHA made the result easier to verify. The final-main run also showed that a single green total is not enough: the initial parallel server run failed once with a Supertest transport error, so I retained that failure and used repeated serial full-suite runs for the release gate. I should keep the same discipline in the report by distinguishing fresh runs from retained screenshots and by leaving the final release record open until peer review and PDF QA are complete.

This reflection is drafted only from decisions and events documented in the user's requests, repository and GitHub review history. The author should confirm that the first-person wording matches their own experience before submission.

## Sources

- Instructor handout: Lab/Lab4/Lab 4.pdf; Lab 4 report requirement and nine-part rubric are described in output/lab-04-report/EXECUTION_PLAN.md.
- Approved contract and review history: docs/lab-04/specification.md, docs/lab-04/api-spec.md, docs/lab-04/reviewer.md, and PR #60.
- Complete in-scope PR interaction index: output/lab-04-report/review-interactions.csv; paginated raw records: output/lab-04-report/reviews/{own,partner}/.
- Final-main run provenance: [source-pinned final-main run index](../../artifacts/lab-04/final-main/0ec971f5/run-index.json), with selected redacted logs and screenshot evidence linked from the same folder; source 0ec971f5fe2ddfd7da16575aa959d844bc254811.

No passwords, tokens, database URLs, private user data or real secrets are included. Partner repository material is cited only to document the user's reviews; its requirements, identities, artifacts and claims are not copied into this project's contract or report.
