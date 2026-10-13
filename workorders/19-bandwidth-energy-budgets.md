# WO-19 — Bandwidth and energy budgets

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Give users and agents enforceable aggregate network/storage/concurrency budgets and adaptive scheduling that prioritizes useful foreground data, manages background seeding and reports energy-related evidence honestly without destabilizing dynamic playback SAFE control.

## Execution contract: this file and index.html are sufficient project inputs

Implement this work order, rather than only proposing an implementation. The supplied
`index.html` is the authoritative existing application. No other work order, repository
document, hidden conversation, user browser, existing test, Scratch deployment or private
media file is a prerequisite. You may create tests, fixtures, build tools and optional
companion programs as explicitly needed below; all browser functionality must remain
available from the deployable HTML. External development tools can be installed using
the bootstrap commands below. Reference links explain provenance; implementation-critical
choices are specified in this document.

Use semantic function names to locate code; line numbers are not an integration contract.
If a named function has moved, find its responsibility before editing. If an interface
specified here already exists, validate and extend it compatibly. If absent, implement
the minimal **real** foundation described here, with persistence, validation and transport
adapters; a mock, TODO, unsupported happy path or instruction to implement another work
order first does not satisfy this order. Do not claim unrelated future features are
implemented. Define optional capability names and return `UNSUPPORTED` when absent.

This work creates production code, automated tests and in-code documentation. Changes to
shared wire formats require explicit versions, compatibility tests and recovery behavior.
Companion executables are user-operated peers/adapters; GitHub Pages remains a static
host. A service worker cannot be used as a promise of indefinite execution after browser
closure. Do not replace the existing encrypted peer routes with a mandatory central server.

## Current application facts to preserve

- The HTML is a browser IIFE. `roomLocalReady` gates local initialization; `initSecret`,
  `loadLocal`, `initGlobalStorage`, then `startMesh` initialize the room. Public diagnostics
  at `window.PrivateTrackerMesh` are not a complete command API. `TrackerSecurity` is a
  separate public policy API. UI handlers often catch errors and show toasts; resolution
  of their Promise is **not** evidence that a requested mutation succeeded.
- Default chunk size is 524288 bytes. Existing content IDs are `f-<64 lowercase hex>` and
  identify **sha256-chain-v1**, not ordinary SHA-256 of the complete file. For byte length
  S, chunk size C and N=max(1,ceil(S/C)), start H=SHA256(UTF8(`robit-swarm-v2\0${S}\0${C}\0${N}`));
  for each canonical chunk in order replace H=SHA256(H || SHA256(chunk)). The final H is
  the existing root. Empty files still have one zero-length canonical chunk. Preserve IDs.
- `catalog` maps entry IDs (`r-...` files / `d-...` folders) to entries; `contents` maps CIDs
  to immutable manifests. Entry IDs, CIDs, transfer SIDs, object IDs and request IDs are
  different identifiers. Never interchange them. `sourceFiles`/`sourceHandles` describe
  selected disk sources; `cachedComplete`/`localHave` describe local availability;
  `sessions` and `sessionBySid` describe active acquisition. A transient File reference is
  not a source that survives a restart.
- `#<room-secret>`, and `#<room-secret>/f/<root>`, carry the SAME room access secret. Generated
  secrets have 48 hex characters, but existing custom secrets also work. Parse via
  `parseTrackerFragment`, never by hashing the entire URL. Room hash is
  SHA256(UTF8('private-tracker-room|'+secret)). Existing AES-256-GCM room key uses PBKDF2-
  SHA256, salt UTF8('private-tracker-v2|'+roomHash), 250000 iterations. Reuse the existing
  implementation; do not change old room derivation. Protected invitations include the
  independent owner fingerprint in `/a/n-...`; preserve it.
