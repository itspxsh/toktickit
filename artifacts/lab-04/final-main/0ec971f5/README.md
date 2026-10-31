# Final-main validation evidence (selected)

**Pinned product/source SHA:** `0ec971f5fe2ddfd7da16575aa959d844bc254811`

**Run window:** 2026-10-30 17:18–20:14 UTC.

**Isolation:** separate disposable PostgreSQL databases ending `_test`; the exact database names and redacted setup are recorded in the source-pinned run index. No credential values are stored here.

**Run index:** [`run-index.json`](./run-index.json)

**Validation result:** migration deploy 4/4; PostgreSQL integration 20/20; final serial server 175/175 (0 failed/skipped/retries); client 134/134; contract/evidence 24/24; Lab 2/3/4 live browser matrix 3/9/9 (one worker, zero retries); server/client builds, Prisma CLI 5.22.0 validation and `git diff --check` passed.

The retained initial parallel server attempt had one Supertest HTTP parser/transport failure (174 passed, 1 failed); another default-parallel rerun later recorded a transport-only failure. These attempts remain preserved in the run index. The final gate used the full unfiltered server suite serialized and passed repeatedly; the final run below was 175/175 with zero failures, skips or retries. This documents the actual history rather than replacing failed attempts.

## Selected logs

| Run | Command | Result | Retained log | SHA-256 |
| --- | --- | --- | --- | --- |
| `migration-deploy` | `cd server && DATABASE_URL=<redacted fresh _test database> ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma` | exit 0 | [`runs/migration-deploy.log`](./runs/migration-deploy.log) | `300c2022ddece9b94dbb5065f82c35f7eaf6a5cce30590f6dbc2671b528de63c` |
| `postgres-integration` | `cd server && npm run test:integration -- --reporter=verbose` | exit 0; 20 passed; 0 failed | [`runs/postgres-integration.log`](./runs/postgres-integration.log) | `37315fed80ce0d129a237037d1808a6f7ee49cd32d1cec0c281aea5e7bf95b61` |
| `server-tests` | `cd server && npm test -- --reporter=verbose` | exit 1; 174 passed; 1 failed | [`runs/server-tests-initial.log`](./runs/server-tests-initial.log) | `18150a6167eadaf56c2942e3499774b4e904eb8bfdcee2a6163cab99f7649f34` |
| `server-tests-rerun` | `cd server && npm test -- --reporter=verbose (same full-suite command; rerun after isolated failure)` | exit 0; 175 passed; 0 failed; 0 retries/flaky | [`runs/server-tests-rerun.log`](./runs/server-tests-rerun.log) | `5a40debf9f2a62e5907531881ccbf19fe9b6f9e49166fcf1e644cd4f6c77801e` |
| `server-tests-final-serial` | `cd server && npm test -- --reporter=dot --minWorkers=1 --maxWorkers=1 --no-file-parallelism` | exit 0; 175 passed; 0 failed; 0 skipped; 0 retries/flaky | [`runs/server-tests-final-serial.log`](./runs/server-tests-final-serial.log) | `a0a64ef95df2d7960ddddd1f6242504aaa4a84c72ac6e02d177127504bee090b` |
| `client-tests` | `cd client && npm test -- --reporter=verbose` | exit 0; 134 passed; 0 failed | [`runs/client-tests.log`](./runs/client-tests.log) | `0a1514f28598fcbd46c845250453be4b83ce8822fc1066088667994261dc787a` |
| `contract-tests` | `node --test scripts/lab-04/verify-contract.test.mjs` | exit 0; 24 passed; 0 failed; 0 skipped; 0 retries/flaky | [`runs/contract-tests.log`](./runs/contract-tests.log) | `9611746b071ccd1cbb1da6d88c8db311d8977dfa3bc7c63c1a1998f1d8be09b4` |
| `historical-evidence-verifier` | `node scripts/lab-04/verify-contract.mjs (historical canonical manifest; not fresh final-main evidence)` | exit 0 | [`runs/historical-evidence-verifier.log`](./runs/historical-evidence-verifier.log) | `e386a70de8cf10b6367256f37cadd57a66981a5acd8490fc9c317103887f2323` |
| `server-build` | `cd server && npm run build` | exit 0 | [`runs/server-build.log`](./runs/server-build.log) | `f6899a65aa9dc478cd42c10b5cf3e84c184563a549fef717796bc43dd0905ad0` |
| `client-build` | `cd client && npm run build` | exit 0 | [`runs/client-build.log`](./runs/client-build.log) | `952c0612a41152a69eac894fde424d3fccbd98c9fb6448abc3e54bcd1b77e238` |
| `prisma-version` | `cd server && ./node_modules/.bin/prisma --version` | exit 0 | [`runs/prisma-version.log`](./runs/prisma-version.log) | `2bed5d3feecb1e70fffbb1dcb27e9f65afe1a3700e525f7d84f61ae2008c1e39` |
| `prisma-validate` | `cd server && DATABASE_URL=<redacted _test database> ./node_modules/.bin/prisma validate --schema prisma/schema.prisma` | exit 0 | [`runs/prisma-validate.log`](./runs/prisma-validate.log) | `919c26cbd154c540c8a110d57d3f91dc02c8c73f4e8edb56cddc7bb0b4beea22` |
| `lab2-e2e` | `cd client && E2E_SUITE=lab2 npm run test:e2e -- --workers=1 --retries=0 --trace off` | exit 0; 3 passed; 0 failed | [`runs/lab2-e2e.log`](./runs/lab2-e2e.log) | `1625d65f9b252981992aa798dd313da9fe49aefd511fa7c9749203c36595e874` |
| `lab3-e2e` | `cd client && E2E_SUITE=lab3 npm run test:e2e:lab3 -- --workers=1 --retries=0 --trace off` | exit 0; 9 passed; 0 failed | [`runs/lab3-e2e.log`](./runs/lab3-e2e.log) | `86082ac669aab6423295c3564de5bc56868068144887f01718b5121b6563c786` |
| `lab4-e2e` | `cd client && E2E_SUITE=lab4 npm run test:e2e:lab4 -- --workers=1 --retries=0 --trace off` | exit 0; 9 passed; 0 failed | [`runs/lab4-e2e.log`](./runs/lab4-e2e.log) | `efdc39c7720e2f6574f377edd1640d3d4a6b958ecc25727b16378fdc6873022a` |
| `git-diff-check` | `git diff --check` | exit 0 | [`runs/git-diff-check.log`](./runs/git-diff-check.log) | `101a38ff3f2b1581da4dc615304b800724a422294783ade63ddd912e40b93904` |

