# WO-03 validation checkpoint — incomplete, paused by operator

The operator explicitly requested stopping the 24-hour test, shutting down promptly,
and pushing the current work. This report does **not** claim full WO-03 acceptance.
The next order has not begun. Resume only after the operator requests it.

HTML build: `2026-10-13-mcp-companion-v112`.
HTML SHA-256: `40cc031838f09e9823c64af0c12ccf38912fefb0389b3bd68ef207fa129536e8`.
Companion implementation digest: `348fbb6c6bf0822fc010c77faaec04fd7a4ee16ab852dbef7cc2ae317ac324a5`.
`source-identity.json` records individual src/bin/package/lockfile hashes. Each
native passing integration artifact records actual source identities at start/end.
Documentation and test-report changes do not change this implementation digest.

Environment: Linux, Node 24.14.0, official MCP SDK 1.32.1, Playwright 1.64.0,
Chromium 156.0.8078.4, Firefox 157.0, CPU FFmpeg 6.1.1, util-linux flock.
The committed package lock pins dependencies. No CUDA/container workload, user
browser, CDP attachment, private dataset or inherited endurance process was used.
All peer tests use owned profiles, random synthetic rooms and generated content.
Navigation/source interception supplies the exact trusted HTML; real SDK/CDN,
encrypted peer transport and file bytes remain real. This is local integration
proof, not a claim that the optional native endpoint runs on GitHub Pages.

## Observed results

`gate.json` has 23 passing source-specific checks and two pending checks.
Twelve native unit tests and 322 application tests pass (334 total). The executable
unit wrapper records actual logs, counts, exit status and matching build digests.
Native integrations ran on 2026-10-14 UTC, principally 02:24–02:37; exact start/end
timestamps live in each JSON. Both browser suites exercise the requested search
padding and real MP4/AVI decoding. Ten current-source regression suites cover
both browsers: command/UI, policy boundaries, encrypted storage, live capture,
and real MP4 relay/SAFE recovery/bookmark/far-seek behavior.

The actual endurance harness began at 02:42:10.163 UTC; observation began at
02:42:24.442 UTC. Each of published-WO02 baseline and candidate completed 1,000
real requests and 100 independent official SDK connections. It recorded 660,813 ms
of observation before operator SIGTERM. Cleanup completed at 02:54:25.335 UTC;
both owned companions exited 0 and their owned contexts/profiles were removed.
The harness truthfully records interruption, not PASS. `user-stop.json` records
the matching harness/build and explicit stop instruction. No full final 24-hour
fresh-peer source probe was reached. The separate short development run completed
its real byte probe but is explicitly ineligible for endurance acceptance.

Pending before full acceptance:

- Restart an unchanged-source actual 24-hour observation and complete its fresh
  independent reader download with matching SHA-256 and canonical Tracker root.
- Exercise modern 2026-07-28 **stdio** through actual independent wire fixtures.
  Modern HTTP and pure codec fixtures pass; they do not substitute for this case.
- Run `node tests/wo-03-report.mjs --complete`; it intentionally rejects this checkpoint.

## Requirement traceability

“Targeted PASS” means the cited actual checks pass; it does not waive outstanding
common acceptance requirements. Comments beside the named modules use
`@workorder WO-03` and the corresponding `@requirement WO-03-Rnn` tags.

| Requirement | Implementation/comment symbols | Executable proof and artifact | Status |
|---|---|---|---|
| R01 optional owned companion | `bin/serve.mjs`, `readConfig`, exact package/lock | `wo-03-standalone.mjs` → `standalone.json`; runtime test | Targeted PASS; A07 pending |
| R02 real full action engine | `OwnedRuntime`, page `TrackerCore`/`TrackerAgent`, `Toolkit` | runtime, native-IO, global, both browser suites → corresponding JSON; ten regressions | Targeted PASS |
| R03 split protocol versions | `createSdkServer`, `ModernAdapter`, codec lifecycle | `wo-03-protocol.mjs` → `protocol-foundation.json`; companion units | Legacy stdio/HTTP and modern HTTP PASS; modern stdio pending |
| R04 real tools/resources/prompts/bytes | `Toolkit`, `NativeIO`, registry descriptors | protocol and native-IO → `protocol-foundation.json`, `native-io.json`; standalone | Targeted PASS |
| R05 distinct lifecycle/metadata | `LegacyLifecycle`, `modernContext`, `ModernAdapter` | protocol/abuse/codec unit fixtures | Targeted PASS; modern stdio pending |
| R06 bounded authenticated transports | `stdioTransport`, `BoundedWriter`, `httpTransport`, `authenticate` | protocol/abuse → their JSON; 1,000 requests/100 connections per stress phase | Targeted PASS; endurance pending |
| R07 principal/room/root boundaries | `readConfig`, `OwnedRuntime.bound`, `NativeIO`, rooted descriptor checks | runtime/IO/restart/global/abuse → their JSON | Targeted PASS |
| R08 honest results/byte lifetime | `toolResult`, `safeError`, `NativeIO` leases, `CanonicalHasher` | IO/runtime/global → their JSON; real independent hash/root comparison | Targeted PASS |
| R09 durable jobs/tasks/recovery | `Journal`, `NativeIO`, Tasks, `atomicFile`, OS `ensureOwner` | `wo-03-restart.mjs` → `restart.json`; actual SIGKILL core/native checkpoints; IO Tasks | Targeted PASS |
| R10 scoped prompt plans | `Toolkit.listPrompts/getPrompt`, prompt recipes | protocol/IO → their JSON | Targeted PASS |
| R11 independent conformance | actual SDK client suites, independent modern HTTP and raw stdio fixtures | protocol/abuse/native-IO/restart | Modern stdio and endurance pending |
| R12 install/config/rollback | package/lock, executable comments, `sourceIdentity`, companion README | standalone/unit/source gate | Documentation delivered; full acceptance pending |

