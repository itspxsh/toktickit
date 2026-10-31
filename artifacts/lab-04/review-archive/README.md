# Lab 4 peer-review archive

This committed archive makes the normalized Lab 4 review record inspectable from the repository. It covers **20 PRs** across `itspxsh/toktickit` and `justfepwx12/TokTikIT-CPE334-Software-Engineering`. Original public GitHub IDs and URLs are retained for every interaction. The normalized ledger preserves 742 baseline records and adds four live PR #152 records, the PR #83 review, its owner response, and five PR #83 timeline events; Markdown hard breaks in comment bodies are represented as `<br>` so the public CSV passes repository whitespace checks. Exact paginated response snapshots remain local-only.

- Interaction rows: **753** (742 baseline + four live PR #152 records + PR #83 review + one owner response + five PR #83 timeline events).
- PR #152: two `CHANGES_REQUESTED` reviews and three response/follow-up comments; open and unapproved at capture time.
- PR #83: one `CHANGES_REQUESTED` review, one owner response ([#6544118839](https://github.com/itspxsh/toktickit/pull/83#issuecomment-6544118839)), and five timeline events (initial review request, assignment, label, rename, renewed review request [#34773907930](https://github.com/itspxsh/toktickit/pull/83#event-34773907930)); the reviewer request is currently pending.
- Raw paginated API JSON and visual thread captures remain local-only working archives and are not claimed as committed. Public normalized ledger/index link directly to GitHub records.
- `review-index.csv` explicitly labels local-only snapshots and visual archives.

| File | Rows | SHA-256 |
| --- | ---: | --- |
| `review-interactions.csv` | 753 | `752f240b123c06eb3a57da51d1c1e82060f4202199a854691d83869edf08566f` |
| `review-index.csv` | 20 | `26f0666b979bd297d6b6b1464dfc76e794cd3b89e52ba8b045744fed925bd279` |
