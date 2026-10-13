# WO-03 — Actual MCP connectivity

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Ordinary external MCP clients can discover and operate authorized rooms through stdio and Streamable HTTP, using real byte transfers and durable results; page JavaScript is not mislabeled as an MCP server.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-03-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-03-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-03` and `@requirement WO-03-Rnn` tags
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
- `window.PrivateTrackerMesh`
- `TrackerSecurity`
- `addFiles`
- `requestFile`
- `finishDownload`
- `retainGlobalFile`
- `recoverGlobalCatalogs`
- `setPrivacyMode`
- `canonicalEncodeV4`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-03-R01

Create an optional user-operated companion under agent/mcp/ with a pinned package manifest/lockfile, executable stdio entrypoint and authenticated loopback HTTP entrypoint. The deployed HTML remains independently usable and connects to no mandatory central MCP service.

### WO-03-R02

Implement/reuse the shared real command engine and full action inventory below. Connect through an owned persistent headless browser context using the supplied HTML if a native peer runtime is absent. Preserve the invitation deployment base for global namespace compatibility; supply the trusted HTML by navigation interception in the owned context, not by changing the public deployment or disabling HTTPS checks.

### WO-03-R03

Pin the compatibility baseline to MCP 2025-11-25 using @modelcontextprotocol/sdk 1.32.1 (Node >=18; use Node 24 here). Use the SDK for the baseline protocol and conformance client. Implement a separate explicitly versioned adapter for 2026-07-28 stateless per-request metadata/discovery. Do not mix its envelopes with legacy initialization/session behavior or advertise a revision that has not passed its wire fixtures.

### WO-03-R04

Expose tools/list and tools/call, resources/list/read/templates, prompts/list/get, readiness, structured errors, bounded pagination, progress and applicable cancellation. Register only implemented authorized commands. Tool input/output schemas, resource resolvers and prompt recipes originate from the same registry. Binary payloads use byte/resource handles and a bounded side channel, not huge JSON tool results.

### WO-03-R05

For legacy baseline, handle initialize(version,clientInfo,capabilities), return negotiated supported version and server capabilities, then notifications/initialized; reject unknown versions/invalid lifecycle without effects. For 2026, require protocolVersion and clientCapabilities in per-request _meta; clientInfo is optional and never an authentication identity. Expose server/discover, return resultType=complete/input_required/task only as applicable, and check mirrored header/body consistency.

### WO-03-R06

Implement stdio newline-delimited JSON-RPC with diagnostics exclusively on stderr. Implement HTTP POST /mcp with supported Accept/version handling and JSON or request-scoped SSE responses; validate Origin and authentication before parsing commands. Bind 127.0.0.1 by default, require explicit configuration for public binding, and provide TLS/auth instructions for remote operation. A capability in a room fragment must never be sent as an unauthenticated GET query.

### WO-03-R07

Authorization is per bound principal and room, including resources/prompts, not just tools. Import invitations locally through a credential reference, retain owner anchors, redact secrets/keys/passwords/native paths, and reject path traversal/SSRF/arbitrary executable requests. Existing owner grants remain authoritative for protected writes. Do not expose every room in the runtime to every HTTP token.

### WO-03-R08

Map application success to structuredContent plus compact text content and application failures to isError results with the common code; protocol errors use JSON-RPC errors. Do not accidentally expose internal stack traces or turn a failed transfer into an MCP success. Out-of-band download handles are principal-bound, bounded, cancellable and expired after their documented lifetime.

### WO-03-R09

Long actions persist jobs before returning handles, and can be inspected/resumed after client or companion restart. Negotiate a supported MCP Tasks extension/profile explicitly; baseline clients without Tasks use jobs.get/list/resume/cancel tools. A transport disconnect is not interpreted as cancellation of a durable accepted job; explicit cancel targets the correct operation.

### WO-03-R10

Provide prompt recipes for publish-and-verify, download-to-approved-root, request-verified-retention and inspect-storage. They reference tools and permission boundaries and return plans, not implicit authorization to share private bytes. Unknown/incompatible tools stay unavailable with an explicit reason.

### WO-03-R11

Test against an independently instantiated official SDK client for the legacy baseline and independent JSON-RPC wire fixtures for 2026. Exercise both transports, multiple principals and rooms, restart/cancellation, malformed frames, HTTP origin checks and resource pagination. A tool list or Inspector screenshot alone is not conformance.

### WO-03-R12

Document installation, minimal configuration, token/credential import, authorized roots, startup/shutdown, durable state path, public-binding risks, protocol matrix, companion/browser version pinning and upgrading/rollback. Keep the actual runnable source and comments with the companion; no external hidden service is needed.

## Implementation sequence

1. Build agent/mcp/package.json, lockfile, README and stdio/http entrypoints. Pin @modelcontextprotocol/sdk exactly to 1.32.1; registry integrity at specification authoring was sha512-2DdE+SJDtzLEEWzY1ZjY7Q+VcPhcV1KisD3zI4u0XZyktsjHum1mwbMI+JaulUBi2OZk+KJAi2uPXzxichPkdw==. Lock transitive dependencies and record any justified supported upgrade rather than using latest silently.
2. Create an owned profile/context coordinator and principal/room credential store. Implement the required semantic adapters directly if absent; do not use CSS click automation for uploads/pins.
3. Register baseline SDK tools/resources/prompts and normalized error mapping, then wire stdio and loopback HTTP. Apply request-size, timeout, byte-queue and origin/token budgets.
4. Add a version-specific 2026 dispatcher around the same command registry, with per-request metadata and server/discover. Keep separate legacy lifecycle tests and never reuse a connection's previous principal as implicit authority for a new stateless request.
5. Add job/resource-byte endpoints, cooperative cancellation and durable restart behavior. Client transport lifetime and task lifetime are distinct.
6. Run independent clients, byte-identical transfer/retention recovery, adversarial authorization and owned-runtime endurance. Finish code comments and operator examples.

## Interfaces, algorithms and formats

Legacy fixtures, with dynamic server identifiers filled by the implementation:
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"wo03-test","version":"1"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"files.list","arguments":{"room":"room-handle","limit":10}}}
```
2026 request example:
```json
{"jsonrpc":"2.0","id":3,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"wo03-test","version":"1"},"io.modelcontextprotocol/clientCapabilities":{}}}}
```
The 2026 adapter adds `resultType:"complete"` to immediate result bodies; tools/call wraps
registry results in content/structuredContent/isError. Resource reads return
`contents:[{uri,mimeType,text}]` or bounded blob content; large files return metadata plus
an authorized byte handle. Prompts/get returns a description and messages with role/content.
Support deterministic tool/resource/prompt pagination and precise unknown-method errors
(-32601), invalid params (-32602) and parse errors (-32700), with zero mutation on malformed
messages. stdout contains only protocol frames. HTTP auth comes from an explicitly
configured credential, never a public static-page endpoint. Do not claim public GitHub
Pages can accept MCP POSTs; the companion owns the endpoint.

