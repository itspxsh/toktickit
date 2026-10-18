# L4-09 whole-product regression evidence

This evidence was refreshed after the L4-09 review follow-up at commit
[`ff08a01`](https://github.com/itspxsh/toktickit/commit/ff08a01) on branch
`feature/lab4-09-whole-product-regression`, based on `lab4-staging` at
`6dcdad0`. The PostgreSQL instance was temporary and isolated; the E2E database
was named `toktickit_l409_evidence_test`. No development database was reset or
used for the browser runs. E2E configuration now fails closed unless its explicit
PostgreSQL URL ends in `_test`, its auth origin matches the browser origin, and
local HTTP explicitly opts into insecure test cookies.

## Results

| Validation | Result |
| --- | --- |
| PostgreSQL migrations on fresh E2E DB | 4/4 applied |
| Serial PostgreSQL integration suites | 20/20 passed across 6 files |
| Server tests | 175/175 passed across 24 files |
| Client tests, including accessibility/visual checks | 133/133 passed across 30 files |
| Lab 3 authenticated E2E journeys | 9/9 passed (3 journeys × desktop/tablet/mobile) |
| Lab 2 authenticated regression journey | 3/3 passed (desktop/tablet/mobile) |
| Client production build | Passed |
| Server TypeScript build | Passed |
| Prisma schema validation | Passed (`server/node_modules/.bin/prisma validate --schema prisma/schema.prisma`) |
| `git diff --check` | Passed |

Playwright ran serially with one worker and zero retries. Viewports were
1440×900 desktop, 768×1024 tablet, and 320×800 mobile. The 51 retained PNGs
are loaded-state screenshots: 36 Lab 3 role journeys and 15 Lab 2 requester
regression screenshots, including the cross-requester not-found state at all
three project viewports. The three cross-requester images were checked at
1440×900, 768×1024, and 320×800 respectively. Fixture names and email addresses
use `.test`; no real credentials, tokens, database URLs, or personal data are
included.

The final server suite was run with local-listener permission and passed
175/175. One expected cleanup-failure regression writes a redacted `EPERM`
diagnostic to stderr while its assertion passes; it is not a skipped or flaky
test. No tests were skipped or retried in the successful recorded runs.

## Screenshot index

- `lab-02/create-ticket/`: create flow at all three viewports.
- `lab-02/my-tickets/`: populated requester ticket list at all three viewports.
- `lab-02/ticket-detail/`: requester detail and cross-requester not-found state
  at all three viewports.
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

Post-fix run at `ff08a01`: migrations 4/4 applied to the isolated test database;
PostgreSQL integration 20/20 across six files; server 175/175; client 133/133;
Lab 2 E2E 3/3; Lab 3 E2E 9/9; client and server builds, Prisma validation, and
`git diff --check` passed. The browser matrices used one worker, zero retries,
and dedicated loopback servers at client port 5175 and API port 3301. The
temporary PostgreSQL cluster used port 55433. These ports are not required
fixed ports; E2E origins must match the selected dedicated ports and must not
reuse a development server. Migration integration uses destructive fresh/upgrade
fixtures on the explicitly guarded `_test` database; afterward, the browser
database was rebuilt from the four repository migrations and reseeded.
