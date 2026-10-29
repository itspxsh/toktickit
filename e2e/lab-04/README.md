# Lab 4 live E2E

This suite validates the Actions Taken workflow, Ticket resolution rules, and
role dashboards against a real local API backed by PostgreSQL. It is not a
discovery-only suite and must not be pointed at development, staging, or
production data.

## Guarded setup

Use a disposable PostgreSQL database whose database name ends in `_test`.
`DATABASE_URL_TEST` is required by `scripts/lab-04/prepare-test-database.mjs`;
the helper rejects non-PostgreSQL URLs and names outside that scope before
running Prisma. `--reset` additionally requires `LAB3_INITIAL_PASSWORD` and
resets/reseeds only that guarded database.

The Playwright preflight requires:

- `E2E_DATABASE_URL`: the same isolated PostgreSQL `_test` database.
- `E2E_BASE_URL` and `E2E_AUTH_ORIGIN`: the same origin; local default is
  `http://127.0.0.1:5175`.
- `E2E_API_URL`: the dedicated local API origin; local default is
  `http://127.0.0.1:3301`.
- `E2E_SESSION_COOKIE_SECURE=false` only for loopback HTTP. Do not disable the
  Secure cookie default for HTTPS or non-loopback hosts.
- Fake, local-only `E2E_REQUESTER_*`, `E2E_STAFF_*`, and `E2E_ADMIN_*`
  credentials for seeded users. Keep the values in the shell environment;
  never commit or print them.

The Playwright config starts dedicated API and client servers, refuses to
reuse existing servers, runs one worker with zero retries, and uses desktop
1440×900, tablet 768×1024, and mobile 320×800 projects.

## Run

From the repository root, first prepare the isolated database:

```sh
DATABASE_URL_TEST="$YOUR_ISOLATED_TEST_DATABASE_URL" \
LAB3_INITIAL_PASSWORD="$YOUR_FAKE_LOCAL_SEED_PASSWORD" \
node scripts/lab-04/prepare-test-database.mjs --reset
```

Export the required fake E2E credentials and guarded origins into the current
shell, then run the full matrix:

```sh
E2E_SUITE=lab4 npm --prefix client run test:e2e:lab4
```

`client/playwright.config.ts` enforces the Lab 4 suite selector and all three
projects. `--list` is discovery only and does not count as execution evidence.
Screenshots are saved under `artifacts/lab-04/screenshots/` only after the
journey's relevant loaded-state assertions. Do not commit Playwright traces,
videos, reports, real credentials, session cookies, database URLs, or other
unredacted secrets.