## Acceptance traceability

| Case | Executable proof | Actual outcome |
|---|---|---|
| A01 fresh supplied-HTML companion | `wo-03-standalone.mjs`, runtime/protocol suites | PASS: fresh package install without repository tests/modules; both baseline transports expose 112 actual authorized tools, resources/prompts, signed action and exact public source bytes |
| A02 lifecycle/version separation | `wo-03-protocol.mjs`, companion codec units | Partial: legacy SDK stdio/HTTP and independent modern HTTP pass; modern stdio wire pending |
| A03 actual byte transfer/retention | `wo-03-io.mjs`, runtime/global suites | PASS: deterministic multi-chunk input → actual canonical upload → independent verified output; no base64 tool payloads; private global catalog acknowledgment and cold retrieval |
| A04 hostile inputs and authority | protocol/abuse/runtime/IO/restart suites | PASS: Host/Origin/token, malformed/oversize/prototype/depth/null ID, foreign room/job/principal, rooted path/aliases and credential export negatives |
| A05 disconnect/crash/cancel | `wo-03-restart.mjs`, `wo-03-io.mjs` | PASS: real native then core-upload checkpoint SIGKILL; original IDs and one signed publication; revoked scope fails once without spin; scoped cancel preserves completed bytes |
| A06 filtered schemas/resources/prompts | protocol/IO/browser suites | PASS: locked ciphertext/plaintext paths, limited reader and listing-only identity, actual resource reads/cursors; prompts grant no authority |
| A07 stress plus 24 real hours | `wo-03-soak.mjs`, `soak-24h.json`, `user-stop.json` | INCOMPLETE: both 1,000-request/100-connection phases passed; 660,813 ms observation interrupted by user; final endurance source probe pending |
| A08 independent global recovery | `wo-03-global.mjs` → `global-recovery.json` | PASS: original uploader offline, unrelated provider restarts opaque inventory, fresh reader recovers signed listing and independently verifies/downloads exact bytes |

## Reproduction and recovery

See `agent/mcp/README.md` for exact installation, owner-only config/token/invitation
files, rooted IO, protocol matrix, TLS boundary, commands, privacy and rollback.
Install Node 24, util-linux flock, pinned companion dependencies with `npm ci`,
then Playwright Chromium/Firefox. CPU FFmpeg generates synthetic media. Test-only
helpers live under `agent/mcp/test`; production requires no repository test helpers.

From repository root:

```sh
node tests/wo-03-units.mjs
node tests/wo-03-runtime.mjs
node tests/wo-03-protocol.mjs
node tests/wo-03-io.mjs
node tests/wo-03-restart.mjs
node tests/wo-03-global.mjs
node tests/wo-03-browser.mjs
BROWSER=firefox node tests/wo-03-browser.mjs
node tests/wo-03-abuse.mjs
node tests/wo-03-standalone.mjs
node tests/wo-03-soak.mjs --hours 24 --requests 1000 --connections 100
node tests/wo-03-report.mjs --complete
```

The ten browser regressions use existing `wo-01-browser`, `wo-01-boundaries`,
`wo-01-storage`, `wo-01-capture` and `wo-01-media` harnesses, both engines, with
`WORKORDER_ARTIFACTS=artifacts/wo-03/regressions` and generated FFmpeg media.
No old order's source-specific evidence is relabeled or overwritten.

Native schema 1 journals authenticate revision/fence/feature with AES-256-GCM,
fsync before acknowledgment, and exclude another owner through inherited OS flock.
Missing/corrupt accepted keys fail closed. Native chunks use separate HKDF keys,
random nonces and identity/index/dimension AAD. Inputs and completed output survive
process death; source and byte handles have explicitly shorter lifetimes. Output
publication is no-replace and reconciles inode plus SHA; cancellation uses the same
commit mutex. Terminal Tasks remain historical snapshots when application jobs resume.
An authority removed at restart marks accepted work failed once rather than spinning.

Before an upgrade stop the service and back up the complete private state/config,
trusted HTML and package/lockfile. Source pins require local explicit upgrade flags;
rollback restores the complete matching backup. Do not delete keys or accepted
idempotency history to force an upgrade. Linux-only process/descriptor requirements,
finite quotas and native OS capture consent are documented, not silently bypassed.
Storage providers still receive only opaque ciphertext; this does not conceal traffic
metadata from infrastructure or plaintext from the authorized local OS account.