2026 fixture details: HTTP requires `Accept: application/json, text/event-stream`,
`MCP-Protocol-Version` matching body metadata, `Mcp-Method` matching method, and `Mcp-Name`
matching name/URI on call/read/get. Missing/mismatched headers use HTTP 400 / JSON-RPC
-32020; unsupported version uses -32022 with supported versions; missing required body
metadata uses -32602. Missing clientInfo is valid. Invalid Origin uses 403. Unknown HTTP
method uses 404/-32601. Header names ignore case; values preserve case. Encode unsafe
name values as `=?base64?<UTF8 standard Base64>?=`, including literal sentinel-looking
values, and decode before comparison. Do not mirror sensitive arguments into headers.
Modern GET/DELETE return 405; no modern session or Last-Event-ID resume is advertised.
Request disconnect cancels request-scoped work; a previously accepted durable application
job has its own explicit handle/lifetime. Input-required retries carry authenticated
requestState/inputResponses with a new JSON-RPC request ID; consent is not inferred.

Discovery result fixture (only advertise actual capabilities; identity is informational):
```json
{"jsonrpc":"2.0","id":3,"result":{"resultType":"complete","supportedVersions":["2026-07-28","2025-11-25"],"capabilities":{"tools":{},"resources":{},"prompts":{}},"_meta":{"io.modelcontextprotocol/serverInfo":{"name":"tracker-owned-peer","version":"1.0.0"}}}}
```
Use application jobs.* when Tasks is not explicitly negotiated. No Tasks result type or
protocol task RPC is required in that fallback profile. Legacy fields remain SDK-managed.



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