- Room IndexedDB `robit-private-tracker-<roomHash>` is version 4 with `kv`, `files`, `chunks`,
  `handles`, `downloadHandles`, `streamChunks`. `putKV` encrypts JSON with AAD `local:<key>`.
  Chunk keys are `<cid>:<index>`, encrypted with AAD `cache:<cid>:<index>`. Whole-file legacy
  `files` values may be gigabytes: inspect their keys without loading them into memory.
  Existing request-success IDB helpers do not prove transaction commit. New accepted
  operations must await transaction `oncomplete`, and handle `onabort` and quota errors.
- Node identity is a persisted nonextractable Ed25519 key. Room control encryption,
  original catalog/manifest signatures, authenticated binary sessions and final content
  verification remain mandatory. Use `canonicalEncodeV4`, `signRecordV4`, `verifyRecordV4`
  and existing policy checks, not parallel unsigned mutation paths. Protected-room write
  grants constrain publishing; possession of the current room secret still grants ordinary
  room reading. An application-level deny flag cannot make an already-known key disappear.
- `readLocalChunk` supplies canonical bytes; locked files' canonical bytes are ciphertext.
  `canonicalToPlain` requires the file unlock key for plaintext. `finishDownload` and
  `verifyCachedDownloadRoot` determine verified completion. Do not mark a partial or merely
  received file verified. Existing playback may use provisional bytes before full verification.
- Room traffic uses NATS/MQTT/Nostr encrypted relays and permitted direct/overlay adapters;
  Waku is control/discovery, not a bulk media carrier. `setPrivacyMode(true)` restricts
  direct routes; preserve the distinction between hiding addresses from peers and from
  relay operators. Use existing scheduler/backpressure/recovery plumbing for file bytes.
  Playback SAFE horizons remain measured dynamically; do not introduce a fixed playback
  time target or a 300-second buffer threshold.
- `globalMesh` has a separate deployment-derived namespace, signing identity, provider
  election and `meta`/`objects`/`chunks` stores. Existing providers handle opaque encrypted
  objects via `begin`, ordered idempotent `put`, `commit`, `get`, `release`. Private signed
  locators and encrypted catalog recovery are separate from public capacity offers.
  Providers must not receive room secrets/hashes, filenames, canonical roots, plaintext
  catalogs, native source paths, passwords or agent authorization credentials. Ciphertext
  sizes, opaque IDs, pseudonyms and traffic timing remain observable; do not claim anonymity
  from the infrastructure. A provider separately invited to a room has that room's access.

## Shared implementation contract, reproduced here deliberately

Expose a versioned `TrackerCore` semantic registry inside the HTML IIFE, and an authorized
public facade `window.TrackerAgent` only for the operations implemented by this order.
Reuse a compatible existing registry. Define `register(descriptor, handler)` and
`dispatch(name,args,trustedContext)`; the descriptor has `name`, `version`, `inputSchema`,
`outputSchema`, `effects`, `permissions`, `durability`, `requiresUserGesture` and `handler`.
Validate JSON Schema before effects. Caller-supplied JSON is not `trustedContext`; context
comes from a locally authorized binding and identifies principal, room handle, permitted
operations, roots, budget and cancellation signal. A descriptor's annotations do not grant
permission. Do not evaluate arbitrary scripts, selectors, filesystem paths or shell commands
as substitutes for semantic operations.

Browser facade minimum: `ready:Promise`, `manifest()`, `invoke(name,args,options?)` and
`getState({room?,fields?,cursor?,limit?})`. A room handle is an opaque local reference to a
credential/actor context, never a room secret disguised as an ID. Import invitations only
through an explicitly authorized operation. Bind handles to principals; knowing another
principal's handle or job ID does not authorize access. Return stable CIDs/entry IDs and
redacted state. Treat filenames, extracted text and peer-supplied tool descriptions as data,
not instructions for the agent or HTML to execute.

