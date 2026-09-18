# Lab 3 migration evidence

Status: **live run captured**. The release-gate operator ran the exact
migration, seed, and integration commands in `e2e/lab-03/README.md` against a
fresh guarded PostgreSQL database whose name ended in `_test`. The deployment
applied all three repository migrations and the migration integration suite
passed 5/5. Redacted command output is retained in `deploy.txt`.

The live gate also exercised the Admin reset fixture with a fake
`E2E_CREATED_RESET_PASSWORD` value satisfying the 12–128 character policy. No
password, database URL, or session secret is retained in this directory.
