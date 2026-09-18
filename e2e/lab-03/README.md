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

## Exact local evidence workflow

Use a test-scoped `DATABASE_URL_TEST` for migration evidence and a separately
configured local development `DATABASE_URL` for the live web-server run. Do
not paste either URL or any password into logs, screenshots, or source.

```text
cd server
# Substitute the same guarded PostgreSQL URL in both assignments; do not echo it.
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

This PR contains the reviewable, fail-closed evidence skeleton and discovery
checks. It is explicitly **skeleton-only** until a live PostgreSQL/API run is
available: the author environment has no `E2E_*` fixture credentials and the
sandbox cannot bind the web-server ports. No screenshot or migration output is
fabricated. The green live run, pinned commit, viewport matrix, screenshots,
and migration output remain a release-gate follow-up before L3-10 can close the
Lab 3 release.

Run from `client/` after applying migrations and seeding the local development
database:

```text
npm run test:e2e:lab3
```

The suite runs desktop (1440px), tablet (768px), and mobile (320px) projects
with no retry or skip path. It writes screenshot provenance under
`artifacts/lab-03/screenshots/` and the HTML report under
`artifacts/lab-03/playwright-report/`.
