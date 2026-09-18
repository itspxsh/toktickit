# Lab 3 migration evidence

Status: **pending live run**. This directory is intentionally not populated
with invented output. The release-gate operator must run the exact migration,
seed, and integration commands in `e2e/lab-03/README.md` against a guarded
test-scoped PostgreSQL database, then retain redacted command output here with
the pinned commit and viewport/evidence provenance.

The live gate must also exercise the Admin reset fixture with
`E2E_CREATED_RESET_PASSWORD` set to a fake 12–128 character value. Do not put
that value, a database URL, or any session secret in this directory.
