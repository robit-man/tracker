# WO-17 — Encrypted delivery to offline recipients

Status: **Ready for implementation; this document is not an implementation or a passing test report.**

Required project inputs: this work order and `index.html`. Authoring baseline: `bef1b7da5eeaf338e1b87f30cee3c3dc7a2554d7`;
HTML SHA-256: `c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7`; authored 2026-10-13. A later supplied HTML may already contain
some interfaces; verify and reuse them rather than assuming this snapshot is still exact.

## Outcome

Deliver authenticated encrypted content to a recipient who is not currently online, using opaque global storage and private mailbox capabilities. Distinguish storage acceptance, recipient pickup and verified delivery, without exposing a room to providers.

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
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=chromium node tests/wo-17-browser.mjs
TRACKER_TEST_DEPS="$PWD/.test-deps" BROWSER=firefox node tests/wo-17-browser.mjs
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
needs a nearby explanatory comment. Use `@workorder WO-17` and `@requirement WO-17-Rnn` tags
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

- `globalProviderOperation`
- `globalIdentity`
- `publishGlobalCatalog`
- `recoverGlobalCatalogs`
- `uploadGlobalReplica`
- `retrieveGlobalFile`
- `signRecordV4`
- `verifyRecordV4`

## Implementation requirements

All requirements are mandatory unless an individual clause explicitly calls a capability optional.

### WO-17-R01

Introduce independent recipient mailbox identities and signed public recipient cards. Use separate encryption and signing keys; an Ed25519 signature authenticates a P-256 encryption-key descriptor with key ID, revision, validity and trusted fingerprint. Do not claim an unverified key directory identifies a human.

### WO-17-R02

Use distinct high-entropy mailbox read and write capabilities. A sender can append authorized encrypted deliveries without receiving mailbox read authority or unrelated message metadata. Global public indexes contain capacity only, never recipient address directories or private mailbox locators.

### WO-17-R03

Encrypt each delivery under a fresh 256-bit content key, wrapped to authenticated recipient P-256 via ephemeral ECDH, HKDF-SHA256 and AES-GCM with the domains below. Sign sender envelope/manifest and bind sender, recipient key, message ID, resource scope and ciphertext digest. Encryption alone does not prove sender authenticity.

### WO-17-R04

Keep content objects, private mailbox index and metadata opaque to providers. No room secret/hash, canonical root, filename, recipient private key or content key enters provider API/logs. Ciphertext sizes, opaque lookup IDs, pseudonyms and timing remain observable and must be described honestly.

### WO-17-R05

Persist accepted sender jobs and separate stages: staged, content_committed, mailbox_committed, picked_up, recipient_verified. A send is stored/queued only after object commit and recoverable encrypted mailbox entry acknowledgment; delivery requires authenticated recipient acknowledgment. Transport send/heartbeat is neither.

### WO-17-R06

Implement idempotent append/retry and bounded concurrent mailbox merging without lost deliveries. Persist operation IDs, deduplication receipts and signed/tombstoned entry revisions. Do not give senders access to other senders’ entries merely to implement merge.

### WO-17-R07

On recipient restart, recover mailbox with its authorized key/capabilities, fetch bounded pages, authenticate envelopes, reject replay/rollback and retrieve/decrypt/verify selected content. The original sender can be offline; required independent content scope must be contained in the encrypted delivery, not an unstated room dependency.

### WO-17-R08

Implement acknowledge, reject, archive and release policies with explicit owner authority. Expiration limits future cooperating storage/access; it cannot recall already learned plaintext. Sender cancellation after recipient pickup reports actual irreversible effects instead of claiming deletion from the recipient.

### WO-17-R09

Handle key rotation and stale recipient cards with signed revisions and authenticated update policy. Preserve old private decrypt keys only under explicit local policy; unknown/rotated keys yield recoverable status and do not silently redirect content to a substituted key.

### WO-17-R10

Expose mailbox.create/card/import/send/list/get/ack/release/status in UI/agents with scope/fingerprint review, safe invitation sharing, progress and clear durability/delivery labels. A recipient may grant a headless peer unattended pickup; do not bypass browser permission boundaries.

### WO-17-R11

Bound message/body sizes, per-sender append rate, queue/index pages, pending ciphertext bytes, retries and retention. Charge actual stored/wire bytes to authorized budgets; integrate mailbox records/staging into Browser storage and selective cleanup without deleting other identities.

### WO-17-R12

