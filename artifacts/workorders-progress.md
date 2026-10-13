# Sequential implementation status

User instruction: integrate and validate WO-01 through WO-20 in order, committing and
pushing each completed order to main before beginning the next implementation.

WO-01 is fully integrated, validated and published as
744b5c8274b7e4f63409309196b10e3bd76126d4. Its exact deployed source and real
unintercepted live peer transfer were verified. Its source-specific evidence remains
unchanged under artifacts/wo-01.

WO-02 is fully integrated and validated. The commit containing this update publishes
its implementation and exact-source gate/evidence. WO-03 is next; WO-03 through WO-20
have not yet been implemented.

Current HTML build: 2026-10-13-agent-surface-v111.
Current HTML SHA-256: 47b92841d32dcab2f82ffd49965bba1f8f2af94ab638e56302c2dded20155f21.
Published WO-01 baseline: e1fd8f8023563f861d695d657ab276f89a5a2126e634faa3ee5ccc8362b760fc.

WO-02 gate: tests/wo-02-report.mjs; artifacts/wo-02/gate.json has 51 PASS checks.
artifacts/wo-02/validation.md maps all R01–R12/A01–A08. run.md documents installation,
reproduction, protocols, authority and measured limitations. 322 Node tests pass.
Actual Chromium/Firefox suites cover discovery-to-peer bytes/global retention,
all resource families, 250 signed entries/projections, native window inputs and
origin/source/nonce/principal negatives, locked reads and grant changes, native
keyboard/focus, both themes/four widths, 100 consent cycles and 1,000 correlated events.
Both browsers pass actual process SIGKILL recovery of binding policies, original
child job, identity, stable resource URI and independently verified 1,100,000 bytes.
Current-source core, policy/quota/boundary, encrypted storage recovery/IPFS, capture
and MP4 SAFE/bookmark/far-seek regressions all pass. The published-baseline/candidate
100-cycle workload finishes with bounded contexts/queues and no unhandled errors.

Only owned synthetic rooms/browser profiles are used. User browsers/CDP 9222 and
independent endurance processes remain untouched. No CUDA/container workload is used.