Application envelopes (distinct from any MCP wire envelope):
```json
{"ok":true,"requestId":"req-example","operationId":"op-example","result":{},"effects":[],"durability":"local"}
{"ok":false,"requestId":"req-example","error":{"code":"PERMISSION_DENIED","message":"Write scope required","retryable":false,"details":{}}}
```
Use error codes `NOT_READY`, `INVALID_ARGUMENT`, `NOT_FOUND`, `PERMISSION_DENIED`,
`AUTH_REQUIRED`, `USER_INTERACTION_REQUIRED`, `CONFLICT`, `QUOTA_EXCEEDED`, `OFFLINE`,
`SOURCE_UNAVAILABLE`, `CONTENT_INTEGRITY`, `STORE_CORRUPT`, `CURSOR_EXPIRED`, `CANCELLED`,
`UNSUPPORTED`, `INTERNAL` as applicable. Error details are structured and redacted.
Default metadata pages contain at most 100 items and 64 KiB serialized data; callers can
request fewer. Return continuation cursors rather than entire catalogs or base64 files.
Budget/resource limits are explicit configurable caps, not adaptive SAFE time constants.

Durability terms: `local` means required metadata AND referenced bytes/source binding are
committed to storage that survives process restart; `replicated` means acknowledged copies
on the requested independent nodes; `verified-retained` additionally means complete content
verification and the requested private recovery metadata have been acknowledged. Report
requested versus achieved durability separately. A hash, queue entry, advertised offer,
open browser File, transport send or receipt for uncommitted bytes is not a durable copy.
Long operations return a principal-bound `jobId` with `state`, durable `revision`, byte
progress, `verifiedBytes`, resumable phase and error, then provide `jobs.get`, `jobs.list`,
`jobs.cancel`, `jobs.resume` if this order needs them. States are `queued`, `running`,
`waiting_source`, `waiting_network`, `input_required`, `paused`, `completed`, `failed`,
`cancelled`. Terminal outcomes cannot be silently reclassified as success. Reuse retained
job state if present; otherwise implement the needed persistent state machine here.

Use existing encrypted `kv` records when practical. If a sidecar database is necessary,
name/version it explicitly, encrypt private metadata with a domain-separated AAD including
feature, room and record identity, and integrate it into Browser storage accounting and
safe clearing. Do not bump the room DB version merely to add stores: old clients opening
version 4 would fail. Perform WebCrypto outside live IDB transactions; under the appropriate
lock recheck expected revisions and commit prepared ciphertext atomically. Detect corrupt
records explicitly: `getKV` falling back to an empty array is not suitable for accepted jobs.
On native disk use atomic same-filesystem rename, file and directory fsync as needed, and
recoverable journals. Never silently replace a corrupt identity or invent authorship for
unsigned legacy data. Stage migrations, preserve old data until validated, and provide a
rollback/recovery path for interrupted upgrades.

Background work must be bounded by bytes and concurrent tasks, yield to foreground media,
respect cancellation, and release timers, readers, subscriptions, locks, promises, workers,
object URLs and buffers on teardown. Use generation/lease fencing so stale callbacks cannot
write after cancellation or ownership transfer. Any automatic retry must be bounded and
back off from observed latency/failure; availability messages must not cause reciprocal
query storms. Destructive scopes require explicit authorization or a previously authorized
policy, not repeated approval for every chunk. Browser/OS capture and filesystem permission
boundaries remain in force; report required interaction instead of bypassing them.

## Required validation environment and evidence

Create tests from scratch if no tests are supplied. Use Node 24 and pinned Playwright
1.64.0 (or a pinned supported replacement with the reason and lockfile recorded). Install
test dependencies outside the app bundle; example bootstrap in an empty implementation
workspace:
```sh
mkdir -p .test-deps
npm install --prefix .test-deps --save-exact playwright@1.64.0
.test-deps/node_modules/.bin/playwright install chromium firefox
mkdir -p tests artifacts
node --test tests/*.test.cjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-19-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-19-browser.mjs
```
Author those executable files and their reproducible fixture generators. Load
Playwright via `createRequire(process.env.TRACKER_TEST_DEPS+'/package.json')`; serve the
supplied HTML using a local Node HTTP server, or intercept **navigation only** at a fresh
HTTPS test deployment base. Copy the exact source under test to artifacts and record its
SHA-256. Keep transport SDK/CDN traffic real for the integration stage; an intercepted
HTML document is not evidence of a live deployment.