Validate offline sender/recipient cycles, process restart, concurrent senders, wrong-key and forgery attacks, provider blindness, source independence and locked content. Provide executable trust/key-rotation examples and code comments for every encryption, authority and delivery-state boundary.

## Implementation sequence

1. Implement recipient key/card persistence, signed fingerprint validation and capability import. Keep nonextractable private keys in protected browser/native profile; no automatic identity replacement on corrupt state.
2. Implement the versioned opaque mailbox provider extension specified below. Keep append authority separate from authenticated read/list authority; senders receive only their own operation receipts. Provider persistence is real and survives restart, rather than an in-memory rendezvous or an assumed external mailbox service.
3. Build fresh-key encrypted independent file delivery and signed entry, then durable content/mailbox commit saga. No room secret is required for a file-only delivery.
4. Add recipient paged pickup, validation, verified receipt, archive/release and rotation handling.
5. Wire commands/UI/storage accounting and test fully offline transitions through restarted actual providers.

## Interfaces, algorithms and formats

Recipient card body: `{schema:1,recipientId,signingPublicKey,encryptionPublicJwk,keyId,revision,notBefore,expiresAt,mailboxWriteInvitation}` signed under `robit-tracker-recipient-card-v1`. Confirm signing fingerprint out of band or by an already trusted key. Write invitation grants an opaque mailbox append capability plus quota, not read/list authority. It is shared explicitly with permitted senders, not published in capacity offers. Recipient retains its independent private read key/invitation encrypted locally and, when requested, in its private recoverable index.

Wrapping: fresh ephemeral P-256 ECDH; deriveBits 256 -> HKDF-SHA256 with random 32-byte salt and info UTF8(`tracker-mail-wrap-v1|${messageId}|${recipientId}|${keyId}`) -> AES-256-GCM wrap key. Wrap fresh content key using random 12-byte IV and AAD canonical `{messageId,recipientId,keyId,senderFingerprint}`. Encrypt content/manifest under distinct `tracker-mail-content-v1` / `tracker-mail-manifest-v1` AAD domains binding message and chunk coordinates, with fresh IVs and 128-bit tags. Signature covers envelope ciphertext digests and wrapping descriptor.

Entry state and receipt: `{messageId,operationId,revision,recipientKeyId,state,contentReceipts,mailboxReceipt,recipientReceipt,error}` encrypted privately. Recipient receipt is signed by its trusted signing key and binds message ID plus verified content identity; sender may know its own file identity but provider never receives that plaintext receipt. A recipient index recoverable only from the recipient’s own secret/read invitation is acceptable; losing that secret is not recoverable by public search.

Required provider extension `tracker-opaque-mailbox-v1` (capability advertised separately
from legacy storage; never interpret mailbox IDs as room hashes):
- `mailbox-create`: owner-signed reservation with random 32-byte mailboxId, independent
  Ed25519 readPublicKey, SHA256(random 32-byte appendToken), maximum entries/bytes and
  expiry. Store only opaque configuration and ciphertext entries in versioned provider
  metadata. Recipient read private key/token remain owner-side. Provider authorizes
  reservation against configured storage capacity; no hidden hosting service is assumed.
- `mailbox-append`: mailboxId, entryId (random 32 bytes), sender operationId, appendToken,
  sealedEntry bytes/hash and sender signature. Verify token hash in constant-time where
  supported, sender envelope signature and declared limits; atomically reserve quota and
  commit immutable entry plus idempotency receipt. Same ID/hash returns same receipt;
  same ID/different hash conflicts. Token is a dedicated append capability, not a decryption
  key. It travels only inside existing encrypted relay transport to the provider.
- `mailbox-challenge`: return a random single-use nonce with short expiry. `mailbox-list`,
  `mailbox-get`, `mailbox-ack` and `mailbox-release` require read-key signature over canonical
  `{domain:"tracker-mailbox-read-v1",mailboxId,method,argsDigest,nonce,expiresAt}`. Consume
  nonce atomically and cap outstanding challenges. List pages contain only encrypted
  entries, <=100 entries/64 KiB metadata. Append authority does not allow list/get.
- A sender may inspect only its own append receipt using its signing key. Recipient
  verified receipts are encrypted to the sender or delivered through an equally scoped
  receipt channel; provider-visible receipt data remains opaque.

