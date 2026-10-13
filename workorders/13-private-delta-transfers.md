# WO-13 — Private delta transfers

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Transfer and retain only changed content between authorized file versions using private content-defined chunk indexes, while preserving existing fixed-chunk canonical CIDs and keeping equality fingerprints away from public storage providers.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-13-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-13-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-13` and `@requirement WO-13-Rnn` tags
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

- `hashFileStreaming`
- `readLocalChunk`
- `swarmInit`
- `swarmStep`
- `uploadGlobalReplica`
- `retrieveGlobalFile`
- `saveCatalogStateV4`
- `globalCatalogSnapshot`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-13-R01

Implement the deterministic CDC algorithm below and publish its exact version. A delta manifest describes ordered chunks, lengths, private hashes and encrypted object references; it is signed and encrypted within the authorized room or independent capability scope.

### WO-13-R02

Preserve canonical fixed-chunk content IDs. Reassemble CDC bytes in order into existing canonical chunk dimensions while incrementally computing sha256-chain-v1; publish a new immutable version only after its expected full root and size verify.

### WO-13-R03

Keep plaintext chunk hashes, cross-version matching indexes, filenames and base/target relationships private. No public convergent encryption, global plaintext hash lookup or cross-room deduplication oracle is permitted. Deduplicate only within explicitly authorized key/scope boundaries.

### WO-13-R04

Encrypt new chunks with fresh random object keys/nonces or an authenticated scope key and fresh nonces. Reuse previously verified ciphertext only when its authorization/key scope and immutable bytes are identical. Bind chunk identity, length, scope and algorithm to AAD; never reuse a nonce to encrypt changed bytes.

### WO-13-R05

Build chunking and matching as bounded resumable jobs. Stream the base and target, spill private indexes to encrypted disk/IDB, use byte-bounded worker queues and yield to active playback. Native multi-GB files must not be copied into one Blob or indexed with an unbounded in-memory hash map.

### WO-13-R06

Expose versions.createDelta/inspect/apply/list and readable UI version/delta progress through the common engine. Report logical bytes, reused verified bytes, newly uploaded wire bytes, ciphertext overhead and achieved durability separately.

### WO-13-R07

Verify every reused chunk against authenticated private digest and expected length before reconstruction; reject a malicious base, collision/substitution, inconsistent offsets, missing chunks, cycles and oversized manifests. A provider receipt alone is not proof of plaintext equality.

### WO-13-R08

Persist reference counts/ownership for manifests and encrypted objects with transactional updates. Garbage collection cannot delete chunks still referenced by another retained version or in-progress accepted job. Aborted publication leaves recoverable staging and does not mutate the previous version.

### WO-13-R09

Recover delta upload/apply after crashes, source changes and partial provider failures. Pinning a delta version requires its complete transitive byte dependencies plus recoverable private manifest; a small patch file alone is not a durable replacement.

### WO-13-R10

Implement compatibility fallback: peers without delta support can fetch a verified reconstructed canonical file via the ordinary byte path. Do not alter old manifests or require every peer to upgrade to read a newly published ordinary CID.

### WO-13-R11

Enforce principal/version scope and budgets on base lookup, reuse, reconstruction, GC and export. Password-locked canonical data is already ciphertext; delta over it may save little and must not require plaintext password disclosure to providers. Plaintext-aware delta requires explicit unlock authority and private re-encryption.

### WO-13-R12

Validate known CDC vectors, shifted edits, random/encrypted incompressible inputs, corrupted reused chunks, cross-room probing, GC/crash and old-client reads. Demonstrate actual wire savings for a controlled edit and report cases where overhead makes delta inappropriate.

## Implementation sequence

1. Implement the exact pure CDC reference and independent test vectors. Add a worker/native streaming implementation with encrypted spill indexes.
2. Build a private base-version index from fully verified authorized bytes. Compute the target CDC manifest, matching only inside the selected scope.
3. Upload new encrypted chunks, verify reused dependencies and transactionally commit the signed private version manifest plus dependency ownership.
4. Reconstruct canonical chunks for legacy serving and final target verification. Add apply/export jobs and UI metrics.
5. Test edit savings, incompressible fallback, restart and reference-safe deletion under concurrent version jobs.

## Interfaces, algorithms and formats

CDC profile `tracker-gear64-v1`: for byte b, gear[b] is the first 8 bytes interpreted uint64 big-endian of SHA256(UTF8(`tracker-gear-v1|${b}`)), where b is decimal 0..255. Start h=0; for each byte h=((h<<1)+gear[b]) mod 2^64. End a chunk after at least 65536 bytes when (h & ((1<<18)-1))==0, or at 1048576 bytes; reset h=0 at each boundary. Emit the final nonempty tail; empty input has one zero-length chunk. The 262144-byte nominal average is an algorithm parameter, not a guarantee. BigInt and native implementations must match exactly.

Private manifest body: `{schema:1,algorithm:"tracker-gear64-v1",scopeId,versionId,baseVersionId,target:{cid,size,canonicalChunkSize,total},chunks:[{ordinal,offset,length,plainHash,objectRef,cipherHash,keyRef}],publisher}`. Sign under `robit-tracker-private-delta-v1`, encrypt before provider storage. `plainHash` is SHA256 of the CDC chunk; keep it private. Validate contiguous offsets, total lengths and every digest. Cap metadata pages; encrypt paginated manifest pages and authenticate their order/root in the signed descriptor.

For scope-key encryption use random 12-byte IV, AES-GCM tag 128, AAD canonical `{domain:"tracker-delta-chunk-v1",scopeId,chunkId,length,algorithm}`. chunkId is random, not a public plaintext digest. Store IV/tag with ciphertext; repeated version references to one immutable ciphertext do not re-encrypt it. Reconstruct the canonical target from referenced chunks; expected root verification is mandatory before marking the version complete.

CDC chunks can exceed the existing provider's maximum chunk size. Encode one encrypted
CDC object into ordinary provider frames of at most CHUNK_SIZE+128 bytes (choose CHUNK_SIZE
for a simple fixed framing profile), with object size/total/last-frame length consistent
with begin validation. Compute the existing provider ciphertext chain over those frames.
Private manifest hashes bind the whole immutable CDC ciphertext as well as ordered frame
metadata; retrieval authenticates/reassembles it before plaintext reuse. Empty CDC data
still encrypts to at least 28 bytes. Do not pass a 1 MiB CDC cell as one provider put.


## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-13-A01

Requirements: `WO-13-R01`, `WO-13-R02`, `WO-13-R05`.

**Exercise:** Compare reference, worker and independent CDC implementations over deterministic and boundary fixtures.

**Pass condition:** Chunk boundaries/digests match exactly and reconstructed old canonical CIDs remain unchanged.

### WO-13-A02

Requirements: `WO-13-R02`, `WO-13-R04`, `WO-13-R06`, `WO-13-R12`.

**Exercise:** Insert/remove bytes near the beginning of a 256 MiB generated fixture, then transfer the new version to a peer retaining the base.

**Pass condition:** Target bytes/root match; only unmatched chunks plus measured metadata/crypto overhead travel, with actual savings recorded.

### WO-13-A03

Requirements: `WO-13-R03`, `WO-13-R11`.

**Exercise:** Attempt cross-room/private-capability hash probing and inspect all provider traffic and public offers.

**Pass condition:** No plaintext digest, base relation, filename, password or private scope metadata leaks; unauthorized reuse is denied.

### WO-13-A04

Requirements: `WO-13-R04`, `WO-13-R07`.

**Exercise:** Tamper reused bytes, key references, lengths, offsets, manifest pages and dependency graph.

**Pass condition:** Authentication/root/structure errors fail without publishing or falsely marking verified.

### WO-13-A05

Requirements: `WO-13-R05`, `WO-13-R08`, `WO-13-R09`.

**Exercise:** Crash during upload, reference commit, apply and GC; concurrently delete base while target job runs.

**Pass condition:** References protect needed chunks, restart reconciles staging and previous version remains valid.

### WO-13-A06

Requirements: `WO-13-R09`, `WO-13-R10`.

**Exercise:** Retain delta target, take original source offline, then fetch through an unmodified legacy client path.

**Pass condition:** All dependencies/private recovery metadata suffice; reconstructed canonical transfer verifies normally.

### WO-13-A07

Requirements: `WO-13-R05`, `WO-13-R06`, `WO-13-R11`, `WO-13-R12`.

**Exercise:** Use random ciphertext-like input and multi-GB files under foreground playback and tight budgets.

**Pass condition:** Bounded RSS/queues hold, truthful limited/no savings are reported and scheduler avoids forcing delta when overhead dominates.

### WO-13-A08

Requirements: `WO-13-R06`, `WO-13-R08`, `WO-13-R10`, `WO-13-R11`.

**Exercise:** Exercise UI/agent version inspection, scope revocation, selective cache clear and version release.

**Pass condition:** Progress/durability metrics agree, unauthorized access stops and shared live references survive cleanup.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Document every CDC constant, table derivation and integer arithmetic rule with a known-vector example.
- Explain private equality boundaries, nonce-safe ciphertext reuse and canonical reassembly.
- Comment dependency ownership/GC transactions and why a patch alone is not retained content.
- Describe fallback/overhead metrics and locked-ciphertext limitations at the selection policy.

## Implementation handoff and traceability

Create `tests/wo-13-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-13/validation.md` plus redacted machine-readable evidence. At the top of
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