Use separate browser contexts/processes for sender, recipient and storage providers, with
new random room secrets and a random test deployment namespace. Do not touch a real user's
browser/profile, clear their data, reuse private room invitations, or terminate unrelated
endurance tests. Give test processes their own PIDs/profiles and clean up only those owned
by the harness. Use normal public commands/UI to create files and availability. Fault
hooks may corrupt or interrupt a transport/storage boundary; they must not synthesize a
successful catalog, completed receipt or verification outcome.

Fixtures must be reproducible without `/home/roko` files: empty bytes; 1 byte; 524287,
524288 and 524289 bytes; a multi-chunk 650000-byte file; deterministic generated larger
files. A portable deterministic byte function is `b[i]=(i*31+7)%256`; record ordinary
SHA-256 **and** the canonical Tracker root independently. Include Unicode/long names,
locked files, nested folders, wrong credentials, old signed/legacy metadata, damaged chunks,
quota failure, interrupted commits and duplicate/out-of-order messages. Generate MP4 with
CPU FFmpeg when relevant (`testsrc2`, sine audio, H.264/AAC, `-movflags +faststart`); also
exercise a file with tail metadata and an AVI compatibility case. Keep codec tools optional
outside the default page download; dependency failure is not a passing codec test.

Required layers: pure-function/unit tests; actual persistence and recovery; Chromium and
Firefox UI/API integration; real encrypted cross-context transfer with a forced relay-only
case; authorization/malformed-input negatives; teardown/resource growth; accessibility and
layout at 320, 390, 800 and 1440 px in both themes when UI changes. For an applicable long
operation kill the owning process after a durable checkpoint, restart with the same owned
profile/state, and verify byte-identical output and no duplicate commit. Browser reload
alone does not establish process-crash durability.

Record progress, event-loop delay, live task/buffer counts, transferred wire bytes, storage
usage and process RSS/JS heap where available. Compare equivalent baseline and candidate
workloads, separate warmup from steady state, and assert bounded retained state rather than
only a low initial heap. Keep independent slow/missing-source and offline fixtures. For
streaming require advancing playback and the dynamic SAFE lower-band invariant under
adequate bandwidth; an intentional outage must be reported separately with explicit
recovery assertions. Preserve baseline failures as baseline failures, not passing checks.
A 24-hour requirement below means observed wall-clock time with coverage and final source
proof; never simulate years by advancing a clock or claim a pending soak passed.

## In-code documentation and completion gate

Every new public command, persisted/wire schema, state machine, cryptographic construction,
transaction/commit boundary, permission check, fallback and non-obvious resource limit
needs a nearby explanatory comment. Use `@workorder WO-19` and `@requirement WO-19-Rnn` tags
on implementation blocks, using the actual numbered requirement IDs below. Explain inputs/outputs,
trust boundary, ordering and recovery invariants, why a limit exists, and what a future
maintainer must not change. Comment the algorithm and failure reasoning, not every obvious
assignment. Put an executable usage example beside the public facade and migration notes
beside the loader. Document feature-specific invariants listed later in this order.

Deliver the modified HTML, any expressly needed optional companions, reproducible tests,
fixtures/generators, exact install/run commands, code comments, schema vectors and a
requirements-to-code-to-test report. The report maps **every** Rnn and Ann below to symbol,
test name, execution artifact and pass/fail; include prerequisite/common invariants too.
Store redacted evidence (build SHA, dependency versions, timestamps, logs, screenshots,
roots, byte totals, result JSON); never publish credentials or private datasets. Report
unsupported environments and measured limitations honestly. Verify no duplicate HTML IDs,
syntax errors, new unhandled exceptions, unsigned bypasses, secret-bearing logs, unrelated
cache deletion, retained-resource growth or regressions of the applicable existing controls.