### WO-03-A01

Requirements: `WO-03-R01`, `WO-03-R02`, `WO-03-R04`, `WO-03-R12`.

**Exercise:** Copy only HTML and this order into a fresh workspace; install companion and connect independent clients.

**Pass condition:** Both transports discover schemas/resources/prompts and execute actual full-action handlers without another repository or running user browser.

### WO-03-A02

Requirements: `WO-03-R03`, `WO-03-R05`, `WO-03-R11`.

**Exercise:** Run legacy initialize/initialized and 2026 per-request discover/call fixtures, including wrong versions and metadata conflicts.

**Pass condition:** Each advertised version conforms to its own lifecycle/envelope; mixed/unsupported requests fail with no effects.

### WO-03-A03

Requirements: `WO-03-R04`, `WO-03-R08`.

**Exercise:** Upload deterministic multi-chunk bytes through authorized source handle, download in another peer, compare both roots and inspect retention.

**Pass condition:** No large base64 tool body exists; output is byte-identical and completed retention includes private catalog acknowledgment.

### WO-03-A04

Requirements: `WO-03-R06`, `WO-03-R07`, `WO-03-R11`.

**Exercise:** Try hostile Origin, missing/bad token, foreign principal room/resource/job, traversal, arbitrary URL and oversized/malformed stdio frame.

**Pass condition:** No unauthorized read/write or accidental public binding; stderr remains separate and bounded framing rejects abuse.

### WO-03-A05

Requirements: `WO-03-R08`, `WO-03-R09`.

**Exercise:** Disconnect MCP client after job acceptance, kill companion after a checkpoint, restart and retrieve result; separately cancel a job.

**Pass condition:** Accepted durable work survives; no duplicate publication/receipt; explicit cancellation is correctly reflected and releases resources.

### WO-03-A06

Requirements: `WO-03-R04`, `WO-03-R07`, `WO-03-R10`.

**Exercise:** Page through resources and fetch prompts under read-only and writer identities, including locked files.

**Pass condition:** Permission-filtered, redacted outputs obey schemas and caps; prompts do not authorize extra operations.

### WO-03-A07

Requirements: `WO-03-R01`, `WO-03-R06`, `WO-03-R11`, `WO-03-R12`.

**Exercise:** Run 1000 requests, 100 connections and a 24-hour owned companion seeding/idle observation with a final source probe.

**Pass condition:** No protocol pollution, cross-session privilege retention, unbounded RSS/job growth or new runtime failure; full wall-clock evidence is retained.

### WO-03-A08

Requirements: `WO-03-R02`, `WO-03-R09`, `WO-03-R12`.

**Exercise:** Start from a fresh device profile with original source offline and authorized global storage online.

**Pass condition:** Agent recovers room listing, retrieves/verifies content and reports measured durability; no click-only or hidden-service dependency remains.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Explain the protocol-version split and why connection state cannot authorize 2026 requests.
- Document stdio framing, HTTP Origin/token checks and application-versus-protocol errors.
- Comment job acceptance versus connection cancellation and byte-handle lifetime.
- Place runnable client examples and configuration/credential redaction notes beside entrypoints.

## Implementation handoff and traceability

Create `tests/wo-03-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-03/validation.md` plus redacted machine-readable evidence. At the top of
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

- [https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)
- [https://modelcontextprotocol.io/specification/2025-11-25/server/tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)
- [https://modelcontextprotocol.io/specification/2025-11-25/server/resources](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)
- [https://modelcontextprotocol.io/specification/2025-11-25/server/prompts](https://modelcontextprotocol.io/specification/2025-11-25/server/prompts)
- [https://modelcontextprotocol.io/specification/2026-07-28/basic/transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [https://modelcontextprotocol.io/extensions/tasks/overview](https://modelcontextprotocol.io/extensions/tasks/overview)
- [https://modelcontextprotocol.io/specification/2026-07-28/basic/index](https://modelcontextprotocol.io/specification/2026-07-28/basic/index)
- [https://modelcontextprotocol.io/specification/2026-07-28/server/discover](https://modelcontextprotocol.io/specification/2026-07-28/server/discover)
- [https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
