# Lab 3 AI-Use and Provenance Record

This record separates course instructions from implementation decisions and
keeps the engineering process reproducible. It must be updated with factual
commit/command references only; it is not a substitute for peer approval.

## Sources consulted

* `Lab_3_sheet.pdf` (SE Lab 3, score 60), supplied by the course instructor.
* Lab 1 and Lab 2 handouts and the released Lab 2 contract/API/UI/test docs.
* The released TokTickIT tree at `main`/`lab3-staging` contract baseline `d4a034c` and the merged Lab 3 staging tip recorded in `reviewer.md`.
* Issue #35 and its peer-review workflow; reviewer `justfepwx12`.
* The partner review index in `Few/TokTikIT-CPE334-Software-Engineering/docs/lab-03/reviewer.md`, used only to cross-check reciprocal review scope.

## Decisions recorded for review

* Authentication uses an opaque server-side session cookie; no bearer token is
  placed in localStorage, screenshots, or API responses.
* One User has one role. Authorization is evaluated on the server for every
  protected operation; client role navigation is only a usability hint.
* Lab 2 requester ownership is mapped to User identities through a verified
  forward-only migration. Ticket numbers, sequences, attachments, and storage
  keys are preserved.
* Public Comments and Internal Notes are append-only plain text with
  server-derived author/time; a Requester never receives Internal Notes.
* A Requester’s “problem appears resolved” indication is informational and is
  not an Actions Taken event or a formal status transition.
* Initial-password values are environment/test-fixture inputs, hashed before
  persistence, and never committed or returned.

## Scope guard

No AI-generated proposal may introduce email delivery, password-reset email,
MFA, SSO, self-registration, multiple roles, Actions Taken, SLA/escalation,
notifications, dashboards/KPIs, deletion, bulk tools, or Lab 4 behaviour.
Implementation agents must read the four Lab 3 contract documents before
editing product code and must follow the TDD/Test-DD order.

## Work log

| Date | Agent/task | Inputs | Output/commit | Human verification |
| --- | --- | --- | --- | --- |
| 2026-09-15 | L3-01 contract preparation | Lab 3 handout, Lab 2 baseline, Issue #35 | Test-DD and contract docs (local) | Peer review pending |
| 2026-09-18 | L3-09 review resolution | PR #53 review findings | `1c2226b` and merged PR #53 | `justfepwx12` approved; live evidence remains a release-gate prerequisite |
| 2026-09-19 | L3-10 release-readiness evidence | Issues #44/#45, Lab 3 contract, merged staging history, guarded local PostgreSQL | `8376f65` live migration/E2E evidence and `efac45d` provenance pin; migration 5/5, server Lab 3 40/40, Lab 2 37/37, client 56/56, Playwright 9/9, 42 redacted screenshots | Evidence is reproducible locally; final-main validation remains pending until PR #54 is approved and merged |
| 2026-09-20 | L3-10 review remediation | Reviewer follow-up on `T-AUTHZ-05`, notice reset, `AUTH_ORIGIN`, and release-gate provenance | `1c45150` and `5782c0c`; the three required follow-ups were verified and PR #54 was approved | Peer review confirmed the release gate before promotion |
| 2026-09-21 | L3-11 reliability follow-up | Post-release E2E timing and notice assertions | `bef4dba`, `5ca2289`, and `1e639c8`; red tests, implementation, and 42 refreshed redacted PNGs | `justfepwx12` approved PR #56; no product-scope expansion |
| 2026-09-22 | Final-main validation and close-out | `main` after PR #54/#56; migration output, test counts, screenshots, and repository hygiene | `a2e9149` merged PR #57; final-main migration 3/3, integration 5/5, Lab 3 40/40, Lab 2 37/37, client 58/58, Playwright 9/9, builds and diff-check passed | Release gate passed; this report is generated from the released tree |

## Selected prompts and reflections

The following prompts are a factual, condensed record of the agent requests
used for this lab. They are paraphrased to describe engineering intent rather
than claim hidden tool output.

| # | Prompt intent | Agent output | Human/reviewer check |
| --- | --- | --- | --- |
| 1 | Read the Lab 3 handout and design the contract before implementation. | Produced the 11-section specification and explicit exclusions. | Peer approved PR #36 after traceability fixes. |
| 2 | Implement L3-02 with migration preservation, deterministic seed and guarded test DB using TDD. | Added schema/migration/seed and red/green integration tests. | Reviewer verified Lab 2 rows and seed idempotence in PR #46. |
| 3 | Implement authentication with server-side sessions, CSRF, first-login password change and safe failures. | Added auth routes, session rotation, password hashing and tests. | Reviewer requested and verified cookie, timing and CSRF fixes in PR #47. |
| 4 | Enforce server authorization and preserve Lab 2 requester ownership. | Added middleware and negative authorization/regression tests. | Reviewer verified gates, safe 404s and CSRF in PR #48. |
| 5 | Implement staff queue/detail and admin user management without trusting client identity. | Added queue, workflow, comments/notes and user-management flows. | Reviewer requested race/safeguard/test fixes and approved PRs #49–#51. |
| 6 | Build role-aware shell and accessibility/responsive UI. | Added role guards, forbidden state, requester resolution action and responsive tests. | Reviewer verified T-UI-06, role guards and client suite in PR #52. |
| 7 | Produce reproducible E2E evidence with exact selectors and viewport provenance. | Added three journeys, discovery checks, screenshots and migration provenance. | Reviewer rejected skeleton-only evidence until live artifacts existed; PR #53 then passed. |
| 8 | Close release-gate gaps, retain redacted evidence and validate from final `main`. | Added guarded migration output, 42 PNGs, final counts and reliability follow-up. | Reviewer verified PRs #54/#56 and merge chain through `a2e9149`. |

Reflection: The most important control was contract-first work. Agent output
was treated as a draft until red tests, server-side negative tests, peer review,
and pinned evidence agreed. The E2E review showed why a green discovery list
is not live evidence: screenshots captured before data loaded were replaced
only after a real run and provenance check. Peer review also caught security
issues that were easy to miss from the UI alone, including timing leakage,
CSRF scope, ownership predicates, and Admin safety rules. I kept the final
report honest by separating retained evidence from claims that require a live
service and by excluding all credentials and Lab 4 behaviour.