Do not call the work complete from a demo, mocks, screenshots, partial acceptance coverage
or undocumented manual steps. All mandatory requirements and acceptance cases must pass;
if an external dependency or required long test is pending, report it pending. Feature
visibility and advertised capabilities must match what is actually implemented. Update the
Privacy/Disclaimer explanations if this feature changes where plaintext, metadata, keys or
network addresses are exposed. Publish/deploy only within the user's applicable instruction;
these work orders do not grant unrelated infrastructure or messaging permissions.

### Schema and persistence mechanics required by the shared contract

Use JSON Schema 2020-12 (or a deliberately supported declared dialect), closed object
properties, explicit integer/array/string limits and no implicit type coercion. Resolve
only local schema references; schema validation must not fetch remote URLs. Reject
prototype-mutating property names at the bridge and cap nested input depth/bytes before
validation. New test-only fault hooks are disabled in the deployed application.

For a new locally coordinated record, persist an encrypted payload plus an explicit
schema/revision/fence envelope. Prepare cryptography outside the transaction, then read
expected envelope revision/fence and write prepared ciphertext/receipt in one readwrite
transaction. IDB transaction serialization provides the CAS boundary; Web Locks aid live
coordination but are not the sole correctness condition. A missing Web Locks API must use
the persisted CAS/fence, never an unguarded fallback. Envelope revisions are local metadata,
not public room/provider advertisements. Handle transaction abort, decrypt corruption and
lost reply explicitly. Persisted local state survives a process restart when browser/OS
storage remains available; eviction, disk loss and owner clearing are different failures,
not an indefinite durability promise. Test private-mode/quota/permission denial honestly.

## Existing-code integration map

Locate and read these current symbols before editing; understand callers, state ownership,
persistence and teardown. These are semantic anchors, not permission to bypass the core:

- `ensureStreamHorizon`
- `streamSafeBand`
- `readLocalChunk`
- `sendBinary`
- `startMesh`
- `setPrivacyMode`
- `globalProviderOperation`
- `PrivateTrackerMesh`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-19-R01

Define persisted per-principal/per-room/global policies for wire bytes, storage bytes, concurrent jobs, retry overhead and optional rolling-window rates. Explicit zero means no allowance; unlimited uses a separate authorized value. Apply the tightest intersection, not independent budgets that can jointly overspend.

### WO-19-R02

Account actual encoded transport bytes, including encryption/framing, duplicated relay sends, retries, signaling and provider metadata, separately from logical file bytes. Centralize accounting at every carrier boundary; report measured/estimated/unobservable overhead explicitly instead of labeling payload bytes total network cost.

### WO-19-R03

Implement atomic reservations before work and exactly-once settlement/refund of unused credit after actual effects. Persist checkpoints and reconcile after crash without granting a fresh allowance accidentally. Concurrent tabs/agents must share budget ownership/fences.

### WO-19-R04

Create a bounded priority/fairness scheduler for playback head/proofs, interactive agent reads, foreground transfers, seeding, repairs and extraction. Use deficit round robin or equivalent explicit weighted fair policy within admissible tasks; prevent starvation under sufficient capacity and never promise progress under zero allowance.

### WO-19-R05

Drive media demand from observed SAFE, supply/consume rate, current playback rate, RTT/jitter, gap risk and measured actuator response. Derive target/reserve pressure dynamically from the existing plant. Do not introduce a hardcoded playback time horizon, fixed 300-second target or fixed rescue threshold presented as universal.

### WO-19-R06

Admission control must respect hard user budgets and privacy before media priority. If measured capacity/budget cannot sustain playback, expose constrained/degraded reason and choose explicit pause/rebuffer/quality policy; do not secretly overspend or guarantee SAFE can never hit zero with an unavailable source.

