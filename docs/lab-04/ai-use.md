# TokTickIT Lab 4 AI-Use and Provenance Record

This record distinguishes instructor requirements from proposed engineering decisions. It is updated with factual sources, outputs, commits and human review; it is not evidence of peer approval or of tests that have not run.

## Sources consulted for L4-01

- Instructor handout: `Lab/Lab4/Lab 4.pdf`, checked as an 11-page Lab 4 document.
- Released product baseline: repository `main`, commit `da689edc95c7e19a209dc20ec964c04b14590d78` at contract preparation.
- Existing Lab 1–3 implementation and contracts, especially the Lab 3 specification, API/UI/test contracts, reviewer record and AI-use record.
- Existing Lab 3 engineering-contract Issue #35, used only as a structural example for a new contract Issue.
- User-provided Luna Master Prompt, which sets repository boundaries, review sequence, issue scope, evidence integrity, and the requirement to stop at a peer-review-ready L4-01 PR.

## AI-assisted work and human decisions

OpenAI Codex assisted with translating the handout and released repository into proposed Lab 4 requirements, design alternatives, acceptance criteria, API/UI outlines and a planned test matrix. The user authorized the L4-01 contract workflow and set `justfepwx12` as reviewer. Proposed design choices are explicitly identified in `specification.md`; they are not represented as text mandated by the instructor.

The proposals include Actions Taken, a server-enforced Ticket resolution gate, role-specific dashboards, migration/concurrency safeguards, and evidence requirements. Their detailed field limits, state behavior, formulas and persistence design remain subject to L4-01 peer review. No product behavior has been implemented in this contract task, and no Lab 4 test or migration result is claimed here.

## Work log

| Date | Activity | Inputs | Output | Human / peer verification |
| --- | --- | --- | --- | --- |
| 2026-10-07 | L4-01 contract preparation | Lab 4 handout, released main, Lab 1–3 contracts, user-provided workflow prompt | Proposed six-document contract set; [public L4-01 Issue #59](https://github.com/itspxsh/toktickit/issues/59) | Peer review pending; no approval or merge yet |

## Prompt intent and reflection

| Prompt intent | AI contribution | Verification status |
| --- | --- | --- |
| Inspect Lab 4 and the released Lab 1–3 project; plan a peer-reviewed, contract-first Lab 4 sequence | Drafted requirements, proposed design choices, traceability and test planning for L4-01 | Must be checked by `justfepwx12`; no implementation Issues may be created before approval and merge |

Reflection: the main risk at this stage is treating choices that the handout leaves open as instructor requirements. The contract marks those choices as proposals and makes them explicit review questions. Future implementation agents must follow the approved contract, report any ambiguity before coding, and never turn planned test IDs or expected counts into claimed execution evidence.

## Scope and privacy

No credentials, session tokens, database URLs, private user data or unredacted secrets belong in this record. Do not copy partner identities, screenshots, repository facts or claims into this project. Keep `Lab`, `jarb` and `Few` outside the Lab 4 implementation worktree and write scope.
