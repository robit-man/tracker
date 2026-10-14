# Sequential implementation status

User instruction: integrate and validate WO-01 through WO-20 in order, committing and
pushing each completed order to main before beginning the next implementation.

WO-01 is fully integrated, validated and published as
744b5c8274b7e4f63409309196b10e3bd76126d4. Its exact deployed source and real
unintercepted live peer transfer were verified. Its source-specific evidence remains
unchanged under artifacts/wo-01.

WO-02 is fully integrated and validated. Published commit: 4a9fcb93980f88d9d09f10cde42da706c6ab502b. GitHub Pages serves the
exact validated source; an unintercepted live core/peer-byte regression also passes.

WO-03 is an incomplete implementation checkpoint, pushed at the user’s explicit
shutdown request. It has not passed its mandatory actual 24-hour observation.
The owned test and companion/browser processes were stopped and cleaned up.
WO-04 through WO-20 are unstarted; implementation is paused.

Published HTML build: 2026-10-13-agent-surface-v111.
Published HTML SHA-256: 47b92841d32dcab2f82ffd49965bba1f8f2af94ab638e56302c2dded20155f21.
WO-03 candidate HTML build: 2026-10-13-mcp-companion-v112.
WO-03 candidate HTML SHA-256: 40cc031838f09e9823c64af0c12ccf38912fefb0389b3bd68ef207fa129536e8.
WO-03 native source digest: 348fbb6c6bf0822fc010c77faaec04fd7a4ee16ab852dbef7cc2ae317ac324a5.
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

Latest user stop directive supersedes waiting for full WO-03 acceptance: stop the
24-hour seeding test too, shut down promptly, and push the current checkpoint.
The requested navigation input padding (4px 42px 4px 32px) is included in WO-03.
23 source-specific validation checks and 334 unit tests passed. The actual
observation recorded 660,813 ms before explicit interruption; this is not a
24-hour pass. See artifacts/wo-03/user-stop.json and validation.md. Modern stdio
wire integration also remains to be independently exercised before full acceptance.
No WO-04 work or background continuation is authorized while paused.