A sealed entry includes encrypted independent file/capability metadata and committed object
locators. Provider validates framing/hash/signature/quota, never decrypts. At least one
committed mailbox index plus the configured committed object copies is required for queued
success; requested replication may require more. Multiple providers hold the same immutable
entry IDs; recipient merges by ID/hash and rejects conflicts. Recipient invitation contains
mailbox provider locators/read credential binding so restart recovery does not depend on a
public address directory. Provider restart restores mailbox entries, quotas and challenges
conservatively (unconsumed old challenges may expire, committed entries never disappear).
Unknown old providers return UNSUPPORTED and are not counted as mailbox storage. Account
this new storage category and test unauthorized list/get, duplicate append, lost replies,
provider restart and sealed-entry replay explicitly.


## Acceptance tests and expected evidence

Create executable tests for every case. The table maps acceptance cases to this order’s
requirements; the common validation/completion contract above applies to every case.
A case may need several unit, browser, protocol and crash tests. Record actual outcomes,
not merely that a test file exists.

### WO-17-A01

Requirements: `WO-17-R01`, `WO-17-R02`, `WO-17-R03`, `WO-17-R10`.

**Exercise:** Create signed recipient card, send from two principals with narrow write invitations and inspect their visible resources.

**Pass condition:** Fingerprints/scopes are explicit; senders cannot read each other or recipient mailbox and forged/substituted cards fail trust validation.

### WO-17-A02

Requirements: `WO-17-R04`, `WO-17-R05`, `WO-17-R07`.

**Exercise:** Send while recipient offline, kill sender/providers, restart providers and recipient using only its retained mailbox invitation/key.

**Pass condition:** Committed delivery recovers and verifies without source or room secret; storage versus pickup versus verified receipt remain distinct.

### WO-17-A03

Requirements: `WO-17-R03`, `WO-17-R06`, `WO-17-R07`.

**Exercise:** Duplicate/reorder appends and receipts, replay old versions and corrupt ciphertext/key bindings.

**Pass condition:** No duplicate logical message/lost concurrent append; authentication and rollback checks reject invalid records.

### WO-17-A04

Requirements: `WO-17-R05`, `WO-17-R06`, `WO-17-R08`.

**Exercise:** Kill each content/index/receipt phase, cancel after pickup and retry after restart.

**Pass condition:** Durable journal reconciles actual effects, no early delivery claim and cancellation does not promise remote plaintext recall.

### WO-17-A05

Requirements: `WO-17-R01`, `WO-17-R03`, `WO-17-R09`.

**Exercise:** Rotate recipient keys, use stale card, remove old decrypt key, introduce unsigned redirection and unknown sender.

**Pass condition:** Policy produces explicit recoverable statuses, rejects unauthenticated substitution and records trust limitations.

### WO-17-A06

Requirements: `WO-17-R02`, `WO-17-R04`, `WO-17-R11`.

**Exercise:** Capture provider/public offers, flood append limits and constrain storage/wire budgets.

**Pass condition:** No plaintext/key/room canary or private directory appears, abuse bounds hold and actual quota accounting is accurate.

### WO-17-A07

Requirements: `WO-17-R07`, `WO-17-R08`, `WO-17-R10`.

**Exercise:** Deliver locked file, acknowledge/reject/archive/release through UI and authorized headless principal.

**Pass condition:** Locked plaintext requires its explicit key, only appropriate owners mutate states and resulting receipts agree across surfaces.

### WO-17-A08

Requirements: `WO-17-R04`, `WO-17-R09`, `WO-17-R11`, `WO-17-R12`.

**Exercise:** Restart after selective mailbox clear and inspect theme/mobile UI, code comments and generated protocol examples.

**Pass condition:** Unrelated identities remain intact, missing credentials are explicit and runnable examples cover trust, rotation and delivery semantics.

## Feature-specific code comments

Add these explanatory comments alongside the implementation, in addition to the common
comment contract. Tag each relevant block with its requirement IDs.

- Explain append-versus-read key separation, immutable delivery entries, quotas and provider challenge verification.
- Document key descriptor trust, ECDH/HKDF domains, signature coverage and fresh-key/nonce rules.
- Comment durable state transitions and the difference between storage acknowledgment and recipient delivery.
- Describe key rotation, cancellation/expiry limits, privacy observations and cleanup ownership.

## Implementation handoff and traceability

Create `tests/wo-17-browser.mjs`, relevant unit/companion tests, and
`artifacts/wo-17/validation.md` plus redacted machine-readable evidence. At the top of
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
