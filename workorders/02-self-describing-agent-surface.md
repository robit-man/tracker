# WO-02 — A self-describing TrackerAgent surface

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

An agent with only the delivered page can discover supported actions/resources, learn their schemas and invoke real room operations without reverse engineering the DOM or visiting an external skill site.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-02-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-02-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-02` and `@requirement WO-02-Rnn` tags
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

- `window.PrivateTrackerMesh`
- `roomLocalReady`
- `parseTrackerFragment`
- `resourceEntry`
- `visibleName`
- `visibleSize`
- `unlockedMeta`
- `renderInterface`
- `initInterface`
- `setAppView`
- `openPolicyNotice`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-02-R01

Implement a versioned in-page TrackerAgent facade backed by the shared registry. Expose ready, manifest, listTools, tool(name), invoke, listResources, readResource, search, getState and unpack(format). Include a machine-readable embedded public discovery block and an agent-readable ?agent=1 view; preserve the exact room fragment.

### WO-02-R02

Complete the action inventory reproduced below using real handlers if no command engine exists. A discovery surface listing unsupported upload/pin actions, or routing everything through generic DOM manipulation, does not satisfy parity. Browser/OS permission-dependent operations declare that requirement and provide a structured continuation.

### WO-02-R03

Describe every tool with closed JSON Schema input/output, operation semantics, effects, required permissions, supported runtime, requested/achieved durability and cancellation behavior. Sort deterministically and paginate; tool results must conform to advertised schemas. Unsupported optional future operations are absent or explicitly non-invocable.

### WO-02-R04

Provide stable resource URIs `tracker://<roomHandle>/files/<cid>`, `/entries/<entryId>`, `/jobs/<jobId>`, `/storage/<itemHandle>` and `/help/<document>`. URIs must not include a secret, owner private key, password, native path, signed download credential or full invitation. Resource reads recheck principal authorization and locked-file state.

### WO-02-R05

Use a public static manifest for interface names and semantics only. Populate room-specific resource lists after authorized runtime initialization. A static HTTP scraper must not obtain private room metadata, browser state or keys from the discovery block.

### WO-02-R06

Implement bounded field projections, metadata search and continuation cursors. Default output is <=100 entries and <=64 KiB; broad room exports require explicit scope and a job/resource handle. Locked names and private metadata remain opaque until correctly unlocked by that principal.

### WO-02-R07

Implement a correlated event bridge: tracker:agent-command request with requestId, tool and args, tracker:agent-result response with the same requestId, and tracker:state change notification. A separately authorized postMessage/MessageChannel binding must check exact origin, expected source, a random binding nonce and bound principal; no wildcard target origin or arbitrary code execution.

### WO-02-R08

Define readiness snapshots with schema version, build ID, capabilities, permission summary, localReady/networkReady/recoveryReady, degraded carriers and actionable blocked reasons. Reject invalid requests with the common error envelope; do not return raw internal Maps, DOM outerHTML, room URLs or error stacks containing credentials.

### WO-02-R09

Provide inline Markdown instructions and working examples for upload/download/pin/relink/permission handling, room links and file-link access scope, pagination, cancellation and durable-job resumption. The examples and instructions must be generated from the same descriptors or tested against them, preventing schema/help drift.

### WO-02-R10

If browser-native WebMCP tool registration exists, register the supported descriptors through feature detection; keep the normal JS and event APIs fully functional without that experimental/browser-specific surface. Do not label the JS facade an actual external MCP server.

### WO-02-R11

Integrate an Agent access module into the existing navigation with concise copy, schemas, a redacted state viewer and a controlled command inspector. Tools receive explicit authorization bindings; inspecting help never grants permission. Preserve native dialog focus behavior, both themes and mobile wrapping.

### WO-02-R12

Protect machine-read content against prompt-instruction confusion: filenames, file contents, peer aliases and extracted material have data-origin labels, optional provenance and no authority to change agent policy. Ensure debug traces and state events use the same redaction as normal responses.

## Implementation sequence

1. Build/reconcile registry descriptors and the minimal real command adapters. Inventory actions before publishing a manifest.
2. Define resource resolvers by URI parser, never arbitrary eval, CSS selector or native file URL. Dispatch reads through principal/room checks.
3. Add deterministic manifest generation, static metadata and generated Markdown instruction text. Agent mode renders readable instructions, not a second unfinished control implementation.
4. Implement bounded state/resource projections and cursor revision binding. Permission or unlock changes invalidate affected cached results.
5. Add local CustomEvent binding and optional authorized MessageChannel/WebMCP adapters. The iframe/parent handshake is a control binding, not an authorization token guessed from a request.
6. Write discovery-to-invocation tests using only public APIs, then run the action parity matrix and native UI regression suite.

