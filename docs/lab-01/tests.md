# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | GET /api/health returns 200, status=ok | Passed |
| 2 | Supertest | GET /api/categories returns 4 seeded categories in id order | Passed |
| 3 | Vitest | Heading renders | Passed |
| 4 | Vitest | Success state shows Online + category list | Passed |
| 5 | Vitest | Error state shows Offline + message | Passed |

Paste your passing terminal output / screenshot below.

### Backend Tests (Supertest)
```text
> toktickit-server@1.0.0 test
> vitest run


 RUN  v2.1.9 /Users/posh/Study/CPE334/toktickit/server

 ✓ tests/lab-01/health.test.ts (1 test) 9ms
 ✓ tests/lab-01/categories.test.ts (1 test) 87ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  21:44:07
   Duration  495ms (transform 32ms, setup 0ms, collect 254ms, tests 96ms, environment 0ms, prepare 80ms)
```

### Frontend Tests (Vitest)
```text
> toktickit-client@1.0.0 test
> vitest run


 RUN  v2.1.9 /Users/posh/Study/CPE334/toktickit/client

 ✓ tests/lab-01/App.test.tsx (3 tests) 45ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  21:44:20
   Duration  742ms (transform 32ms, setup 51ms, collect 70ms, tests 45ms, environment 268ms, prepare 39ms)
```
