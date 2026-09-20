# Lab 3 screenshot provenance

The PNGs in this directory are redacted Playwright artifacts produced by the
post-release reliability run. They contain only fake local fixture data; passwords,
session tokens, database URLs, and secrets are not included.

Viewport matrix:

- desktop: 1440x900
- tablet: 768x1024
- mobile: 320px wide (800px viewport height; long-page screenshots retain
  their natural page height)

The run executed the three journeys in `e2e/lab-03/` for each project:

- requester authentication and ticket journey: 3/3
- IT Staff ticket journey: 3/3
- Administrator user-management journey: 3/3

Total live matrix: 9/9 passed, with no retries or skips. The API used a local
HTTP origin and `SESSION_COOKIE_SECURE=false` only for this local test server;
the application default remains Secure cookies. The exact migration and seed
provenance is retained in `../migration/deploy.txt`. Reliability evidence
commit: `1e639c8` (`evidence(lab3): retain reliability matrix screenshots`).
