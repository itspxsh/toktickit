# Lab 3 screenshot provenance

The PNGs in this directory are redacted Playwright artifacts refreshed by the
final-main validation of application commit `8b95276` on 2026-09-22. They
contain only fake local fixture data; passwords, session tokens, database URLs,
and secrets are not included.

Viewport matrix:

- desktop: 1440x900
- tablet: 768x1024
- mobile: 320px wide (800px viewport height; long-page screenshots retain
  their natural page height)

The run executed the three journeys in `e2e/lab-03/` for each project:

- requester authentication and ticket journey: 3/3
- IT Staff ticket journey: 3/3
- Administrator user-management journey: 3/3

Total live matrix: 9/9 passed, with no retries or skips. Each viewport run
started from a freshly migrated and seeded isolated local E2E database so that
first-login password rotation could not affect the next viewport. The client
and API used the matching local `localhost` origin, with
`SESSION_COOKIE_SECURE=false` only for this test server; the application
default remains Secure cookies. The exact migration and seed provenance is
retained in `../migration/deploy.txt`. The preceding reliability evidence is
commit `1e639c8`; this final-main refresh is pinned to `8b95276`.