## Selected live Lab 4 screenshots

These nine are a representative subset of the genuine loaded-state E2E captures, pinned to the same source SHA. The run index records capture time, viewport, AC/Test IDs, and redaction notes; each screenshot sidecar records its AC/Test mapping, load assertions, and redaction note. Image SHA-256 values and sidecar presence were checked before selection. The other captured images remain in the local Phase 2 evidence archive and are not claimed as committed here.

| Journey/state | Viewport | Image | SHA-256 |
| --- | --- | --- | --- |
| `requester-dashboard/loaded-desktop.png` | 1440×900 | [`loaded-desktop.png`](lab4/screenshots/requester-dashboard/loaded-desktop.png) | `d927237bd43dc8d894ce73a4592c6db008ddc60db1babda6e91845e3c15feddc` |
| `requester-dashboard/loaded-tablet.png` | 768×1024 | [`loaded-tablet.png`](lab4/screenshots/requester-dashboard/loaded-tablet.png) | `d66b99b285e8e79b98ef8f86e12b208339be2d60bd00a0788c8553b1b2ef16b4` |
| `requester-dashboard/loaded-mobile.png` | 320×800 | [`loaded-mobile.png`](lab4/screenshots/requester-dashboard/loaded-mobile.png) | `7ed7c01e4a225a00b32990d6b8a55cea7681907b4fc83e2c94a3bfbe664054ba` |
| `staff-dashboard/loaded-desktop.png` | 1440×900 | [`loaded-desktop.png`](lab4/screenshots/staff-dashboard/loaded-desktop.png) | `0c05a7a94493e7e5f199f609f70b1da95492b701eb7a6373e616b51ba89862d8` |
| `staff-dashboard/loaded-tablet.png` | 768×1024 | [`loaded-tablet.png`](lab4/screenshots/staff-dashboard/loaded-tablet.png) | `7c6e9e7064a30b5ed37ef1bc5feec50a45ba948a38d846156d4fe3cce2a3845e` |
| `staff-dashboard/loaded-mobile.png` | 320×800 | [`loaded-mobile.png`](lab4/screenshots/staff-dashboard/loaded-mobile.png) | `e81d2f1ee1ff04cd4762290417118aa131910d513af411929978870bd514fe2b` |
| `actions-taken/completed-desktop.png` | 1440×900 | [`completed-desktop.png`](lab4/screenshots/actions-taken/completed-desktop.png) | `c5bc527ce58bad1e07f7c8c355a1a09dcb443c05cf07c8deaf8c1578f77ba298` |
| `actions-taken/completed-tablet.png` | 768×1024 | [`completed-tablet.png`](lab4/screenshots/actions-taken/completed-tablet.png) | `4e0a7943ef33fb2709a89d3ddab8f61a84ec1798c7e442e358c69d9f89ff436b` |
| `actions-taken/completed-mobile.png` | 320×800 | [`completed-mobile.png`](lab4/screenshots/actions-taken/completed-mobile.png) | `ffc9b7ceec73345dae96db377a1191a72ffaae279584d4d5882a602815dc44f0` |

All selected captures show synthetic `example.test` fixtures only; they contain no credentials or real user information. The screenshot suite was captured by live Playwright at the pinned SHA, not reconstructed or edited.
