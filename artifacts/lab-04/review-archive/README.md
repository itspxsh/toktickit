# Lab 4 peer-review archive

This committed archive makes the normalized Lab 4 review record inspectable from the repository. It covers **20 PRs** across `itspxsh/toktickit` and `justfepwx12/TokTikIT-CPE334-Software-Engineering`. Original public GitHub IDs and URLs are retained for every interaction. The normalized ledger preserves 742 baseline records and adds four live PR #152 records, two PR #83 reviews, three owner responses, and six PR #83 timeline events; Markdown hard breaks in comment bodies are represented as `<br>` so the public CSV passes repository whitespace checks. Exact paginated response snapshots remain local-only.

- Interaction rows: **757** (742 baseline + four live PR #152 records + two PR #83 reviews + three owner responses + six PR #83 timeline events).
- PR #152: two `CHANGES_REQUESTED` reviews and three response/follow-up comments; open and unapproved at capture time.
- PR #83: two `CHANGES_REQUESTED` reviews ([#5722784089](https://github.com/itspxsh/toktickit/pull/83#pullrequestreview-5722784089), [#5725659299](https://github.com/itspxsh/toktickit/pull/83#pullrequestreview-5725659299)), three owner responses ([#6544118839](https://github.com/itspxsh/toktickit/pull/83#issuecomment-6544118839), [#6557158132](https://github.com/itspxsh/toktickit/pull/83#issuecomment-6557158132), [#6557443422](https://github.com/itspxsh/toktickit/pull/83#issuecomment-6557443422)), and six timeline events (initial review request, assignment, label, rename, renewed review requests [#34773907930](https://github.com/itspxsh/toktickit/pull/83#event-34773907930) and [#34828868245](https://github.com/itspxsh/toktickit/pull/83#event-34828868245)); review #5725659299 is addressed in commit `fdac0b892f0ae5866530c20a121c166b63b1e9f2`; the latest owner reply and re-review request are verified on the current PR head.
- Raw paginated API JSON and visual thread captures remain local-only working archives and are not claimed as committed. Public normalized ledger/index link directly to GitHub records.
- `review-index.csv` explicitly labels local-only snapshots and visual archives.

| File | Rows | SHA-256 |
| --- | ---: | --- |
| `review-interactions.csv` | 757 | `73ffebe524188862c8fc3b37dba419d6c3b242b5abc808b5a8b6f5fffe66a1eb` |
| `review-index.csv` | 20 | `4a22b2ee23482b4abecfee63627d35688926406ba18f086a31296d097228e5b1` |
