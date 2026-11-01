# Server suite reliability investigation

Test source: released `main` `0ec971f5fe2ddfd7da16575aa959d844bc254811`; unchanged product/test/tool tree.

## Finding

The initial 174/175 failure was not a deterministic authorization failure. T-DASH-S-03 failed with `Parse Error: Expected HTTP/, RTSP/ or ICE/` before its status/body assertions. The same suite also produced one later `socket hang up` in a different Lab 2 requester test under default parallel execution. These are HTTP transport/listener failures, not response assertion mismatches. The first raw response byte payload was redacted and cannot identify a precise OS-level trigger.

The tests use Supertest's implicit server for an Express app. Source inspection of installed Supertest 7.2.2 shows it calls `app.listen(0)` when the server has no address and requests `127.0.0.1:<ephemeral-port>`. Twelve sandbox attempts were recorded as failing before meaningful API assertions with `listen EPERM` on `0.0.0.0`. The original logs for attempts 1–3 were overwritten when those same paths were reused for successful default-mode comparisons; only attempts 4–12 have retained EPERM output. The historical counts for 1–3 are disclosed in the index but are not treated as artifact-verified. All are classified as environment-blocked, not product assertion failures. Under permitted loopback execution, default parallel mode showed two transport failures among six observed runs, with other runs green. The evidence does not establish a root cause or show whether the trigger is in the environment, test harness, application listener, or an interaction among them. The listener-interaction explanation remains a hypothesis, not a finding.

## Reliability check used for the gate

The same complete suite, all 24 files and 175 cases, was run with `--minWorkers=1 --maxWorkers=1 --no-file-parallelism`. Four retained serial runs passed 175/175, with zero skips and zero retries; the final run log is [`server-tests-final-serial.log`](./server-tests-final-serial.log). No cases were excluded and no assertions were weakened. The final-main gate uses this serial command. The default parallel limitation remains explicitly disclosed; do not describe parallel execution as reliable.

The six-run comparison and log hashes are in [`reliability-comparison.json`](./reliability/reliability-comparison.json). Sandbox-blocked attempts are in `server-full-repeatability.json`. Initial failed and successful Phase 2 server attempts remain in the main run index, with their original result and redaction provenance preserved.

## Public log-copy handling

Nine sandbox-blocked logs (attempts 4–12) retain the actual command output and exit/count data. Attempts 1–3 have historical metadata only; their original output is unavailable because their paths were reused by later comparison captures. Successful default comparison logs are now named `server-full-default-pass-01..03.log`, separate from the sandbox log names. For comparisons, `sourceLogSha256` identifies the captured source bytes and `logSha256` hashes the normalized UTF-8/LF committed review copy. The repeatability index hashes each retained EPERM file at its linked path.
