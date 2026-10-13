# WO-12 — Authenticated random-access reads

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Allow verified seeking, range reads and agent byte access without downloading the entire prefix. Add a signed independent chunk-proof index alongside the existing chain CID, preserving every old content identity and distinguishing authenticated bytes from legacy provisional streaming.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-12-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-12-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-12` and `@requirement WO-12-Rnn` tags
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

- `swarmInit`
- `swarmStep`
- `hashFileStreaming`
- `readLocalChunk`
- `canonicalToPlain`
- `handleBinary`
- `verifyCachedDownloadRoot`
- `openPreview`
- `ensureStreamHorizon`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-12-R01

Keep sha256-chain-v1 canonical CIDs unchanged. Add a versioned sidecar Merkle index with its own algorithm/domain identifier, explicitly binding canonical CID, size, chunk dimensions, root and publisher authority. Do not relabel the existing sequential chain as a random-access proof.

### WO-12-R02

Build the index only from fully verified canonical source bytes. An index publisher signs after independently recomputing the existing chain root; preserve original manifest author and distinguish an authorized index publisher from original authorship. Reject an index signed by an unrelated or currently unauthorized key.

### WO-12-R03

Implement the exact leaf/node/tree algorithm below, including byte-order, length binding, odd-tree split and empty-file handling. Use bounded streaming construction plus durable indexed hash pages; no full-file byte buffer or unbounded leaf array is allowed.

### WO-12-R04

Expose ranges.open/read/close and proof retrieval through semantic commands and authenticated peer messages. Validate offsets/lengths as safe nonnegative integers within the declared size; bind responses to index version, canonical CID, principal and request. Return bounded byte handles, not oversized JSON/base64.

### WO-12-R05

Fetch only requested canonical chunks and required proof nodes, using existing adaptive request scheduling, relay privacy, retries and backpressure. An offset change must reprioritize chunk demand and release obsolete reservations instead of downloading the file prefix to the target.

### WO-12-R06

Authenticate every canonical chunk against the trusted signed Merkle root before labeling it verified or exposing a verified byte range. For locked files verify canonical ciphertext first, then decrypt only with authorized file key and translate requested plaintext offsets using explicit plaintext chunk dimensions.

### WO-12-R07

Integrate MP4/WebM seek paths with container metadata requirements: faststart and tail-moov metadata may require additional bounded reads, and keyframes may precede the requested time. Resolve time-to-byte through real demux metadata; never estimate offsets solely from duration/average bitrate or promise decoding at any arbitrary byte.

### WO-12-R08

Provide a compatibility policy for legacy sources without an index: verified API reads stage and verify the complete canonical file before returning, or return an explicit authenticated-range-unavailable result. Provisional playback may continue only when explicitly identified as provisional; never silently downgrade a requested verified range.

### WO-12-R09

Cache signed indexes/proofs and verified-range bitmaps encrypted with source/index version bindings. Corrupt, stale or conflicting roots invalidate affected caches; generation-fence pending reads after source/seek/authorization changes. Integrate storage accounting, quotas, eviction and restart recovery.

### WO-12-R10

Validate proof sizes/depth, dimensions, node coordinates and duplicate/conflicting nodes before expensive work. Cap response byte/node counts, apply provider penalties to invalid proofs and prevent retry amplification. A proof proves content membership, not provider long-term possession or human trust.

### WO-12-R11

Expose verification state and range progress consistently to UI/agents. Fully verified download completion still recomputes the canonical chain or reuses a trustworthy complete verification record; an isolated verified chunk is not a completed file.

### WO-12-R12

Validate mathematical test vectors with an independent implementation, malicious proofs, actual tail-moov and faststart seeking between real peers, restart, locked files and multi-gigabyte RSS. Document all algorithm inputs and compatibility behavior in source comments.

## Implementation sequence

1. Implement canonical byte encoders and a pure reference Merkle algorithm, then an optimized bounded index builder. Check the reference and production builders against independent vectors before networking.
2. Sign a `robit-tracker-range-index-v1` record only after source chain verification. Persist fixed-size hash pages and a compact signed root descriptor; build a crash-recoverable index job.
3. Add authenticated proof messages and principal-bound range handles. Reuse the existing chunk scheduler while introducing a demand set instead of prefix-only acquisition.
4. Connect demux seek metadata, cancel/fence obsolete demands and expose verified/provisional state. Keep normal stream SAFE control dynamic.
5. Test old/new sources, container metadata locations and locked plaintext translation through actual browser playback and byte comparisons.

## Interfaces, algorithms and formats

Index profile `tracker-merkle-sha256-v1`:
- Leaf i = SHA256(0x00 || uint64be(i) || uint32be(canonicalChunkLength) || canonicalChunkBytes).
- Internal node = SHA256(0x01 || left32 || right32).
- A one-leaf tree is that leaf. For n>1 split at the largest power of two strictly less than n; recursively hash left then right. Do not duplicate odd leaves. Empty canonical file has one length-zero leaf, following existing CID chunk semantics.
- Membership proof is the ordered sibling-hash list plus explicit coordinates/tree size; verifier derives left/right from index and the deterministic split, rejects unused/missing siblings and bounds depth by ceil(log2(N)). Use index values <= Number.MAX_SAFE_INTEGER or encode/validate decimal BigInts consistently; no lossy JSON numbers.

Signed descriptor body: `{schema:1,algorithm:"tracker-merkle-sha256-v1",cid,size,chunkSize,total,merkleRoot,publisher,sourceManifestDigest,indexVersion}` signed with `signRecordV4` under `robit-tracker-range-index-v1`. For locked data include authenticated `plainSize`, `plainChunkSize` and locking scheme from the original manifest, not an untrusted range response. The source CID is the old sequential chain, NOT the Merkle root.

Persist pages keyed by CID/indexVersion/page number; each stored node has a deterministic level/range coordinate. Index builder may spill nodes/leaves to IndexedDB/native disk and merge subtrees incrementally. Report temporary index disk budget separately; verify index before atomically marking ready.

`ranges.open({room,cid,offset,length,representation:"canonical"|"plaintext",verification:"required"})` returns a handle, proof profile and actual requested range. Read bounded blocks; final receipt includes verified canonical chunk indices and mapped plaintext bounds. HTTP range support elsewhere may wrap this interface.

## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-12-A01

Requirements: `WO-12-R01`, `WO-12-R02`, `WO-12-R03`, `WO-12-R12`.

**Exercise:** Generate independent roots/proofs for 0,1,2,3,5,7 and power-of-two chunk counts, boundary-sized files and swapped index publishers.

**Pass condition:** Reference/production/independent hashes agree; original CIDs stay unchanged; unauthorized indexes cannot confer trusted verification.

### WO-12-A02

Requirements: `WO-12-R03`, `WO-12-R04`, `WO-12-R06`, `WO-12-R10`.

**Exercise:** Mutate a byte, length, index, sibling direction, root, tree size, duplicate node and excessive proof depth.

**Pass condition:** All malformed or non-member proofs fail before verified exposure; size/depth bounds prevent resource exhaustion.

### WO-12-A03

Requirements: `WO-12-R04`, `WO-12-R05`, `WO-12-R06`.

**Exercise:** Read random first/middle/last ranges from multi-GB plain and locked files over relay-only peers.

**Pass condition:** Only required chunks/proofs are demanded; returned bytes match independent plaintext/canonical expectations with bounded RSS.

### WO-12-A04

Requirements: `WO-12-R05`, `WO-12-R07`, `WO-12-R11`.

**Exercise:** Seek far forward then backward in faststart, tail-moov MP4 and WebM while recording requested chunk indices and video currentTime.

**Pass condition:** Demand moves to actual metadata/keyframe ranges, playback resumes without fetching intervening prefix, and verification labels remain correct.

### WO-12-A05

Requirements: `WO-12-R08`, `WO-12-R11`.

**Exercise:** Use a legacy source with no index and request required verification, then explicitly provisional playback.

**Pass condition:** Verified requests stage/full-verify or return explicit unavailable; provisional bytes are never labeled authenticated.

### WO-12-A06

Requirements: `WO-12-R02`, `WO-12-R09`.

**Exercise:** Crash index construction and range read, restart, substitute stale/corrupt cached proof pages and revoke file key.

**Pass condition:** Recovery resumes safely; stale/unauthorized caches invalidate and no pending callback exposes protected plaintext.

### WO-12-A07

Requirements: `WO-12-R05`, `WO-12-R09`, `WO-12-R10`.

**Exercise:** Rapidly seek/cancel with slow malicious providers and constrained cache quota.

**Pass condition:** Obsolete reservations/readers are released, invalid-proof retries are bounded, storage accounting remains accurate and new head demand progresses.

### WO-12-A08

Requirements: `WO-12-R01`, `WO-12-R06`, `WO-12-R07`, `WO-12-R11`, `WO-12-R12`.

**Exercise:** Complete a full transfer after partial authenticated reads in Chromium/Firefox and compare final canonical root.

**Pass condition:** Completion retains existing root verification semantics; proof/offset/container algorithms and limitations are documented in code.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Specify byte encodings, domain prefixes, empty/odd-tree rules and proof rejection cases next to hashing code.
- Explain that index signatures require verified source binding and do not change canonical IDs.
- Document canonical-versus-plaintext range mapping, demux metadata/keyframe requirements and legacy fallback.
- Comment bounded index storage, demand cancellation fences, proof cache invalidation and verification labels.

## Implementation handoff and traceability

Create `tests/wo-12-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-12/validation.md` plus redacted machine-readable evidence. At the top of
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

## Primary references (background, not additional project inputs)

- [https://www.rfc-editor.org/rfc/rfc9162.html](https://www.rfc-editor.org/rfc/rfc9162.html)
