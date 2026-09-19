# Lab 3 E2E evidence

These Playwright journeys are intentionally integration-only. They require a
running API, a migrated/seeded PostgreSQL database, and fake local credentials
provided through the environment. No password or session value belongs in this
directory, screenshots, or test output.

Required environment names:

- `E2E_REQUESTER_EMAIL`, `E2E_REQUESTER_PASSWORD`, `E2E_REQUESTER_NEW_PASSWORD`
- `E2E_STAFF_EMAIL`, `E2E_STAFF_PASSWORD`, `E2E_STAFF_NEW_PASSWORD`
- `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_ADMIN_NEW_PASSWORD`
- `E2E_CREATED_INITIAL_PASSWORD`
- `E2E_CREATED_RESET_PASSWORD`

`E2E_CREATED_RESET_PASSWORD` must be 12–128 characters because the Admin reset
dialog enforces the Lab 3 password policy. All values are fake, local fixture
inputs supplied through the environment; do not commit, print, or screenshot
them.

## Exact local evidence workflow

Use a test-scoped `DATABASE_URL_TEST` for migration evidence and a separately
configured local development `DATABASE_URL` for the live web-server run. Do
not paste either URL or any password into logs, screenshots, or source. The
release-gate run used a local HTTP transport with `SESSION_COOKIE_SECURE=false`
only for the test server; production/default configuration remains Secure. Set
`AUTH_ORIGIN` to the exact client origin served by Playwright (for this setup,
`export AUTH_ORIGIN=http://127.0.0.1:5173`) so CSRF origin checks and browser
credentials are reproducible.

```text
cd server
# Substitute a fresh guarded PostgreSQL URL whose database name ends in _test;
# do not echo it.
DATABASE_URL='<guarded-test-url-ending-in-test>' npx prisma migrate deploy
DATABASE_URL_TEST='<guarded-test-url-ending-in-test>' npm run db:test:reset
DATABASE_URL_TEST='<guarded-test-url-ending-in-test>' npm run test:integration -- tests/lab-03/migration.integration.test.ts

cd ../client
npm run test:e2e:lab3
```

For the separate local development API used by Playwright, apply
`npm run prisma:migrate` and `npm run prisma:seed` with its development
`DATABASE_URL`; never point that command at `DATABASE_URL_TEST`.

The migration command sequence above is the provenance for T-E2E-05; retain
the command output under `artifacts/lab-03/migration/` with the pinned commit
and database scope redacted. The E2E command runs the full desktop/tablet/mobile
matrix.

## Evidence status for this PR

The release-gate run is now live and reproducible on a guarded local
PostgreSQL instance. The migration deployment applied all three migrations;
the migration integration suite passed 5/5; and the seeded browser matrix
passed 3/3 journeys on each desktop, tablet, and mobile project (9/9 total).
The run used only fake environment-provided credentials and retained redacted
screenshots under `artifacts/lab-03/screenshots/` plus migration output under
`artifacts/lab-03/migration/`. The exact source commit is recorded in
`artifacts/lab-03/screenshots/README.md` and `docs/lab-03/reviewer.md` after
the evidence commit is created.

Run from `client/` after applying migrations and seeding the local development
database:

```text
npm run test:e2e:lab3
```

The suite runs desktop (1440px), tablet (768px), and mobile (320px) projects
with no retry or skip path. It writes screenshot provenance under
`artifacts/lab-03/screenshots/` and the HTML report under
`artifacts/lab-03/playwright-report/`.

Discovery output remains useful for contract coverage, but the retained green
run and its provenance are the release evidence for T-E2E-04 and T-E2E-05.
