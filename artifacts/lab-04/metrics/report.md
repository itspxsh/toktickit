# L4-10 dashboard performance evidence

Product source commit: `88d1f0caab307e43b1dc238402f4b66f9f91aa23`
Database: isolated `toktickit_l410_final_integration_test` (_test; URL redacted).
Measurement: T-PERF-01, after five warm-up iterations and 20 measured runs per dashboard query.

| Metric | Measured | Contract limit | Result |
| --- | ---: | ---: | --- |
| Tickets | 5000 | 5,000 | pass |
| Actions | 10000 | 10,000 | pass |
| Requester dashboard data-query count | 8 | ≤ 8 | pass |
| Staff dashboard data-query count | 11 | ≤ 14 | pass |
| Requester dashboard p95 | 12.85 ms | ≤ 500 ms | pass |
| Staff dashboard p95 | 37.74 ms | ≤ 500 ms | pass |

The full PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` result is retained in `explain-plan.json`. The plan uses `ActionTaken_assigneeId_state_createdAt_id_idx` and `Ticket_pkey`; execution time was recorded by PostgreSQL in that plan. No database URL or credentials are included.
