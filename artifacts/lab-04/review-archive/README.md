# Lab 4 peer-review archive

This committed archive makes the normalized Lab 4 review record inspectable from the repository. It covers **20 PRs** across `itspxsh/toktickit` and `justfepwx12/TokTikIT-CPE334-Software-Engineering`. Original public GitHub IDs and URLs are retained for every interaction. The normalized ledger preserves 742 baseline records and adds four live PR #152 records, two PR #83 reviews, two owner responses, and five PR #83 timeline events; Markdown hard breaks in comment bodies are represented as `<br>` so the public CSV passes repository whitespace checks. Exact paginated response snapshots remain local-only.

- Interaction rows: **755** (742 baseline + four live PR #152 records + two PR #83 reviews + two owner responses + five PR #83 timeline events).
- PR #152: two `CHANGES_REQUESTED` reviews and three response/follow-up comments; open and unapproved at capture time.
- PR #83: two `CHANGES_REQUESTED` reviews ([#5722784089](https://github.com/itspxsh/toktickit/pull/83#pullrequestreview-5722784089), [#5725659299](https://github.com/itspxsh/toktickit/pull/83#pullrequestreview-5725659299)), two owner responses ([#6544118839](https://github.com/itspxsh/toktickit/pull/83#issuecomment-6544118839), [#6557158132](https://github.com/itspxsh/toktickit/pull/83#issuecomment-6557158132)), and five timeline events (initial review request, assignment, label, rename, renewed review request [#34773907930](https://github.com/itspxsh/toktickit/pull/83#event-34773907930)); review #5725659299 is addressed in commit `fdac0b892f0ae5866530c20a121c166b63b1e9f2`; the documentation/report refresh is being completed before a new review request.
- Raw paginated API JSON and visual thread captures remain local-only working archives and are not claimed as committed. Public normalized ledger/index link directly to GitHub records.
- `review-index.csv` explicitly labels local-only snapshots and visual archives.

| File | Rows | SHA-256 |
| --- | ---: | --- |
| `review-interactions.csv` | 755 | `0b655bfcadfe0b9e979b59af21053e2701ba6500a39654b9cd347ccbe4f8d9f2` |
| `review-index.csv` | 20 | `a7f2ea9cacc8b9ec385989877534ee52646844debbc3ad38059a21b4e2a1dbcc` |
