# WO-01 — One command engine for humans and agents

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Every human operation has a validated semantic equivalent with identical authorization, persistence, side effects and observable outcomes. Browser automation is not required to invoke business operations.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-01-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-01-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-01` and `@requirement WO-01-Rnn` tags
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

- `roomLocalReady`
- `addFiles`
- `ensureFolderPath`
- `signCatalogOperationV4`
- `requestFile`
- `makeDownloadSession`
- `finishDownload`
- `relinkSource`
- `pauseTransfer`
- `resumeTransfer`
- `cancelTransfer`
- `setSeedMode`
- `openPreview`
- `closePreview`
- `startLiveMedia`
- `queueRetainedFile`
- `retainGlobalFile`
- `pinIpfsFile`
- `confirmBrowserStorageClear`
- `initInterface`
- `TrackerSecurity`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-01-R01

Create TrackerCore and the authorized TrackerAgent facade using the reproduced shared contract. Inventory all buttons, delegated data-* actions, context menus, keyboard mutations and public security controls; produce a parity matrix covering the full action inventory below, including media, capture, storage, settings, help and source download.

### WO-01-R02

Refactor mutations out of DOM callbacks into result-returning handlers. UI controls may obtain File objects, passwords or consent, then dispatch the same commands agents use. Core handlers must not depend on selectedId, a visible modal, synthetic clicks, toast text, file-input change events or the current DOM row to choose a target.

### WO-01-R03

Validate closed schemas before any mutation and enforce protected-room policy and locally granted agent permissions at dispatch AND relevant async commit boundaries. Bind each request to its actual principal and room; do not accept a caller-supplied administrator context or use guessed handles across principals.

### WO-01-R04

Implement room-context lifecycle. Reuse the visible current room. Additional browser rooms run in bounded same-origin peer frames using the same supplied HTML; additional headless rooms use owned pages. A stable coordinator owns opaque handles and routes commands. Bind child handshakes to exact origin, a random nonce and the owned frame. Limit browser rooms to four by default, make the cap configurable, close and release contexts on leave, and preserve owner anchors and unrelated active-room state.

### WO-01-R05

Explicitly implement source registration without a picker through an authorized File/Blob/stream source reference. For files.upload, default requested durability is local: stage and verify browser chunks or a persistent authorized native source binding before reporting success. Return entryId, cid, canonical root, ordinary SHA-256 when calculated, byte length, verification, requested/achieved durability and jobId. Partial batch failures are itemized.

### WO-01-R06

Implement every transfer operation using existing acquisition, verification and source-availability paths. Return accepted jobs before completion; complete only after full canonical verification and requested storage commit. Pause/resume/cancel must affect actual network demand and survive applicable restart; relink rejects a different file without replacing a valid source.

### WO-01-R07

Implement folder and entry changes through original signed revisions with deterministic conflict handling, ancestor checks, tombstones and restorable history. Do not rewrite immutable content IDs on rename/move. Deleting metadata, releasing retention, clearing cache and deleting a disk file are different effects; disk deletion is not implicitly authorized by any of them.

### WO-01-R08

Expose capture and local file permission requirements as structured input_required/USER_INTERACTION_REQUIRED with a resumable request handle. Native authorized sources may be unattended; browser capture cannot silently bypass OS/browser consent. Browser-only layout commands are accurately marked unsupported by a non-rendering runtime, while source stop and policy operations remain available.

### WO-01-R09

Keep catalog/manifest updates, source selection, jobs and availability consistent at commit. Emit one post-commit effect/event per accepted mutation; preserve stable operation IDs across retry and transaction failure. Add a minimal durable receipt record now so adapters do not infer success from a resolved Promise.

### WO-01-R10

Provide command health, redacted introspection and bounded usage accounting. Explicitly export readiness phases localReady/networkReady/recoveryReady and blocked reasons; do not indefinitely await an unavailable network before enabling valid offline/local actions.

### WO-01-R11

Preserve all existing browser behavior, themes, mobile wrapping, tooltips, privacy/capture controls, source recovery, streaming SAFE feedback, encrypted global recovery and raw-source downloads. Keep command code inside the delivered HTML or embed a reproducibly generated core there; no extra browser runtime request is mandatory.

### WO-01-R12

Produce executable examples for joining, listing, uploading, downloading, verifying, pinning, releasing, relinking and obtaining source, with redacted handles and structured errors. Examples must run against the implemented facade in the standalone test harness.

## Implementation sequence

1. Map the IIFE state ownership and the functions above. Save a baseline snapshot, then create explicit adapters for local storage, sources, transfer jobs, presentation, credentials and peer routes.
2. Register read operations first. Introduce immutable validated argument objects and trusted-context creation; never expose internal Maps or signing keys in returned snapshots.
3. Separate source selection from addFiles indexing/publication. Return real errors from the inner implementation and let the UI translate them to toasts. Do the same for requestFile, relink, retention and cache clearing.
4. Migrate one mutation family at a time, routing existing UI actions through dispatch. Preserve existing signed serialization and peer messages; the command envelope is local control, not a replacement wire protocol.
5. Implement the bounded room coordinator and readiness handshake. A child uses the same HTML and full invitation fragment; that URL must never be returned in routine state, logs, manifests or DOM inspection tools.
6. Add post-commit receipts, cancellation checks and accurate capability descriptors. Reconcile crash-interrupted staged uploads before allowing completed source advertisements.
7. Exercise the parity matrix using independent UI and API contexts starting from equivalent persisted fixtures. Compare durable state and peer-observable effects, rather than generated UUID equality.
8. Complete comments, examples, traceability and the validation evidence. Register no command whose implementation is just a fake success, no-op, generic eval or untrusted UI click.

## Interfaces, algorithms and formats

Required invocation examples (opaque references are returned by the preceding import/registration calls):
```js
await TrackerAgent.ready;
const joined = await TrackerAgent.invoke('rooms.join', {invitationRef});
const room = joined.result.room;
const upload = await TrackerAgent.invoke('files.upload', {
  room, sourceRef, name:'example.bin', durability:'local'
});
const status = await TrackerAgent.invoke('jobs.get', {room, jobId:upload.result.jobId});
const listing = await TrackerAgent.invoke('files.list', {room, limit:20, fields:['entryId','cid','name','size']});
```
Define `sources.import` as the authorized local binding that creates sourceRef from a File,
Blob, stream or approved native path. Define `credentials.importInvitation` as the local
binding that creates invitationRef; it must not appear in ordinary list/state output.
`system.source` returns a bounded resource handle for raw deployed HTML, not a serialization
of current DOM or stored room secrets. Receipts include `operationId`, `principal`,
`roomHandle`, command name, input digest, committed result digest, achieved durability and
revision; secrets/source paths are excluded. Include the full action inventory below.


### Full action inventory for a standalone implementation

For this order, the registry must cover each applicable family below, or expose a precise
permission/environment requirement. Bind existing UI controls to these same handlers; do
not declare a human-only action implemented merely because a generic click tool can reach it.

| Family | Required commands and argument/result contract |
|---|---|
| System | `system.state`, `system.manifest`, `system.health`, `system.source`; bounded redacted state/version/source bytes via a handle. |
| Rooms | `rooms.create({mode?})`, `rooms.join({invitationRef})`, `rooms.leave({room})`, `rooms.recent`, `rooms.forget`, `rooms.share`; preserve owner anchor; secrets released only through an explicit share/export scope. |
| Catalog | `files.list({room,parent?,cursor?,limit?,fields?})`, `files.stat({room,entryId? ,cid?})`, `files.search`, `folders.create`, `entries.rename`, `entries.move`, `entries.delete`, `entries.restore`; mutations require write permission and expected revision when supplied. |
| Sources | `sources.register({room,sourceRef,name,parent?,durability})`, `sources.relink({room,cid,sourceRef})`, `sources.verify`, `sources.remove`; verify actual bytes, preserve disk file, report source durability. |
| Transfers | `files.upload`, `files.download({room,cid,destinationRef?,durability?})`, `transfers.list/get/pause/resume/cancel`; return job IDs and verified progress, never fake download completion from picker or toast. |
| File protection | `files.lock`, `files.unlock`, `files.lockStatus`; password/key references are imported under authorization, not logged or returned in ordinary state. |
| Seeding | `seeding.get/set({room,mode:off|selected|all,cids?})`; existing contribution semantics and missing-source cues remain accurate. |
| Media | `media.open/play/pause/seek/rate/close/state`; close saves the bookmark and pauses demand as the current UI does; headless decoding support is explicitly advertised. |
| Live capture | `live.start/stop/list/watch/latency`; camera, microphone, screen and capture-source selection report `USER_INTERACTION_REQUIRED` where the browser/OS requires it. Authorized native sources can run unattended. |
| Room retention | `retention.request/status/release`; requested target, achieved verified copies, consent, deadlines and independent source status are distinct. |
| Global storage | `global.index/configure/pin/retrieve/release/inventory`; keep opaque provider boundaries and confirm private catalog durability. |
| IPFS | `ipfs.pin/retrieve/release/status`; retain independent content-root verification and opt-in storage. |
| Local storage | `storage.inspect/clear`; scope clearing to authorized items; preserve identity, room metadata and disk sources unless those separate destructive scopes are explicitly requested. |
| Security | `security.identity/protect/grant/revoke/policy`; reuse owner-signed policy logic, no invented read isolation for existing room-secret readers. |
| Privacy/settings | `privacy.get/set`, `settings.get/set`; distinguish local theme/privacy/preferences from replicated room changes. |
| Interface/help | `ui.navigate`, `ui.select`, `ui.dialog`, `ui.previewLayout`, `help.privacy/disclaimer`; browser-only presentation actions return `UNSUPPORTED` in a non-rendering runtime without mutating state. |

Each descriptor must define a closed input schema, output schema, effects, environment,
permissions and durability. Define concrete schemas for subcommands rather than accepting
an unvalidated arbitrary method bag. Input/output references use opaque handles, with
explicit byte lengths, MIME type and verification status. A source registered by an agent
must not require clicking a hidden file picker. UI-native consent prompts are surfaced
as structured pending interaction and resumed only with an authorized response.

## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-01-A01

Requirements: `WO-01-R01`, `WO-01-R02`, `WO-01-R11`.

**Exercise:** Enumerate every reachable UI action and its descriptor; invoke from a fresh page without a selected row.

**Pass condition:** Every business action has a semantic handler and equivalent persisted/peer effects; all presentation-only exceptions are explicitly classified.

### WO-01-A02

Requirements: `WO-01-R03`, `WO-01-R07`.

**Exercise:** Use an ungranted writer in a protected room; forge another principal/room handle; submit a cyclic move and unknown property.

**Pass condition:** Structured rejection occurs before any persisted revision, file write or relay publication; a permitted rename preserves CID.

### WO-01-A03

Requirements: `WO-01-R04`, `WO-01-R10`.

**Exercise:** Join current plus three other rooms, leave one, restart one child, request a fifth context, then disconnect all carriers.

**Pass condition:** Handles remain correctly scoped; room limit is bounded/configurable; cleanup releases child resources; local commands remain usable with honest readiness.

### WO-01-A04

Requirements: `WO-01-R05`, `WO-01-R06`, `WO-01-R09`.

**Exercise:** Upload 650000 bytes through API; kill after a committed checkpoint; resume and download through a second peer; retry the same operation.

**Pass condition:** Both hashes match independent expected values, one catalog publication exists, and success is emitted only after durable verification.

### WO-01-A05

Requirements: `WO-01-R06`, `WO-01-R11`.

**Exercise:** Pause a real transfer, close a media preview at a known position, resume, and run forced relay playback with a dropped decoder-front chunk.

**Pass condition:** Demand pauses/resumes, bookmark is retained, dropped frontier recovers, and adequate-bandwidth SAFE stays above its measured lower band after kickoff.

### WO-01-A06

Requirements: `WO-01-R07`, `WO-01-R09`.

**Exercise:** Inject quota/transaction abort during signed publication and cache clearing; retry.

**Pass condition:** No false receipt, source advertisement or orphan live job occurs; unrelated room/disk data is untouched.

### WO-01-A07

Requirements: `WO-01-R08`, `WO-01-R11`.

**Exercise:** Deny browser capture and filesystem permission, then provide an explicitly authorized fixture source.

**Pass condition:** Required interaction is machine-readable and resumable; no fake capture stream or silent consent bypass is used.

### WO-01-A08

Requirements: `WO-01-R01`, `WO-01-R10`, `WO-01-R12`.

**Exercise:** Run every documented example and 1000 command/read cycles plus 100 room-context teardowns in Chrome and Firefox.

**Pass condition:** Parity report has zero uncovered actions; examples return schema-valid results and retained listeners/jobs/contexts remain bounded.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Comment why UI toasts and resolved old callbacks cannot serve as command acknowledgments.
- Document the coordinator/child trust handshake, owned-frame lifetime and four-room default.
- For each parity handler, tag the requirement and identify its signed or local commit boundary.
- Explain the difference between ephemeral File availability, persistent sources and verified retained bytes.

## Implementation handoff and traceability

Create `tests/wo-01-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-01/validation.md` plus redacted machine-readable evidence. At the top of
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
