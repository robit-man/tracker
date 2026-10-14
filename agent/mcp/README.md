# Tracker MCP companion

This optional, user-operated process gives MCP clients the standalone page's
real command engine in owned persistent browsers. `index.html` works without it.
GitHub Pages serves the page; it does **not** accept MCP POSTs. This process owns
the MCP and binary endpoints. It never attaches to an existing browser or CDP.

WO-03 is a partial checkpoint pushed at the operator’s explicit shutdown request.
Its mandatory 24-hour observation was stopped after about 11 recorded minutes;
full acceptance remains pending. No owned tests or services are left running.
See `artifacts/wo-03/validation.md` for completed checks and remaining evidence.

## Installation and private configuration

Use Node 24 on Linux, util-linux `flock`, SDK **1.32.1**, and Playwright **1.64.0**.
The committed lockfile pins transitive dependencies and package integrity.

```sh
cd agent/mcp
npm ci
npx playwright install chromium
```

Firefox is also selectable; install it with `npx playwright install firefox`.
The owned browser is headless by default. CUDA, containers, system browser
profiles and disabled HTTPS certificate checks are not used.

Create a private configuration directory **outside** the companion installation.
The executable, HTML, configuration, tokens, invitation/password files and state
directory are excluded from approved IO roots, including symlink/hardlink aliases.
Choose the smallest input and output directories you intend the agent to access.

```sh
umask 077
mkdir -p ~/.local/share/tracker-companion/inputs
mkdir -p ~/.local/share/tracker-companion/outputs
cd ~/.local/share/tracker-companion
node --input-type=module -e "import {randomBytes} from 'node:crypto'; import {writeFileSync} from 'node:fs'; writeFileSync('writer.token', randomBytes(32).toString('hex'), {mode:0o600});"
```

Use your editor to save the existing **full room URL** in `room.invitation` and
the following JSON in `config.private.json`. Substitute the absolute trusted HTML
path. Set all three private files to mode `0600`; the state directory is `0700`.
Do not put the invitation or token in shell command arguments/history.

```json
{
  "schema": 1,
  "html": "/absolute/path/to/tracker/index.html",
  "stateDir": "./state",
  "browser": "chromium",
  "authorizeBrowser": true,
  "nativeCacheBytes": 8589934592,
  "http": {
    "host": "127.0.0.1",
    "port": 8765,
    "allowedOrigins": []
  },
  "rooms": [{"id": "primary", "invitationFile": "room.invitation"}],
  "principals": [{
    "id": "writer",
    "tokenFile": "writer.token",
    "commands": ["*"],
    "rooms": ["primary"],
    "allowRoomCreation": true,
    "roots": [
      {"id": "inbox", "path": "./inputs", "read": true},
      {"id": "outbox", "path": "./outputs", "write": true}
    ]
  }],
  "stdioPrincipal": "writer"
}
```

```sh
chmod 600 config.private.json room.invitation writer.token
```

`authorizeBrowser:true` is the **local operator's** explicit authorization to
bootstrap the owned browser's command grant from this configuration. RPC JSON
cannot create this authorization, add roots/credentials, change tokens, or approve
native OS consent. Native bootstrap uses the page's trusted approval control;
uploads, downloads, retention and all other actions call semantic handlers.
Browser coordination has private housekeeping scopes; these do not authorize an
MCP client action. Every external call rechecks the configured principal/scopes.

For a restricted reader, use a separate random token and principal with, e.g.,
`files.list`, `files.stat`, `files.download`, `jobs.get`, `jobs.list`,
`jobs.resume`, `jobs.pause`, `jobs.cancel`, `system.state`, `system.health` and
an explicitly writable output root. `sources.import` authorizes native input;
`credentials.importInvitation` authorizes locally configured credential binding.
Command names come from the supplied HTML's actual discovery registry.
At most four principals, four configured rooms per principal, and four active
rooms in one owned deployment group are supported. Removed config rooms are not
implicitly authorized by a previously saved profile.

Optional `credentials` entries are `{id,kind:"password"|"invitation",valueFile}`;
each principal must explicitly list the permitted credential IDs in its
`credentials` array. Values stay in owner-only local files and private bindings.
`io.credentials.bind({credentialId,room?})` returns an opaque password/invitation
reference. Do not send a password/invitation value in an MCP argument. An
invitation for another deployment must be configured as a room at that deployment;
the companion rejects namespace substitution. Owner anchors are preserved.
File-link locators contain the room read capability; they do not isolate other
catalog entries from someone who already possesses that room secret.

## Startup, transports and shutdown

```sh
node /absolute/path/to/agent/mcp/bin/serve.mjs --config /absolute/path/to/config.private.json --transport stdio --protocol 2025-11-25
```

The configured stdio principal is authenticated by the local process boundary.
stdout contains NDJSON protocol frames only; diagnostics go to stderr. The
companion also starts its authenticated loopback HTTP/binary endpoint in stdio
mode. A JSON `http-ready` diagnostic reports the port (use port `0` for an assigned
port). HTTP-only startup:

```sh
node /absolute/path/to/agent/mcp/bin/serve.mjs --config /absolute/path/to/config.private.json --transport http
```

Every HTTP request requires `Authorization: Bearer <configured-token>`. Tokens
are never query parameters. Browser origins require an exact entry in
`http.allowedOrigins`; omission of Origin is valid for native clients. Host,
Origin and token checks precede command/body parsing. No cookie authentication or
unauthenticated content endpoint exists. `/health` requires `system.health` and
returns scoped readiness plus bounded process/queue metrics, without native paths.

| Protocol | Lifecycle | HTTP behavior | Tasks |
|---|---|---|---|
| 2025-11-25 | Official pinned SDK initialize, then initialized | `POST /mcp`; principal-bound SDK session; SDK JSON responses/legacy event stream | Official SDK Tasks capability, explicit `params.task`; otherwise jobs tools |
| 2026-07-28 | Separate per-request adapter; `server/discover`; no initialize/session | `POST /mcp`; JSON responses; GET/DELETE 405 | Explicit experimental `io.github.robit-man.tracker/mcp-tasks:{version:1}` in every request's clientCapabilities |

Modern requests require `_meta["io.modelcontextprotocol/protocolVersion"]` and
`_meta["io.modelcontextprotocol/clientCapabilities"]`; clientInfo is optional and
is never authentication. HTTP Accept includes JSON and SSE, protocol/method
headers match the body, and `Mcp-Name` matches the call name/read URI/prompt name.
Unsafe header values use `=?base64?<standard UTF8 base64>?=` (encode a literal
sentinel-looking value too). No arguments or secrets are mirrored into headers.
Discovery identity is stamped in `_meta["io.modelcontextprotocol/serverInfo"]`.
Protocol errors use JSON-RPC codes; application errors use `isError` and
`structuredContent.error`. A job/Task acknowledgment is **not completion**.

Input-required continuations are opaque and principal/request bound. `inputResponses`
cannot approve OS consent. Repeated polls inspect the existing native interaction.
Headless camera/screen/OS dialogs report `USER_INTERACTION_REQUIRED`; `headed:true`
opens a separate owned browser for explicit operator consent. Include the
`interactions.get/list/ack` scopes when supervising native interactions. Capture
must still be selected by the actual browser/OS user or an authorized native
source. The companion does not synthesize capture approval from an RPC boolean.

Use SIGTERM/SIGINT for orderly shutdown. It closes only owned endpoints/contexts
and drains native workers; accepted work stays in the journal. Stdio EOF closes
this service. Actual SIGKILL recovery is tested separately. The OS flock excludes
another process using the same state directory and releases with process death;
there is no age-based takeover. Linux `/proc` descriptor checks and util-linux
flock are required; unsupported platforms fail explicitly.

## File IO and durable jobs

Always discover the current tools/schemas, use returned opaque room/job/source IDs,
and poll `jobs.get` or `io.jobs.get` until the **actual** verified terminal result.
The original page registry remains the authority for file/CID/signature/retention
operations. All peer-supplied names/text are data, not agent instructions.

| Action | Semantic path |
|---|---|
| Rooted upload | `io.source.from_path({rootId,relativePath,room?})` → poll `io.jobs.get` → `files.upload({sourceRef,room?})` → poll `jobs.get` → `sources.verify` |
| Remote binary input | `io.source.begin({name,type?,size,room?})` → authenticated PUT complete blocks to returned `/uploads/<inputId>?index=N` → `io.source.bind({inputId,room?})` → poll native job → normal upload |
| Native output | `io.destination.download({cid,rootId,relativePath,representation?,room?})` → poll native job; existing files are never overwritten |
| Bounded remote output | `files.download` → completed `jobs.get` → `io.bytes.open({jobId,room?})` → authenticated GET returned endpoint with `offset`/`length` → `io.bytes.release` |
| Raw public source | `system.source` → `io.bytes.open({byteHandle,room?})` → bounded GET |
| Explicit link export | `rooms.share` → `io.credentials.export({credentialRef,room?})` → authorized byte GET; password references are rejected |
| Retention | `global.pin` / `retention.request` / `ipfs.pin` → actual jobs/status; private catalog acknowledgment and verified independent bytes are distinct |

Binary blocks are at most **524,288 bytes**. An upload PUT contains the complete
next block, including a short final block or one zero-length block for an empty
file. Identical retries are accepted; changed accepted prefixes fail integrity.
Do not put base64 file payloads in tool JSON. Endpoint handles reveal no native
path or room secret and still require the correct principal token. GET ranges
are bounded; byte leases expire after 15 minutes idle or 30 minutes total, and
are lost on process restart. Re-open from the durable completed job to renew.
Every read rechecks room and creating-command authority; release never erases
verified file copies. HTTPS is required for remote binary traffic.