### WO-19-R07

Use browser Save-Data, visibility/network information and battery APIs only when available and authorized. Unsupported signals are unknown, not false. Provide manual metered/low-power controls and headless equivalents; measured native CPU time may be used, but do not invent energy joules from a battery percentage.

### WO-19-R08

Adapt concurrency/batch sizes/retries to measured latency/loss and resource pressure with hysteresis, bounded queues and cancellation. Offline work backs off without storms; live latency compression stays within source/codec capability and explicit policy rather than silently changing file content.

### WO-19-R09

Expose budgets.configure/status/usage/reservations and scheduler diagnostics to UI/agents with time window, actual/estimated counters, denial reason, active demand, fairness and measured SAFE-controller signals. Keep private resource names/keys redacted from public provider offers.

### WO-19-R10

Persist policy revisions and usage journals encrypted, migrate safely and integrate storage/history into Browser storage accounting. Selective clear cannot reset an active enforced allowance; reset requires explicit authorized policy action and records a receipt.

### WO-19-R11

Preserve every carrier and privacy mode: relay-only policy cannot be relaxed to meet a speed/energy target. Account shared provider serving separately from room downloading and enforce contributions without starving authorized foreground reads.

### WO-19-R12

Validate scheduler/budget invariants with independent histories and measured real-carrier byte counts, then a 24-hour real seeding/streaming/repair soak under changing bandwidth and visibility. Report actual CPU/RSS/wire metrics, overspend bounds, fairness and controller behavior without claiming multi-year proof.

## Implementation sequence

1. Inventory every actual transport send/receive, including relay encodings and control SDK boundaries. Add counters at the lowest owned observable boundary and define what external TLS/TCP/browser overhead remains estimated.
2. Build durable policy/reservation/settlement records and a shared local budget coordinator. Define wire accounting precision before enforcement; reserve worst-case known framing before sending.
3. Add task classes, byte-bounded queues and deficit-round-robin service. Feed measured SAFE error/supply/RTT into the current adaptive media scheduler rather than replacing it with a static duration constant.
4. Add optional device hints, manual controls and privacy-preserving policy intersection. Emit explicit constrained status when requirements cannot be met.
5. Validate pure scheduler invariants, carrier-byte reconciliation, crashes and actual long-haul behavior with controlled network changes.

## Interfaces, algorithms and formats

Policy body: `{schema:1,policyId,revision,scope:{principal,room},limits:{wireBytes:{windowSeconds,maximum},storageBytes,concurrentJobs,retryBytes},mode:{metered,lowPower,backgroundAllowed},privacy,weights:{playback,interactive,transfer,seeding,repair,extract}}`. `windowSeconds` is an explicit user accounting window, not a media buffer horizon. Store wall-clock anchors plus monotonic elapsed counters; handle backward clock jumps conservatively and document reset semantics.

Reservation body: `{reservationId,operationId,policyRevision,scope,estimatedMaximum,actualSettled,remaining,state,fence}`. For unobservable transport overhead expose estimation profile separately; a hard byte guarantee applies only to precisely specified owned wire boundaries. Include each relay copy independently. Increment receive counters even for discarded malicious/duplicate traffic; user budget cannot prevent unsolicited traffic already received, so rate-limit/disconnect and report that limitation.

For a reference fair scheduler, each eligible class receives byte quantum proportional to configured weight each round; serve task only when it fits deficit and authority/budget, carrying deficit across rounds with a documented cap. Chunk tasks can be subdivided only along valid framing/proof boundaries. Foreground urgent deadlines influence admissible ordering but must not erase background entitlement indefinitely when capacity is available. All deadlines/pressure are computed from measurements; queue/memory caps are explicit resource limits.

## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-19-A01

Requirements: `WO-19-R01`, `WO-19-R03`, `WO-19-R10`.

