# WO-20 — Accessible, searchable content representations

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Provide private, provenance-backed text, OCR, captions/transcripts and structured representations of shared content for assistive interfaces and agents, with local-first extraction, bounded search results and inherited access controls.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-20-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-20-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-20` and `@requirement WO-20-Rnn` tags
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

- `renderInterface`
- `openPreview`
- `readLocalChunk`
- `canonicalToPlain`
- `verifyCachedDownloadRoot`
- `hasPermissionV4`
- `BrowserStorage`
- `setPrivacyMode`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-20-R01

Implement a versioned derived-artifact registry binding source CID/representation, source verification status, extractor ID/version, language, artifact type, output digest, created revision and provenance spans. Artifacts are derived data, not original signed author statements; preserve that distinction in results.

### WO-20-R02

Support at minimum UTF-8 text/CSV structured text, text-layer PDF extraction, image OCR, audio/video transcription or supplied caption parsing, and accessible preview text. Every advertised extractor must actually run on test fixtures; unsupported codecs/languages/model absence are explicit capability states, never successful empty output.

### WO-20-R03

Use lazy optional CPU-local extractors with pinned versions/checksums/license metadata and bounded workers. Do not download large models on ordinary page load. Provide explicit install/enable and local headless worker support; external inference is disabled unless an owner configures and authorizes the exact service/data scope.

### WO-20-R04

Keep source bytes, extracted text, embeddings, thumbnails, waveform/caption indexes and filenames encrypted at rest within their room/capability scope. Providers see only independently encrypted opaque objects. Locked content extraction requires unlock authority; default ciphertext retention does not enable plaintext extraction.

### WO-20-R05

Inherit and recheck principal, room, resource and capability permissions for extraction, search, snippets, artifact IO and background jobs. Revoke/invalidate cached plaintext access after authority/key changes; cached data already delivered to an authorized reader cannot be recalled.

### WO-20-R06

Implement bounded paginated lexical search as the default, with fields/filter/projection, score semantics and stable cursors. Optional semantic search requires a real installed embedding model, versioned vectors and measured tests; do not describe keyword matching as semantic retrieval.

### WO-20-R07

Return precise provenance where available: page/line/cell for text/PDF/CSV, bounding box/page for OCR, timestamps and speaker confidence for transcripts. Distinguish exact source offsets from approximate alignment and expose OCR/transcription confidence/error limits; do not invent citations or promise perfect recognition.

### WO-20-R08

Expose representations.list/create/get/delete and content.search/readSpan through the common agent engine with byte handles for large outputs and token/byte budgets for snippets. Treat extracted instructions/HTML as untrusted content and escape render output; artifact text cannot issue tools or broaden agent authority.

### WO-20-R09

Add accessible keyboard/screen-reader UI for extraction progress, searchable results, transcript/caption navigation and source-linked preview. Use semantic labels/focus/live announcements, mobile wrapping, dark/light contrast and reduced-motion support. Preserve the requested page zoom policy; provide in-app readable text sizing instead of silently changing viewport behavior.

### WO-20-R10

Persist extraction jobs/checkpoints and encrypted index pages with crash recovery, cancellation, quota limits and reference-safe GC. Artifact invalidation on source version change is explicit; clearing a derived index must not delete the source content or unrelated artifacts.

### WO-20-R11

Record extraction/model dependency inventory and data-exposure explanation in code and privacy UI. Default offline-local processing remains offline; any service submission shows exactly what content leaves, under which configured grant, before authorization or a previously granted policy.

### WO-20-R12

Validate actual extraction accuracy against generated known fixtures, authorized search isolation, prompt/HTML injection, locked content, offline/headless operation, assistive navigation, multi-GB/source streaming limits and restart. Record source hashes, tool/model versions, quality metrics and unsupported cases.

## Implementation sequence

1. Implement the encrypted artifact schema and permission/provenance wrapper, then text/CSV/PDF text plus supplied WebVTT/SRT parsing as small real extractors.
2. Add an explicitly installed CPU OCR worker (e.g. pinned Tesseract distribution) and local speech worker (e.g. pinned whisper.cpp binary/model). The implementation chooses exact supported versions, records hashes/licenses and supplies automated install/check commands; no GPU allocation is needed. Browser delegates to an explicitly authorized local owned companion when native-only extraction is selected, not an arbitrary open localhost service.
3. Implement source streaming into worker temp files, bounded encrypted output/index pages and resumable jobs. If a codec needs a seekable file, stage it durably and account disk rather than loading all bytes into memory.
4. Build default lexical inverted index with exact scope binding and paged search/provenance reads. Add accessible preview/caption/result navigation and equivalent agent commands.
5. Run real OCR/speech/PDF fixtures and security/offline/accessibility tests. Advertise only tested extractors and languages; model installation state is visible and does not masquerade as completed extraction.

## Interfaces, algorithms and formats

Artifact descriptor: `{schema:1,artifactId,source:{cid,representation,verification},scopeRef,kind,extractor:{id,version,modelHash,language},digest,byteLength,provenanceProfile,indexRevision,state}`. Sign/export under `robit-tracker-derived-artifact-v1` if shared, then encrypt within the same or narrower scope. Local unsigned extraction is labeled local provenance, not original authorship. Link source changes by immutable CID, not display filename.

Span record: `{artifactId,spanId,text,source:{page,line,column,cell,bbox,timeStart,timeEnd,byteStart,byteEnd},alignment:"exact"|"approximate",confidence}`; absent coordinates are omitted, never fabricated zero. Normalize Unicode for index terms while preserving original text/offset maps. CSV parser handles quoted newlines and explicit encoding/error reporting. PDF extraction distinguishes text layer from scanned pages needing OCR; embedded JavaScript/remote links never execute.

`content.search({room,query,resourceIds?,kinds?,fields?,cursor?,limit:20,maxBytes:32768})` returns `{items:[{artifactId,cid,score,snippet,spans,verification}],nextCursor,indexRevision}` after current authorization filtering. Define lexical tokenization/ranking (e.g. Unicode word tokens and BM25 with documented constants) in code; tie-break by stable artifact/span ID. Cursor binds principal/scope/query/indexRevision and expires explicitly on incompatible rebuild.

Quality fixtures: render known high-contrast multilingual text image with a recorded font; compare normalized OCR character/word error rates and boxes. Generate speech using an installed local TTS tool with known script and compare word error rate/timestamp ordering using a real installed transcription model. Choose/assert realistic fixture thresholds before running; report actual metrics and do not tune away failures. Supplied captions alone do not validate advertised speech recognition.

## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-20-A01

Requirements: `WO-20-R01`, `WO-20-R02`, `WO-20-R07`, `WO-20-R12`.

**Exercise:** Extract generated text/quoted CSV/PDF text/image OCR/spoken audio/video and supplied VTT/SRT with recorded source/tool/model hashes.

**Pass condition:** Advertised real extractors produce provenance-backed outputs within predefined fixture quality thresholds; unsupported input is explicit.

### WO-20-A02

Requirements: `WO-20-R03`, `WO-20-R04`, `WO-20-R11`.

**Exercise:** Run fresh browser/headless extraction offline after explicit model install, inspect page-load downloads and provider/network capture.

**Pass condition:** No default large model fetch or external inference, encrypted artifacts stay private and only configured local worker receives authorized plaintext.

### WO-20-A03

Requirements: `WO-20-R04`, `WO-20-R05`, `WO-20-R06`.

**Exercise:** Search two rooms/capabilities with locked and unlocked files, swap handles/cursors, revoke grants and inspect snippets/cache.

**Pass condition:** Unauthorized text/embeddings/snippets never appear; current scope filtering applies and stale cursors invalidate safely.

### WO-20-A04

Requirements: `WO-20-R06`, `WO-20-R07`, `WO-20-R08`.

**Exercise:** Query known words/cells/pages/timestamps, read spans with small budgets and test optional semantic capability declaration.

**Pass condition:** Ranking/cursors/provenance are reproducible, metadata stays bounded and keyword search is not mislabeled semantic.

### WO-20-A05

Requirements: `WO-20-R05`, `WO-20-R08`, `WO-20-R09`.

**Exercise:** Embed tool instructions, script/HTML and remote URLs in documents and extracted captions.

**Pass condition:** Content is escaped/untrusted, cannot trigger commands/network access or broaden authorization, and screen-reader navigation remains usable.

### WO-20-A06

Requirements: `WO-20-R03`, `WO-20-R09`, `WO-20-R12`.

**Exercise:** Use keyboard/accessibility tree checks and screen reader where available in mobile/dark/light/reduced-motion modes.

**Pass condition:** Focus, labels, announcements, caption navigation, contrast and text sizing work without overflow or forced viewport changes.

### WO-20-A07

Requirements: `WO-20-R10`, `WO-20-R12`.

**Exercise:** Kill extraction/index jobs, change source version, exhaust quota and clear a selected derived artifact.

**Pass condition:** Committed checkpoints recover, stale versions invalidate, memory/disk bounds hold and original/unrelated files survive.

### WO-20-A08

Requirements: `WO-20-R01`, `WO-20-R02`, `WO-20-R03`, `WO-20-R10`, `WO-20-R11`, `WO-20-R12`.

**Exercise:** Process long generated media/large text using native/local worker and compare UI/agent results and code documentation.

**Pass condition:** No whole-media RAM aggregation, quality/provenance/privacy limitations are explicit and every advertised capability has executable evidence.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Document artifact/source verification and derived-author versus original-author provenance.
- Explain encryption/scope inheritance, cache revocation limits and local-versus-service data exposure.
- Comment extractor dependencies, model install gates, chunk/temp-file limits and job recovery.
- Specify tokenization/ranking, original-offset maps, approximate alignment and measured quality limitations.

## Implementation handoff and traceability

Create `tests/wo-20-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-20/validation.md` plus redacted machine-readable evidence. At the top of
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
