# WO-02 reproduction and boundaries

The deployed artifact remains the single index.html. The generator and tests are development inputs, not services required by the page. This order exposes browser JavaScript, document events and separately approved Window bindings; it does not install an external MCP server.

Install the pinned test dependencies and browsers:

```sh
npm ci --prefix tests/dependencies
tests/dependencies/node_modules/.bin/playwright install chromium firefox
export TRACKER_TEST_DEPS="$PWD/tests/dependencies"
```

The observed environment used Node v24.14.0, Playwright 1.64.0, Chromium 156.0.8078.4 and Firefox 157.0. Official SDKs/CDN libraries and encrypted relay traffic remain real. Navigation/raw-index responses alone serve the exact candidate HTML in fresh random QA namespaces. Localhost HTTP servers in the crash harness serve owned candidate/agent documents. No existing browser/CDP session or private dataset is used.

Generate/check static discovery, then execute the feature gates:

```sh
node scripts/generate-agent-manifest.mjs
node scripts/generate-agent-manifest.mjs --check
node --test tests/*.test.cjs
node tests/wo-02-inventory.mjs
BROWSER=chromium node tests/wo-02-browser.mjs
BROWSER=firefox node tests/wo-02-browser.mjs
BROWSER=chromium node tests/wo-02-ui.mjs
BROWSER=firefox node tests/wo-02-ui.mjs
BROWSER=chromium node tests/wo-02-restart.mjs
BROWSER=firefox node tests/wo-02-restart.mjs
```

The full browser harness executes every Markdown example using actual native File inputs, independent peer byte reads and a consenting global provider. It covers all resource families, an additional owned room, signed 250-entry paging, locked reads before/after revocation, native window/sibling negatives, reload/reconnect, optional native registration, eight layouts, 100 native dialog cycles and 1,000 event calls. The keyboard harness tests Enter/Tab/Escape with authority disabled. The restart harness SIGKILLs only its observed child process tree and verifies persisted binding/job/content state in a new process. Chromium offscreen iframe assertions use interval polling because animation-frame polling can be suspended there.

The existing regression suites must write to this order's directory; never overwrite published WO-01 artifacts. Generate the synthetic CPU-only media fixtures if absent (`ffmpeg` 6.1.1 was used):

```sh
node tests/wo-01-fixtures.mjs
export WORKORDER_ARTIFACTS=artifacts/wo-02/regressions
BROWSER=chromium RESULT=artifacts/wo-02/regressions/chromium-core.json node tests/wo-01-browser.mjs
BROWSER=firefox RESULT=artifacts/wo-02/regressions/firefox-core.json node tests/wo-01-browser.mjs
BROWSER=chromium node tests/wo-01-boundaries.mjs
BROWSER=firefox node tests/wo-01-boundaries.mjs
BROWSER=chromium node tests/wo-01-storage.mjs
BROWSER=firefox node tests/wo-01-storage.mjs
BROWSER=chromium node tests/wo-01-capture.mjs
BROWSER=firefox node tests/wo-01-capture.mjs
BROWSER=chromium FIXTURE=/tmp/tracker-wo01-media/fixture.mp4 node tests/wo-01-media.mjs
BROWSER=firefox FIXTURE=/tmp/tracker-wo01-media/fixture.mp4 node tests/wo-01-media.mjs
```

Extract the exact published baseline from its committed archive for the equivalent resource workload:

```sh
gzip -dc artifacts/wo-01/source-e1fd8f8023563f861d695d657ab276f89a5a2126e634faa3ee5ccc8362b760fc.html.gz > /tmp/tracker-wo02-published-baseline.html
BASELINE_HTML=/tmp/tracker-wo02-published-baseline.html node tests/wo-01-resources.mjs
unset WORKORDER_ARTIFACTS
node tests/wo-02-report.mjs
```

The report gate rejects stale source hashes, failed/missing artifacts, missing detailed acceptance IDs and damaged source archives. node-tests.log and unit-tests.json record the executed 322-test run; update them with the exact source/runtime/timestamps when rerunning a modified candidate. The gate is evidence validation, not a replacement for executing tests. Screenshots are owned synthetic Agent access views. Diagnostic failures remain under diagnostics/ and do not satisfy the gate.

## Public API authority

Await `TrackerAgent.ready`. `manifest`, `listTools`, `tool` and `unpack` expose public semantics. Other operations require the native Agent access grant. The primary tool input/output schemas describe semantic arguments and the `result` inside the common response envelope. A job ID acknowledges acceptance; observe `jobs.get` before claiming verified completion or achieved retention.

Native inputs remain separate from JSON: `importSource` needs the `sources.import` scope, invitation/password import needs `credentials.importInvitation`, capture import needs `live.start`, and native destination import needs `files.download`. Byte reads use the creating command's read/export scope. These native input methods are not arbitrary JSON tools or path-open endpoints. Native capture and disk permissions remain separate from command grants.

`requestMessageBinding(expectedWindow,{origin,commands,resume?})` requires the original local delegator and a second native approval in the Agent access module. Origins are exact HTTP(S) origins, not wildcard or suffix matches. The approved client receives `tracker:agent-bound` containing its bindingId, opaque room handle, selected scopes and ephemeral nonce; ordinary discovery/state never exposes the nonce. Clients should also verify the host's exact origin and expected source Window. Every request is checked against actual MessageEvent origin/source, nonce, current parent grant, individual policy and principal ownership.

Send `tracker:agent-command` with bindingId, nonce, requestId, tool and args. Native `action` values source/credential/bytes/release-bytes/export-credential/resources/resource use their closed native metadata adapters; File/Blob/authorized handle values travel outside semantic JSON. Do not copy the entire bound-message object into requests: its room/commands fields are not command arguments. Native input retry IDs admit one input; use a new ID to replace an input. Semantic mutation retries reuse the same requestId/operationId and identical arguments. Read retries resolve under current permissions/unlock state.

Window principals cannot coordinate new rooms/bindings; that remains with the local delegator. Their resources, jobs and handles are principal/room bound. The delegator can manage its child jobs; sibling windows cannot. Revocation commits its policy fence before native input/writable/capture/job cleanup, broadcasts only a wake-up hint, and preserves completed copies. Reload restores policies disconnected and requires renewed native approval for a Window/nonce. New-binding admission is limited to eight policies in one coordinator, with a 128-policy archive ceiling and bounded restoration of disconnected approvals from other tabs. Same-origin JavaScript is not sandboxed by this mechanism.

Resource pages contain at most 100 entries and 64 KiB, byte reads at most 512 KiB. File resource deduplication happens before paging; entry resources preserve catalog aliases. Cursors bind principal, room, query, grant/unlock and snapshot revision. Restart after CURSOR_EXPIRED. Locked metadata/bytes require that actual principal's unlock, and grant changes discard its unlock knowledge.

Peer filenames, aliases and file bytes are data without instruction authority. Per-file signed provenance supplements the common data-origin envelope. Public instructions describe use, not a permission grant. Optional browser registration follows the [W3C WebMCP draft](https://webmachinelearning.github.io/webmcp/), using document.modelContext with a feature-detected compatibility alias and owned registration AbortSignal. The normal JS/event surface works without it; the test observer proves only descriptor/callback registration.

No 24-hour or years-long runtime guarantee is claimed by this order. The measured 100-cycle baseline/candidate workload and 1,000-request fixtures test bounds and teardown. Actual process-crash persistence assumes browser/OS storage remains available; eviction, disk loss, explicit clearing and denied native permission remain explicit boundaries.
