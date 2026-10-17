# L4-09 whole-product regression evidence

This evidence was generated from the complete L4-09 source tree at commit
[`2217d6e`](https://github.com/itspxsh/toktickit/commit/2217d6e) on branch
`feature/lab4-09-whole-product-regression`, based on `lab4-staging` at
`6dcdad0`. The PostgreSQL instance was temporary and isolated; the E2E database
was named `toktickit_lab4_e2e_test`. No development database was reset or used
for the browser runs. E2E configuration now fails closed unless its explicit
PostgreSQL URL ends in `_test`, its auth origin matches the browser origin, and
local HTTP explicitly opts into insecure test cookies.

## Results

| Validation | Result |
| --- | --- |
| PostgreSQL migrations on fresh E2E DB | 4/4 applied |
| Serial PostgreSQL integration suites | 20/20 passed across 6 files |
| Server tests | 173/173 passed across 24 files |
| Client tests, including accessibility/visual checks | 128/128 passed across 29 files |
| Lab 3 authenticated E2E journeys | 9/9 passed (3 journeys × desktop/tablet/mobile) |
| Lab 2 authenticated regression journey | 3/3 passed (desktop/tablet/mobile) |
| Client production build | Passed |
| Server TypeScript build | Passed |
| Prisma schema validation | Passed (`server/node_modules/.bin/prisma validate --schema prisma/schema.prisma`) |
| `git diff --check` | Passed |

Playwright ran serially with one worker and zero retries. Viewports were
1440×900 desktop, 768×1024 tablet, and 320×800 mobile. The 48 retained PNGs
are loaded-state screenshots: 36 Lab 3 role journeys and 12 Lab 2 requester
regression screenshots. Fixture names and email addresses use `.test`; no
real credentials, tokens, database URLs, or personal data are included.

The server unit suite initially could not bind Supertest's local listener in
the restricted sandbox (`EPERM`); the same unmodified suite was rerun with
local-listener permission and passed 173/173. This was an environment
restriction, not a test skip. There are no skipped, retried, or flaky tests in
the successful recorded runs.

## Screenshot index

- `lab-02/create-ticket/`: create flow at all three viewports.
- `lab-02/my-tickets/`: populated requester ticket list at all three viewports.
- `lab-02/ticket-detail/`: requester detail at all three viewports.
- `lab-02/responsive/`: completed requester flow at all three viewports.
- `screenshots/authentication/`: requester, Staff, and Admin authentication states.
- `screenshots/staff-queue/`: populated Staff queue at all three viewports.
- `screenshots/staff-ticket-detail/`: detail and completed workflow at all viewports.
- `screenshots/user-management/`: initial and created/edited Admin views.

The evidence intentionally retains only successful PNGs and this manifest;
Playwright reports, traces, videos, and temporary logs are not committed.

## Reproduction commands

Run from the corresponding directory. `TEST_DATABASE_URL` below means a local,
temporary PostgreSQL URL for a database ending in `_test`; it is a placeholder,
not a credential-bearing value to copy literally. Fake initial and changed
passwords are injected through local environment variables and are omitted
here.

```text
cd server
DATABASE_URL_TEST=<TEST_DATABASE_URL> LAB3_TEST_INITIAL_PASSWORD=<local-fake> npm run test:integration
DATABASE_URL=<TEST_DATABASE_URL> npx prisma migrate deploy
DATABASE_URL=<TEST_DATABASE_URL> LAB3_TEST_INITIAL_PASSWORD=<local-fake> npm run prisma:seed
npm test
npm run build
./node_modules/.bin/prisma validate --schema prisma/schema.prisma

cd ../client
npm test
npm run build
E2E_DATABASE_URL=<TEST_DATABASE_URL> E2E_BASE_URL=<client-origin> E2E_API_URL=<dedicated-api-origin> E2E_AUTH_ORIGIN=<same-client-origin> E2E_SESSION_COOKIE_SECURE=false E2E_ARTIFACT_ROOT=artifacts/lab-04/regression <fake-role-credentials-in-environment> npm run test:e2e:lab3
E2E_DATABASE_URL=<TEST_DATABASE_URL> E2E_BASE_URL=<client-origin> E2E_API_URL=<dedicated-api-origin> E2E_AUTH_ORIGIN=<same-client-origin> E2E_SESSION_COOKIE_SECURE=false E2E_ARTIFACT_ROOT=artifacts/lab-04/regression <fake-role-credentials-in-environment> npm run test:e2e
```

The recorded local ports were 5176 for the client, 3302 for the API, and 55433
for the temporary PostgreSQL cluster. These are not required fixed ports; the
E2E origins must match the selected dedicated ports and must not reuse a dev
server.
