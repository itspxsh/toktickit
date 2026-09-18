# Lab 3 AI-Use and Provenance Record

This record separates course instructions from implementation decisions and
keeps the engineering process reproducible. It must be updated with factual
commit/command references only; it is not a substitute for peer approval.

## Sources consulted

* `Lab_3_sheet.pdf` (SE Lab 3, score 60), supplied by the course instructor.
* Lab 1 and Lab 2 handouts and the released Lab 2 contract/API/UI/test docs.
* The released TokTickIT tree at `main`/`lab3-staging` contract baseline `d4a034c` and the merged Lab 3 staging tip recorded in `reviewer.md`.
* Issue #35 and its peer-review workflow; reviewer `justfepwx12`.

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
| 2026-09-19 | L3-10 release-readiness preparation | Issues #44/#45, Lab 3 contract, merged staging history | Traceability, reviewer record, and guarded evidence checklist | Live PostgreSQL/API run and screenshots still require the configured course environment |