**Exercise:** Launch concurrent principals/tabs with nested budgets, zero/unlimited policies, crash/restart and attempted cache-reset bypass.

**Pass condition:** Atomic shared accounting prevents authorized overspend beyond documented in-flight precision; active budget cannot be reset by clearing UI history.

### WO-19-A02

Requirements: `WO-19-R02`, `WO-19-R09`, `WO-19-R11`.

**Exercise:** Measure actual owned wire boundaries over every available carrier with duplicate/retry/control traffic.

**Pass condition:** Counters reconcile independently, per-copy overhead is charged, estimates are labeled and provider-serving usage is separate.

### WO-19-A03

Requirements: `WO-19-R04`, `WO-19-R08`.

**Exercise:** Replay adversarial task arrival histories with independent scheduler model and varied weights/allowed capacity.

**Pass condition:** Queues stay bounded, admissible classes make progress and disabled/zero-budget classes do not consume forbidden credit.

### WO-19-A04

Requirements: `WO-19-R05`, `WO-19-R06`.

**Exercise:** Vary available bandwidth/RTT/loss and playback rate, then cut source completely while recording SAFE and actuation.

**Pass condition:** Controller adapts from measured plant; no fixed time target is introduced and unavoidable starvation is truthfully reported.

### WO-19-A05

Requirements: `WO-19-R03`, `WO-19-R06`, `WO-19-R07`.

**Exercise:** Change policy mid-transfer, exhaust allowance, hide/show tab and simulate absent battery/network APIs.

**Pass condition:** Committed effects are settled once, new work obeys policy, unknown hints remain unknown and manual controls work headlessly.

### WO-19-A06

Requirements: `WO-19-R07`, `WO-19-R08`, `WO-19-R11`.

**Exercise:** Exercise relay-only privacy, low-power mode, offline reconnect and live-media quality constraints.

**Pass condition:** No automatic direct-route privacy relaxation, retry storms or unsupported codec claim occurs.

### WO-19-A07

Requirements: `WO-19-R08`, `WO-19-R09`, `WO-19-R10`.

**Exercise:** Review mobile/theme UI and agent diagnostics, selectively clear journals and revoke configuration authority.

**Pass condition:** Counters/denials are accessible/redacted, persistence is recoverable and policy mutation is permission checked.

### WO-19-A08

Requirements: `WO-19-R02`, `WO-19-R04`, `WO-19-R05`, `WO-19-R11`, `WO-19-R12`.

**Exercise:** Run 24 actual hours combining seeding, media, repair and network-shaping cycles.

**Pass condition:** Evidence includes elapsed time, RSS/CPU/queue/wire/fairness/controller plots, actual failures and exact accounting limitations.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Document measured versus estimated carrier overhead, unsolicited receive limits and settlement precision.
- Explain policy intersection, zero/unlimited semantics, clock/window handling and crash reconciliation.
- Comment adaptive SAFE plant inputs/actuators without fixed-duration targets and describe fairness rules.
- State unsupported device hints, energy proxy limitations and privacy-before-speed admission policy.

## Implementation handoff and traceability

Create `tests/wo-19-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-19/validation.md` plus redacted machine-readable evidence. At the top of
the validation report record the exact implementation SHA, runtime/dependency versions,
commands, start/end times and environment. Include one row per requirement and acceptance
case with implementation symbol, executable test and artifact, actual pass/fail/pending,
and any measured limitation. Include code-comment locations and migration/recovery results.
Tests may generate their own public/synthetic data; no private media or existing session is
required. A fresh agent must be able to rerun them from your documented commands.

Other planned features are optional context, not prerequisites. Where this order describes
a shared interface, implement its necessary real subset here if absent; do not leave a
mandatory path as a stub or defer its acceptance tests to a future order. Preserve and
extend compatible existing implementations. Avoid duplicating authority, jobs, crypto or
wire layers under a second incompatible API. Update the registry’s real capability state
and only advertise what the completed implementation can demonstrate.
