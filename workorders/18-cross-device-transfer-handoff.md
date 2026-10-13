# WO-18 — Cross-device transfer handoff

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Move an active download, seeding task or playback session between explicitly paired devices, preserving verified progress and authority while preventing stale owners from continuing conflicting writes after a confirmed handoff.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-18-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-18-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-18` and `@requirement WO-18-Rnn` tags
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

- `makeDownloadSession`
- `scanPartialDownload`
- `cacheDownloadChunk`
- `finishDownload`
- `pauseTransfer`
- `resumeTransfer`
- `cancelTransfer`
- `openPreview`
- `closePreview`
- `signRecordV4`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-18-R01

Add explicit device pairing using independent device signing/encryption keys and authenticated fingerprint/QR confirmation. A new device receives signed scoped delegation and selected encrypted state, not an export of the original nonextractable identity or all browser credentials.

### WO-18-R02

Define a versioned handoff manifest binding operation/job, immutable resource, source/destination devices, verified chunk bitmap/digests, current phase, playback time/rate, destination durability, authority scope and ownership generation. Exclude uncommitted chunks and native absolute paths from transferable checkpoints.

### WO-18-R03

Encrypt handoff state for the destination using fresh content keys and authenticated recipient-key wrapping; route over existing encrypted relays by default. No plaintext room secrets, filenames, native paths or checkpoint data enters public discovery/provider offers.

### WO-18-R04

Implement prepare -> destination_ready -> claim_committed -> source_released -> completed with durable receipts and monotonic fences. Old workers must recheck ownership before each write/publication. A confirmed handoff has one designated mutating owner; stale callbacks cannot finalize or delete new-owner state.

### WO-18-R05

Choose an explicit authoritative claim coordinator (a user-owned persistent peer or configured quorum). If it is unavailable/partitioned, do not promise exclusive global ownership: pause conflicting mutation and report waiting_network. Local locks on two disconnected devices are not a global consensus mechanism.

### WO-18-R06

Transfer verified cached chunks or retrieve them independently through authenticated sources; a received bitmap alone is not proof of local possession. Rehash/authenticate copied chunks before destination marks them verified. Resume missing chunks using existing adaptive scheduler rather than restarting at byte zero.

### WO-18-R07

Handle native/browser output bindings separately. Destination may select a new file handle/root and must grant its own permissions; source path or FileSystemHandle is not assumed portable. Existing partial destination bytes are scanned/verified, and overwrite requires explicit policy.

### WO-18-R08

Treat playback position as desired media state, resolve actual seek through demux metadata/keyframes and range demand, and start destination only after enough verified/provisionally labeled media is ready. Source may continue playback until destination ready, but transfer ownership changes only at the authoritative commit.

### WO-18-R09

Persist pairing, handoff jobs, claim generations and terminal receipts across both devices/coordinator restart. Duplicate messages, canceled attempts and retry operation IDs reconcile to one outcome. Revoked pairing or source authority fences future effects; already copied bytes cannot be recalled.

### WO-18-R10

Expose devices.pair/list/revoke and handoff.prepare/status/accept/cancel through UI/agents. Show target, transferred verified bytes, remaining bytes, source/destination state, required interaction and coordinator failure clearly. Cancellation before/after claim has distinct accurate behavior.

### WO-18-R11

Budget checkpoint/chunk transfer, encrypt private retained state, cap concurrent handoffs and clean obsolete staging only after reference checks. Preserve room privacy mode; optional direct LAN transport requires explicit policy and cannot activate silently for speed.

### WO-18-R12

Validate real two-device/profile transfers, provider/coordinator partitions, crashes at every phase, stale callbacks, wrong pairing keys and multi-GB checkpoint migration. Demonstrate reduced retransmission and correct playback resume without claiming impossible availability during loss of the authoritative coordinator.

## Implementation sequence

1. Implement pairing descriptors and protected device key persistence plus authenticated wrapping. Define principal delegation intersection with current owner policy.
2. Build checkpoint export/import using existing canonical chunk verification and opaque resource/source/destination handles.
3. Create the claim coordinator protocol below with durable CAS and generations; if no persistent peer exists, build a minimal optional owned peer from the HTML plus this order. Clearly show when the coordinator must remain online.
4. Add phase journal, destination validation, handoff commit and old-worker fence checks across download/seeding/playback paths.
5. Wire pairing/handoff controls, crash recovery and actual multi-profile relay tests with delayed stale messages.

## Interfaces, algorithms and formats

Claim coordinator record: `{schema:1,jobId,revision,generation,ownerDevice,handoffId,state,sourceDevice,destinationDevice,checkpointDigest,policyRevision}`. Authenticated `claim.prepare` requires current owner + expected revision; `claim.accept` binds destination readiness receipt; `claim.commit` atomically increments generation and changes owner using CAS; `claim.get` returns a signed current record. Only the configured coordinator’s signature is authoritative. On lost commit response, query the same handoff ID; never start a second transfer based on timeout alone.

Every destination checkpoint/write carries generation; workers verify against coordinator before externally visible mutation. To avoid pretending every offline disk write can contact a remote server, permit bounded local staging under an unconfirmed generation but prohibit catalog publication/final output replacement until authority is reconfirmed. Source staging after loss of authority may be cleaned only by local ownership/reference policy. No two-device lease clock heuristic replaces this rule.

Handoff manifest contains `schema`, `handoffId`, `jobId`, `resource:{cid,size,chunkSize,total}`, `verifiedRanges`, `chunkDigestIndexRef`, `phase`, `desiredPlayback:{time,rate,paused}`, `targetDurability`, `delegationRef`, `generation`, `checkpointDigest`. Page large bitmaps and authenticate pages. Wrap state key via P-256 ECDH -> HKDF-SHA256 (salt32, info `tracker-handoff-wrap-v1|handoffId|destinationDevice`) -> AES-GCM using random IV12/tag128 and AAD binding both devices/handoff/generation. Sign source request and destination receipt with independently trusted device keys.

Final publication/final-output replacement must be serialized through the authoritative
coordinator, not merely preceded by a remote generation check. Add `claim.finalize` carrying
expected generation, checkpoint/result digest and effect identity; coordinator commits a
signed generation-bound finalization receipt under CAS, then performs/authorizes the
single visible publication. Remote object uploads may stage harmless ciphertext before
this point and remain a recoverable saga. Destination output uses an owner-side coordinator
adapter that fences rename/publication under the same claim. On coordinator loss, staging
may continue within budget but finalization waits. All participating workers/consumers
verify the authoritative receipt for handoff-controlled effects. This protects cooperative
application operations; a separately authorized malicious holder of a full room key can
still publish unrelated data, which this protocol cannot cryptographically prevent.


## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-18-A01

Requirements: `WO-18-R01`, `WO-18-R03`, `WO-18-R10`.

**Exercise:** Pair two fresh profiles through fingerprint confirmation, try wrong/forged device keys and revoked device.

**Pass condition:** Only approved devices receive scoped encrypted state and no old private identity is exported.

### WO-18-A02

Requirements: `WO-18-R02`, `WO-18-R06`, `WO-18-R07`, `WO-18-R12`.

**Exercise:** Handoff partially verified multi-GB download to empty and already-partial destination sinks.

**Pass condition:** Destination verifies imported/scanned chunks, requests only missing data and final bytes/root match independent fixture.

### WO-18-A03

Requirements: `WO-18-R04`, `WO-18-R05`, `WO-18-R09`.

**Exercise:** Partition coordinator at each handoff phase, lose commit response and release stale source callbacks.

**Pass condition:** Ownership is resolved by durable CAS/fence; conflicting final publication waits, no split-brain success or duplicated finalization.

### WO-18-A04

Requirements: `WO-18-R02`, `WO-18-R08`, `WO-18-R10`.

**Exercise:** Move MP4 playback forward/backward across profiles while source keeps playing until ready.

**Pass condition:** Destination resumes near desired time using real keyframes/demand; source release and transfer-ownership state are accurately shown.

### WO-18-A05

Requirements: `WO-18-R04`, `WO-18-R07`, `WO-18-R09`.

**Exercise:** Kill each device/coordinator around prepare/ready/claim/release, restart and retry identical handoff.

**Pass condition:** One stable outcome recovers; source paths are not reused on target and fresh destination permission is required when needed.

### WO-18-A06

Requirements: `WO-18-R03`, `WO-18-R09`, `WO-18-R11`.

**Exercise:** Inspect relay/provider traffic, revoke authority during transfer and attempt automatic direct LAN route.

**Pass condition:** No private-state canary leaks; new effects stop after revocation and privacy mode is preserved.

### WO-18-A07

Requirements: `WO-18-R06`, `WO-18-R10`, `WO-18-R11`.

**Exercise:** Cancel before and after claim with constrained quotas and stale verified bitmaps.

**Pass condition:** Actual retained bytes/ownership are reported, forged bitmap does not count as possession and safe cleanup preserves referenced chunks.

### WO-18-A08

Requirements: `WO-18-R01`, `WO-18-R05`, `WO-18-R08`, `WO-18-R12`.

**Exercise:** Run UI/agent parity, mobile/themes, generated pairing/recovery examples and measured retransmission comparison.

**Pass condition:** Controls are accessible, coordinator limitations are explicit and evidence proves real progress reuse/playback recovery.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Document phase/fence transitions, coordinator trust and partition behavior next to ownership code.
- Explain why a bitmap is not possession proof and why native handles/paths are not portable.
- Comment key wrapping, scoped delegation and nonextractable identity preservation.
- Describe playback readiness versus transfer ownership and cancellation after irreversible effects.

## Implementation handoff and traceability

Create `tests/wo-18-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-18/validation.md` plus redacted machine-readable evidence. At the top of
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
