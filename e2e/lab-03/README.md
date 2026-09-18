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

Run from `client/` after applying migrations and seeding the local development
database:

```text
npm run test:e2e:lab3
```

The suite runs desktop, tablet (768px-class), and mobile projects with no retry
or skip path. It writes screenshot provenance under
`artifacts/lab-03/screenshots/` and the HTML report under
`artifacts/lab-03/playwright-report/`.
