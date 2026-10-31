# Server suite reliability investigation

Test source: released `main` `0ec971f5fe2ddfd7da16575aa959d844bc254811`; unchanged product/test/tool tree.

## Finding

The initial 174/175 failure was not a deterministic authorization failure. T-DASH-S-03 failed with `Parse Error: Expected HTTP/, RTSP/ or ICE/` before its status/body assertions. The same suite also produced one later `socket hang up` in a different Lab 2 requester test under default parallel execution. These are HTTP transport/listener failures, not response assertion mismatches. The first raw response byte payload was redacted and cannot identify a precise OS-level trigger.

The tests use Supertest's implicit server for an Express app. Source inspection of installed Supertest 7.2.2 shows it calls `app.listen(0)` when the server has no address and requests `127.0.0.1:<ephemeral-port>`. In the restricted sandbox, 12 attempts failed before meaningful API assertions with `listen EPERM` on `0.0.0.0`; these are classified as environment-blocked, not test failures. Under permitted loopback execution, default parallel mode showed two transport failures among six observed runs, with other runs green. The evidence does not establish a root cause or show whether the trigger is in the environment, test harness, application listener, or an interaction among them. The listener-interaction explanation remains a hypothesis, not a finding.

## Reliability check used for the gate

The same complete suite, all 24 files and 175 cases, was run with `--minWorkers=1 --maxWorkers=1 --no-file-parallelism`. Four retained serial runs passed 175/175, with zero skips and zero retries; the final run log is [`server-tests-final-serial.log`](./server-tests-final-serial.log). No cases were excluded and no assertions were weakened. The final-main gate uses this serial command. The default parallel limitation remains explicitly disclosed; do not describe parallel execution as reliable.

The six-run comparison and log hashes are in [`reliability-comparison.json`](./reliability/reliability-comparison.json). Sandbox-blocked attempts are in `server-full-repeatability.json`. Initial failed and successful Phase 2 server attempts remain in the main run index, with their original result and redaction provenance preserved.

## Public log-copy handling

The 12 sandbox-blocked attempts retain the actual command output and exit/count data. Their public review copies were secret-screened and normalized to UTF-8/LF with trailing whitespace removed so repository whitespace checks remain clean; `server-full-repeatability.json` records the SHA-256 of each exact committed review copy. These formatting changes do not alter test results.