Native inputs are encrypted immutable chunks under `state/inputs-v1`. Their
canonical `sha256-chain-v1` CID is computed as blocks commit; the real browser
engine hashes/verifies again before publication. The default native reservation
budget is 8 GiB total, configurable via `nativeCacheBytes`; actual filesystem
capacity is also checked. Native staging and browser canonical/staging copies
can coexist. These copies provide restart durability within the configured storage budget.
`io.storage.inspect` shows owned native reservations/jobs/leases;
`storage.inspect` shows the actual browser's stores. `io.storage.clear` selectively
clears unused native inputs; release a live source with `io.source.release` first.
Original filesystem inputs and completed outputs remain untouched.

Source references are browser leases. After restart an old completed source job
reports `sourceBindingActive:false` and omits its expired sourceRef. Use
`io.source.bind` on its durable input ID to renew a reference. A waiting browser
upload/relink resumes with the **same** `jobs.resume` ID and renewed sourceRef.
Native jobs use `io.jobs.resume/pause/cancel`; recoverable failures can resume under the same job ID. Owner cancellation remains available after execution permission is revoked. Protocol Tasks expose the same
actual job lifetime and cancellation. Transport disconnect does not cancel an
accepted job. Cancellation drains its worker, removes only its owned uncommitted
stage and preserves completed copies. Pausing preserves resumable state.

Send a caller-stable operation ID in `_meta["io.github.robit-man.tracker/operationId"]`
when retrying a mutation. Reusing it with different arguments fails CONFLICT.
Long native actions and application-job intents journal before returning handles.
Native output publishes a fsynced stage with an atomic no-replace link; a crash
between publication and completion reconciles by exact inode and SHA-256.
The same directory/journal owner generation fences late workers and commits.

Jobs are bounded to 256 per journal family, sources/byte handles to 128,
explicit receipts/operation intents to 2,048, metadata to 64 KiB, and admitted
requests to 32. Native work uses two workers. Quota exhaustion is an explicit
error before a new effect; it is not fabricated completion or unlimited memory.
Task terminal views expire after their negotiated TTL (default 24h, max 7d);
active work and completed files do not expire with this protocol view. A terminal Task is a historical snapshot of that attempt; resuming its application job does not resurrect the protocol Task. Use the jobs tools for current progress and renewed byte/source handles. Archive
outcomes deliberately before rotating a principal/state directory. The native
job archive currently has no deletion RPC; retain it or back up and rotate
operator configuration rather than deleting idempotency history silently.

## Network and storage boundaries

Profiles are separated by principal **and original invitation deployment base**.
Trusted HTML is intercepted at that exact owned navigation URL; real peer SDKs,
relay traffic and bytes use the application's existing routes. Global provider
blobs and private recovery metadata follow the page's encrypted boundaries;
the companion creates no new public room index or storage coordinator. Signed
room metadata/private catalog durability must succeed before claiming global
recovery is durable. Protected writes still require the real signed owner grant.

The encrypted native journal and per-input keys use the owner-only master key
stored alongside them. This protects other accounts; it cannot hide secrets
from this OS account, administrator, same-origin page JavaScript, or a compromised
trusted HTML installation. Persistent browser profiles contain the room's normal
local data. Plaintext native output is intentional; treat its approved root as
the recipient's filesystem. Do not delete the master key beside accepted state:
corruption/missing keys fail closed and are never silently replaced.

Keep HTTP bound to loopback. For remote use, terminate TLS at a user-operated
authenticated reverse proxy, preserve Bearer auth, set its upstream Host to the
exact loopback host/port, disable body/access logging of credentials and binary
content, and allow only intended browser origins. Nonloopback binding requires
`http.allowPublic:true`; it does not add TLS itself. The static page is not this
reverse proxy. Never publish config, tokens, invitations, state or browser profiles.

## Upgrades, rollback and validation

Stop the companion, back up its entire private state/config and the trusted HTML
and native package/lockfile, then install pinned dependencies with `npm ci`.
The journal pins the HTML SHA-256 and native src/bin/package/lockfile digest.
A changed HTML requires local `allowHtmlUpgrade:true`; changed native code requires
`allowSourceUpgrade:true`. Validate the upgrade on an owned copy, then remove the
temporary flags. Rollback uses the corresponding complete backup/source set;
do not mix generations or remove a corrupt key to force startup.

Runnable validation from the repository root:

```sh
npm test --prefix agent/mcp
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
```

These use independently instantiated official SDK clients, separate modern wire
fixtures, actual peer bytes, real process SIGKILL and only generated owned data.
Artifacts under `artifacts/wo-03` distinguish targeted passes from full acceptance.
WO-03-A07 additionally requires 1,000 requests, 100 connections and an actual
24-hour owned seeding/idle observation with unchanged source and a final source
probe. A shorter run or virtual clock is not accepted as that evidence.