## Interfaces, algorithms and formats

Facade and bridge contract:
```js
await TrackerAgent.ready;
const manifest=TrackerAgent.manifest();
const tools=TrackerAgent.listTools({cursor:null,limit:25});
const resources=await TrackerAgent.listResources({room,kind:'file',limit:25});
const data=await TrackerAgent.readResource({uri:resources.items[0].uri,fields:['cid','size','verification']});
document.dispatchEvent(new CustomEvent('tracker:agent-command', {
  detail:{requestId:'req-1',tool:'files.list',args:{room,limit:10}}
}));
```
The event listener receives a context from the locally authorized binding, not from detail.
Manifest top-level fields: protocol=`tracker-agent-v1`, apiVersion=`1.0.0`, buildId,
capabilities, tools, resourceTemplates, errors, instructionFormats and limits. Descriptors
include a digest/revision to let a consumer detect changes. `unpack('markdown')` and
`unpack('json')` contain public semantics; neither includes private room access material.
A resource response includes URI, MIME, revision, data/byteHandle and verification status.
Pagination binds cursor to principal, room, query and snapshot revision. Invalid or expired
cursors return CURSOR_EXPIRED and a resynchronization instruction, not a silent new page.


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

### WO-02-A01

Requirements: `WO-02-R01`, `WO-02-R02`, `WO-02-R03`, `WO-02-R09`.

**Exercise:** Start from only HTML and this order; fetch the embedded manifest, open ?agent=1 and run every documented example.

**Pass condition:** Manifest/help cover real full-action handlers, preserve the fragment and pass schema validation with no external Scratch dependency.

### WO-02-A02

Requirements: `WO-02-R04`, `WO-02-R05`, `WO-02-R06`, `WO-02-R12`.

**Exercise:** Insert secret canaries, locked names, foreign-room items and prompt-like filenames; inspect HTTP HTML, manifest, help, resources, logs and errors.

**Pass condition:** Only authorized room data appears; no key/secret/path canary is disclosed and peer text remains data.

### WO-02-A03

Requirements: `WO-02-R03`, `WO-02-R06`, `WO-02-R08`.

**Exercise:** List 250 synthetic catalog entries through ordinary signed publication; paginate and project fields, then change permissions between pages.

**Pass condition:** Results stay within caps, order is deterministic, no duplicate/missing snapshot entries occur, and stale unauthorized cursors are rejected.

### WO-02-A04

Requirements: `WO-02-R02`, `WO-02-R03`, `WO-02-R08`.

**Exercise:** Upload, verify, download and retain a multi-chunk file through discovered descriptors in two independent peers.

**Pass condition:** Real bytes and verified durability match advertised results; errors and readiness are accurate when the source leaves.

### WO-02-A05

Requirements: `WO-02-R07`, `WO-02-R12`.

**Exercise:** Send duplicate, forged-origin, wrong-source, wrong-nonce, cross-room and arbitrary-script bridge requests.

**Pass condition:** Unauthorized requests cause zero effects; valid requests get one correlated schema-valid response and no eval path exists.

### WO-02-A06

Requirements: `WO-02-R08`, `WO-02-R10`.

**Exercise:** Run in a browser with no modelContext; inject a minimal registering test adapter only to observe registration.

**Pass condition:** JS/event discovery works unchanged without native registration; only real supported schemas are registered when available.

### WO-02-A07

Requirements: `WO-02-R11`.

**Exercise:** Use keyboard/screen reader semantics and 320/390/800/1440 px layouts in both themes.

**Pass condition:** Agent module and inspectors fit, focus returns properly, and opening documentation does not authorize mutations.

### WO-02-A08

Requirements: `WO-02-R01`, `WO-02-R06`, `WO-02-R07`, `WO-02-R11`.

**Exercise:** Perform 1000 discovery/event invocations and 100 open/close cycles, then detach listeners and leave rooms.

**Pass condition:** Listener/context/queue counts remain bounded and no missing-source request amplification is introduced.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Document the difference between static discovery, runtime private data and actual MCP transport.
- Explain handle and cursor binding, locked metadata redaction and unsupported-environment descriptors.
- Comment how bridge authorization is created and why event detail is untrusted.
- Keep usage examples adjacent to facade registration and tag descriptor-to-handler correspondence.

## Implementation handoff and traceability

Create `tests/wo-02-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-02/validation.md` plus redacted machine-readable evidence. At the top of
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
