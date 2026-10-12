# Tracker v4 execution report

## Current release, v105

AVI playback starts from converted sections while later input and conversion
remain unfinished. Chromium and Firefox local/withheld-tail browser checks pass;
the detailed AVI and NKN v105 evidence follows the historical sections below.
All 277 unit tests pass, all three inline scripts parse, and the actual pinned
NKN SDK fixture passes six lifecycle checks. The release build tag is the only
change from the unit-tested frozen core
`244f9d28a46cc7dcb151b8087bb8ca040389bdcb13779206b6f1fc37478d57df`.

## Final v105 default-network day test (pending)

The immutable `2026-10-12-progressive-avi-lifetime-v105` source has SHA-256
`c234e0d36a50ab6c6856f80f9b980f758c404a360b7ea5c60758b40c60811aec`.
Its repaired NKN SDK lifecycle and progressive AVI changes are separate from
the completed v104 hour observations below. A new detached six-context active
test launched at 2026-10-12 20:52:04 UTC, PID/PGID **3542383**, with steady
observation beginning **20:52:25.879 UTC**. The earliest full-day finish is
**2026-10-13 20:52:26 UTC / 13:52 PDT**; acceptance remains **PENDING**.

Chromium and Firefox each keep a fixed idle control and ETV seeder, with default
privacy off. Both startup first/middle/last production chunk reads match the
original file's Node SHA-256 values, both viewers are playing, and real source
served/receiver byte counters increase. Initial startup samples have no page
exceptions, renderer crashes or telemetry failures; this does not establish
day-long success. Fresh receiver contexts replace completed transfers to keep
requesting real bytes while source/idle pages remain open. Final acceptance
requires the complete 86,400-second interval, timestamp/sample-coverage review,
and repeated source presence/readability/hash proofs. Playback continuity is
reported separately from source/tab survival.

Exact HTML, harness snapshot/SHA, launch command, PID, streamed telemetry and
status are under `/tmp/tracker-long-haul/final-v105-active-24h/`; status/cleanup
instructions are in [long-haul.md](long-haul.md). Original baseline/v104 source
lifetime cohorts and the v104 active signaling failure control remain running
for comparison. Their observations are not relabeled as testing v105. The
reported original renderer crash remains unconfirmed, and finite testing does
not establish years of uninterrupted uptime.

## Long-lived tab robustness, v104

Executed 2026-10-12 against `2026-10-12-runtime-lifetime-v104`. This section validates frozen v104; later AVI functionality is documented
separately. The original tab crash was not
reproduced or conclusively attributed. Proven accumulation paths were repaired:
NATS heartbeat ownership, Waku duplicate dials/overlapping pings, Nostr event and
publication history, native route admission, media/model disposal, suspended
runtime restoration, transient-map maintenance and MSE quota retry gating.

| Run | Start UTC | Sustained interval | Source SHA-256 |
|---|---|---|---|
| Unmodified v103 | 2026-10-12T19:01:57.548Z | 3900.1s | `5f0acc2a75f119d52f187777cf2af63b40f305771732362a73019e4230863ff7` |
| Patched core | 2026-10-12T19:23:02.287Z | 3900.1s | `2dae4f22af00e4865ee052edf1a7af8e9e2c05f24c5380a6a04b7d1c54bfab50` |
| Native quota followup / controlled RTC | 2026-10-12T19:43:02.291Z | 1800 one-second samples | `778d7c3f976917a1604bde511487d638fa3f4d144d38593a9137b0e244f9200d` |
| Validated v104 / screen followup + pending day soak | 2026-10-12T19:54:14.605878+00:00 (day run) | Screen 30min; day test still PENDING | `5ddf1d2d565781d867faf0082a041bfddf052424e3e100378f1ce34737f15bd2` |

| Check | Result |
|---|---|
| Unmodified and patched core, six isolated contexts each | Both survive full 65-minute steady periods; no renderer crash, page exception or telemetry timeout |
| Native quota followup controlled RTC ETV | 1800 one-second samples; 0 post-kickoff dynamic lower-band violations; 0 stalled observations; final playhead 1803.3s |
| Native MSE quota retry comparison | Earlier 3900-sample RTC: at least 15,410 unique observed quota events; 1800-sample quota followup: at least 110. Event logs expose only the most recent six, so these are lower bounds, not exact totals |
| Exact v104 screen cadence analysis | 182 ten-second observations; 1800.118s playhead progress; 0 unchanged intervals; 3 dynamic lower-band crossings in 181 guarded observations; pending peak 25,578B |
| Source re-link / lifecycle | Chromium 7 and Firefox 5 relink checks pass; synthetic persisted suspend/restore passes both; actual BFCache navigation unavailable |
| Short synthetic camera/microphone functional check | PASS: known 440Hz tone decoded, peak 0.279; dropped-head repair without generation restart, LIVE/file-proven RTC data route and concurrent ETV playback; not endurance |
| Actual Waku SDK and browser discovery | Duplicate/unique dial and ping stress pass; two real filter/lightpush browser checks pass |
| Actual global storage relays | Nostr 650,056-byte ciphertext and MQTT 64KiB retrieval pass; MQTT 650k candidate retention and baseline retrieval fail |
| Public-relay media continuity | ETV SAFE repeatedly reaches zero in both hour runs. Earlier screen soak fails a stale-generation assertion after a legitimate budget restart; frontier starvation was separately found/fixed. Final screen followup PASS; full evidence below |
| 24-hour seeding acceptance | PENDING: baseline PID 2797889, candidate PID 2797891; startup source proofs pass, final proof occurs only after the full day |
| v104 default-network active-serving control | FAIL no-JS-exceptions objective: closed RTCPeerConnection setRemoteDescription page errors appeared within minutes. Lifetime remains observing; candidate PID 3170341, fixed source/idle pages; a repaired exact-source day run is required |
| Full unit suite | 262/262 pass |

| Run / Chromium scenario | JS heap min / max / final (MiB) | Active intervals min–max | Active WebSockets min–max |
|---|---|---|---|
| Baseline idle | 32.07 / 79.12 / 59.91 | 15–22 | 9–47 |
| Baseline seed | 35.78 / 86.25 / 55.3 | 17–22 | 21–47 |
| Baseline stream | 156.41 / 298.81 / 162.82 | 18–23 | 14–49 |
| Patched core idle | 28.26 / 92.9 / 39.06 | 15–20 | 10–53 |
| Patched core seed | 37.04 / 93.86 / 49.16 | 17–21 | 18–56 |
| Patched core stream | 35.92 / 352.21 / 186.26 | 21–25 | 17–46 |

The validated v104 HTML SHA is `5ddf1d2d565781d867faf0082a041bfddf052424e3e100378f1ce34737f15bd2`. The 65-minute patched-core run predates
the final MQTT close-hook/Waku preflight generation corrections, MSE quota/
cold-start/regrowth fixes, and live frontier latency estimator repair. Exact
diffs and separate quota RTC / v104 screen 30min followups are retained under
`/tmp/tracker-long-haul/final-v104/` and `/tmp/tracker-long-haul/final-live/`.
The earlier controlled RTC run and intermediate 30-minute quota followup are
preserved separately; they are not substituted for exact final-source evidence.

The older baseline `passed:true` flag means survival only; both hour traces
show public delivery stalls. The patched summary separates survival from playback
continuity.

Each hour run uses six isolated contexts: Chromium and Firefox idle rooms,
seeders and actual encrypted public-relay ETV viewers. The file is
2,736,439,118 bytes and is verified by the normal file workflow. No user browser
session is touched, no clock is accelerated, and Chromium uses `--disable-gpu`.
Native-resource weak references are pruned; NDJSON streams to disk; in-memory
telemetry rings and host-family tables are capped. The reusable harness is
[`long-haul-browser.mjs`](long-haul-browser.mjs), documented in
[`long-haul.md`](long-haul.md).

Healthy-link RTC checks use actual local WebRTC and controlled bandwidth/drop
injection, rather than public carriers. SAFE above the advisory high band is
intentional while native capacity remains; validation checks its dynamic lower
band, continuous playback and physical byte/queue bounds. Quota event counts
are observed unique lower bounds because each trace exposes only six recent
events. Browser RSS includes all three contexts per engine and is not JS heap.
Natural-GC peaks fell during the run; no percentage memory improvement is claimed.
The overlapping runs share this host and public brokers and do not measure
physical-device CGNAT behavior or establish years of uptime.

The existing `live-media-browser.mjs` check failed its pre-overhaul icon/tooltip
assertion before capture; that stale UI assertion is a harness limitation, not a
passing live-stream check. The original real screen relay soak failed its stale-generation assertion after
a legitimate budget restart and also exposed actual frontier starvation. The
new screen followup exercises the repaired estimator and compares the generation
active immediately before its short outage; its result is reported separately. Actual navigation could not enter BFCache in
either engine; synthetic persisted restore and real reload/source recovery pass.
Intermediate browser candidates were deliberately stopped when fixes landed and
are archived, not counted as completed soaks. Raw evidence, source snapshots and
summaries are under `/tmp/tracker-long-haul/`.

The user's within-a-day seeding failure requires a full day of observation. The
detached baseline/candidate runs launched 2026-10-12T19:54:14.605878+00:00; their
steady periods start 2026-10-12T19:54:29.716Z /
2026-10-12T19:54:30.152Z. They remain **PENDING**, not PASS.
PIDs 2797889 / 2797891 have independent sessions and
logs under `baseline-24h` / `candidate-24h`. Each browser has an idle control and
an ETV seeder, privacy off; seeders invoke the production incoming-demand wake
once to start deferred NKN/torrent adapters. NKN availability is distinct from
lifetime. Startup first/middle/last canonical chunk reads match original Node
disk SHA-256; final acceptance repeats these reads and requires source presence,
readability and seeding after the entire 86,400-second period. Commands and
run-specific stop/status instructions are in `long-haul.md` and each `launch.json`.
The first brief day attempts were deliberately restarted to add these proofs and
are archived as `*-24h-initial`; they do not satisfy day-long acceptance.

A separate active-serving candidate run launched 2026-10-12T20:22:59.264621+00:00 (PID
3170341) using the same frozen v104 source, default privacy off and ETV.
Idle/seeder contexts stay fixed; completed receivers are replaced with fresh
contexts so later legs request real bytes rather than replay cached data. The
run records source served bytes and receiver leg bytes, and repeats disk-source
proofs at completion. It exposed repeated closed-RTCPeerConnection signaling
page exceptions within minutes and **fails** the no-JavaScript-exceptions
objective. Lifetime observation remains running; a repaired exact-source
followup is required. This failure is separate from the privacy-on core hour.
The eight-second fixture passed two all-chunks receiver legs in each engine.
Its EOF-only control separately fails: complete bytes stop just short of duration
without native `ended`, so this test does not certify MSE end-of-stream behavior.
The all-chunks replacement avoids mistaking planned viewer completion for a crash.

Screen telemetry independently shows 182 observations,
1800.118s progress across a nominal
1810s ten-second cadence, no unchanged
intervals and one generation. There are 3 dynamic lower-band
crossings around 200–214s, before the explicit end outage; never-below-band
behavior is therefore not established for public live delivery. The source
journal peaks at 509,531B, viewer pending
bytes at 25,578B. Cadence intervals are
nominal because those STATE rows have no independent wall timestamps. The
underlying screen harness's simple total-progress assertion is weak; these
separate sampled progress and queue checks provide the stronger evidence.

Concise performance artifacts are
under [`.aiwg/reports`](../.aiwg/reports), [`.aiwg/testing`](../.aiwg/testing) and
[`.aiwg/planning`](../.aiwg/planning).

## Relink verification progress, v103

Executed 2026-10-12 against `2026-10-12-source-progress-v103`.

- **213/213 unit tests pass**, including active per-file verification progress,
  completion with a pending peer announcement, and cleanup from an older attempt.
- The real 2.6 GB `ETV.mp4` verifies and relinks in Chromium and Firefox through
  their native background hash workers. Inline percentage, byte counts, and speed
  update during verification; progress stays within the mobile file card in both
  themes, then disappears once the source is linked and seeding resumes.
- Actual encrypted public-relay source recovery passes in both browsers, including
  wrong-hash rejection, renamed matching files, reload recovery, original uploader
  closure, and byte-identical third-peer retrieval. An initial Firefox run timed
  out waiting for its save event; a repeat passed without app changes.
- File-row expiry notices and their countdown refresh/actions are removed.
  The existing background cleanup and retained-copy protection checks still pass.
- Peer announcements run after local verification without holding its spinner.
  Progress renders are batched with the existing download-row refresh.

## Decentralized networks and source recovery, v101

Executed 2026-10-11–12 against `2026-10-12-decentralized-room-v101`.

- **195/195 unit tests pass**, including framed stream boundaries and limits,
  Waku's exclusion of media traffic, independent IPFS locator signatures,
  provider-address freshness, exact-provider route readiness, pin durability,
  identity startup ordering, source
  hash verification and seven-day orphan cleanup.
- Chromium and Firefox: all seven views at 320/390/640/800/1024/1440px fit without
  horizontal overflow. Breadcrumbs identify Workspace, Storage or Room; Files
  and Live media use the Transfers header structure and preserve the full room
  hash. Tooltip colors match dark/light tokens, opacity fades in, keyboard focus
  works and reduced motion disables the visible transition. Theme choice and
  the room-derived browser title survive reload.
- Chromium and WebKit: dark default and saved light preference; focus/double-tap
  scale stays 1; touch controls use 16px text; pinch/gesture guards work. Actual
  Chromium single-touch scrolling remains functional. These are browser engine
  and emulated viewport checks, not physical-device coverage.
- Actual encrypted relay source-link tests: Firefox checks wrong-hash rejection,
  renamed-copy verification, original publisher preservation, reload fallback
  pulses and byte-identical third-peer retrieval after source closure. Chromium
  also persists a real FileSystemFileHandle, restores it on reload, and restores
  access on tab focus without a picker after a simulated permission interruption.
  Changed metadata requires a complete hash; seed preferences remain unchanged.
- Actual public-network harness with the original app carriers and
  BroadcastChannel disabled: Waku discovery/catalog replication, libp2p
  WebRTC-upgraded byte-identical MP4 transfer and decoded playback, encrypted
  IPFS pin/retrieve through Bitswap, durable pin/peer identity after reload,
  original source closure, fresh-peer retrieval from the remaining provider,
  and pin release. All eight checks pass with no page errors.
- Actual existing relay/storage harness: all twelve checks pass, including
  retained copy verification/reload, original source closure, byte-identical
  third-peer retrieval, decoded playback, opt-out and locally retained uploads.
- Compressed-clock cleanup fixture: signed replicated deadlines, reload,
  wrong-hash rejection, final-day mobile rescue, protected retention and expiry
  tombstones pass. Production retains the exact seven-day TTL and final-day
  warning. Inline JavaScript parses and `git diff --check` passes.

Evidence is under `/tmp/tracker-v101/`. Network tests use a short real H.264/AAC
MP4, not the full ETV movie or physical carrier NAT. Public circuit relays have
byte quotas and only carry controls; bulk libp2p uses an unrestricted upgrade.
Privacy mode disables that direct upgrade while preserving the existing encrypted
byte relays. IPFS pins are browser-held copies served while that browser is open;
bootstrap peers are not an external pinning service. Saved file handles restore
automatically only when browser permissions allow; input-only uploads require
the blinking relink fallback unless a verified cached copy exists.

## Room layout cleanup, v100

Executed 2026-10-11 against `2026-10-11-room-layout-v100`.

- Chromium and Firefox: all seven views at 320/390/640/800/1024/1440px
  without horizontal overflow. Settings' full-width modules have the same 14px
  gap as its two-column group; the compact retention summary has a 15px gap
  below its fields, and the preferences card has 24px above it.
- Both browsers: no hero, motif or sidebar branding; search is first in the
  sidebar. The full room identifier matches an independently derived SHA-256
  hash. The browser title uses `Room | abcd...1234` from that hash, preserved
  across navigation and reload alongside the saved theme.
- Existing mobile file-card and QR sharing harnesses: PASS. Existing real-relay
  interface/storage harness: PASS, including verified retention, source closure,
  byte-identical retrieval by a third peer, decoded playback and local retention
  after reload. No browser errors were recorded.
- `node --test tests/*.test.cjs`: **174/174 PASS**. Inline JavaScript parses;
  `git diff --check` passes.

Layout measurements, screenshots and harness traces are under
`/tmp/tracker-ui-v100/`. These are emulated browser viewports, not physical-device
coverage. The changes affect presentation and the tab title, not media transport.

## Reference interface and free storage, v99

Executed 2026-10-11 against `2026-10-11-interface-system-v99`. The supplied
`/home/roko/Downloads/index(84).html` defines the new interface system.

Final candidate validation:

| Result | Coverage |
| --- | --- |
| PASS | `node --test tests/*.test.cjs`: **174/174**, no failures or skips. |
| PASS | `interface-storage-browser.mjs`, Chromium and Firefox: exact light/dark canvas tokens and saved theme; seven views without room fragment changes; actual file filters/search; four keyboard-accessible inspector tabs; wrapped metadata/actions at 320/360/390/640/1280/1440px; dialog Escape/focus return. |
| PASS | Same harness, both browsers: opt-in free provider discovery, authenticated placement carrying signed metadata, complete file-root verification, provider reload, original source closure, third peer byte-identical MP4 download and decoded playback, keyboard opt-out. A separate local upload is materialized in encrypted storage and downloaded byte-identically after its File object is lost on reload. |
| PASS | `avi-playback-browser.mjs`, Chromium and Firefox: MPEG-4/MP3 AVI, H.264/MP3 AVI and H.264/AAC MP4, real encrypted relays, decoded frames/time advancing, seek and saved-position resume; conversion close/resume; counterclockwise download glyph. |
| PASS | `live-stream-routes-browser.mjs`, Chromium capture to Firefox playback: screen, camera/microphone and microphone; privacy and LIVE enabled, encrypted relay byte path, missing-chunk repair without encoder restart, non-silent audio, screen recovery after a network outage. |
| PASS | `privacy-resume-browser.mjs`: actual toggle/reload, direct connections close, fresh relay bytes match, X stops queued work and playback, same-decoder resume, cold MP4 position restored. |
| PASS | `room-share-browser.mjs`: rendered/downloaded QR independently scanned, clipboard and offline generation, keyboard focus, 320px layout. |
| PASS | `mobile-cards-browser.mjs`, `v4-browser.mjs`, complete inline-script parsing and `git diff --check`. |

Detailed candidate traces and screenshots are under `/tmp/tracker-overhaul/`.
These are short real-media tests, not whole-movie or physical-carrier CGNAT tests.
Retention remains voluntary browser storage; persistence can be denied and peers
must stay online to serve. No payment service is connected or simulated.

## Earlier v4 validation

Executed on 2026-10-11 in this Linux workspace. Baseline is commit `5050998`,
build `2026-10-10-source-link-v95`, archived exactly at
`fixtures/tracker-v3.html`. Candidate build: `2026-10-11-crypto-v4-v96`.
Test tools were installed outside the repository at `/tmp/tracker-v4-test-deps`
(Playwright Chromium and MP4Box 2.4.1). No runtime dependency was added.

## Executed checks

| Result | Command / coverage |
| --- | --- |
| PASS | `node --test tests/*.test.cjs`: 116 regressions before implementation; **145/145** final tests, zero failures/skips. All eight preceding implementation checkpoints also had green unit suites. |
| PASS | `node tests/v4-browser.mjs`: canonical clipboard URL, same room hash/DB, exact local selection, room-only sharing, keyboard Escape, unavailable/malformed links, mobile screenshot, reload/multiple rooms, first-run concurrent tabs without Web Locks, sibling paths, manifest-only resource view, unsupported Ed25519 and corrupt-identity recovery. |
| PASS | `node tests/v4-interop-browser.mjs`: distinct clean profiles using real local WebRTC; delayed remote file link with folders; bidirectional v4 downloads; wrong/correct file passwords; v3→v4 and v4→v3 catalogs and binary transfers; v3 DB upgrade preserving legacy records and cached bytes; authenticated corrupt seeder rejected at final root; cached partial download survives reload and completes; protected anchored invite, owner grants/revocation, and unsigned v3 rejection. |
| PASS | `TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps TRACKER_HTML=index.html RESULT=/tmp/tracker-v4-final-public-source.json node tests/source-link-browser.mjs`: actual public relays with direct ICE disabled, three independent profiles; wrong local copy rejected, renamed verified copy linked, original publisher preserved, original uploader closed, third peer receives byte-identical 1,100,000-byte download, native file handle restores seeding on reload. |
| PASS | `TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps TRACKER_HTML=index.html DIRECT_HARNESS=1 HEADLESS=1 MODES=av,audio FIXTURE=/tmp/tracker-v4-media.mp4 RESULT=/tmp/tracker-v4-live.json node tests/live-stream-routes-browser.mjs`: actual Chromium capture/encoding/playback with synthetic camera/microphone input over real WebRTC file-stream routes. Both modes repair an injected missing chunk without encoder/session restart, preserve steady playback and file playback alongside live media; audio is non-silent. |
| PASS | `TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps TRACKER_HTML=index.html RESULT=/tmp/tracker-v4-mobile-cards.json node tests/mobile-cards-browser.mjs`: imported long/Unicode names, bounded actions and metadata at 320/360/390/640 pixels; compact desktop rows at 1280 pixels. |
| PASS | `npx --yes -p @google/design.md designmd lint DESIGN.md`: zero errors/warnings. `git diff --check`: clean. |
| REVIEWED TOOL FAILURE | Premium UI `audit_project.py . --mode strict`: 62 static findings, archived in `artifacts/ui-static-audit.json`. Its recognizer misses the existing JavaScript `$().onclick`/delegated action bindings and stylesheet textarea resize rule: 30 findings are in the untouched archived v3 fixture, 32 in the production file. Actual changed buttons, keyboard behavior and mobile bounds were browser-tested. This static audit is not reported as passing. |

Crypto tests cover canonical byte vectors, native nonextractable Ed25519 keys,
identity self-test, signed body/context tampering, actor collisions and unsigned
downgrades, concurrent replay races, replay capacity and rate limits, independently
signed snapshots, causal tombstones/forks, protected owner chains, revoked/expired
writers, X25519/P-256 directional sessions, payload/header MAC tampering, recipient
binding, out-of-order/multipath replay, forged relay annotations and simultaneous
tabs sharing one actor/key. Content tests execute both archived and upgraded
hash functions against known empty/plaintext roots and locked ciphertext dimensions.
The small reference vector now records its actual source text (`tracker`) alongside
the root rather than an unreproducible root without source bytes.

Browser summaries are committed under `tests/artifacts/`; public test room URLs
are removed from committed evidence. Detailed media traces and screenshots remain
in `/tmp/tracker-v*-*.json` and `/tmp/tracker-v*-*.png` in this workspace.

## Streaming comparison

Same host, Chromium, 547,374,290-byte / 720-second H.264 MP4, 512 KiB chunks,
real WebRTC and the existing scheduler. Each run samples 100 one-second ticks,
drops chunk 10 once, changes supply at tick 20 to 768 KiB/s, changes consumption
to 4× at tick 35, injects an outage at ticks 50–65, restores 8 MiB/s supply,
and seeks backward three seconds at tick 85.

Commands:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps TRACKER_HTML=tests/fixtures/tracker-v3.html \
  TICKS=100 RESULT=/tmp/tracker-v3-large-stream.json \
  node tests/streaming-browser.mjs /tmp/tracker-v4-large-media.mp4
TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps TICKS=100 \
  RESULT=/tmp/tracker-v4-final-stream.json \
  node tests/streaming-browser.mjs /tmp/tracker-v4-large-media.mp4
```

Both **PASS** dropped-head recovery, bandwidth/consumption changes, outage
recovery, buffered seeking and dynamic reserve/request-window assertions, with
zero runtime/media errors. An initial v4 run also passed.

| Observed metric | v3 | Final v4 |
| --- | ---: | ---: |
| First observed playback tick | 0 | 0 |
| First observed recovered head >10 | 2 | 1 |
| Playback time after 100 samples | 260.40 s | 260.47 s |
| Received data at final sample | 362,807,296 B | 353,894,400 B |
| Received chunks at final sample | 692 | 675 |
| Playback advance ticks 70–84 after restoration | 56.30 s | 56.46 s |
| Playback advance ticks 86–99 after seek | 52.28 s | 52.32 s |

Raw-derived summary is `artifacts/stream-comparison.json`. Adaptive prefetch makes
final received bytes a changing reserve, not a controlled throughput measurement.
These are single-run smoke comparisons, with other checks on the same host;
they are not statistically significant benchmarks or evidence of improvement.
Subsecond connection/catalog/first-frame latency, CPU, memory, exact packet overhead,
relay connection count and hashing time were **NOT MEASURED** in paired benchmarks.

An initial baseline run using the smaller 119 MB / 420-second fixture **FAILED**
the harness's late fragment-growth assertion because it finished receiving before
the outage/seek window. The larger fixture was selected to keep transfer active;
the baseline and both v4 stress runs then passed. Live display testing initially
could not start because Xvfb is unavailable; a headless-shell capture attempt also
failed device startup. The full Chromium headless camera/microphone rerun passed.
Early test harness assertion/serialization mistakes were fixed and rerun; they
are not counted as successful executions.

## Not run and known limits

- Firefox, Safari, physical mobile devices, multi-GiB hashing, private browsing,
  actual quota exhaustion, forced process crash during migration, and browser
  offline transitions: **NOT RUN**. Emulated narrow Chromium viewports are not
  physical-device coverage. Existing unit tests cover stale/denied file handles.
- Four-seeder streaming with primary disappearance and exhaustive live media
  through each individual NKN/Trystero/relay carrier: **NOT RUN**. Multi-provider
  scheduler regressions remain in the unit suite; real local WebRTC, public relay
  fallback, uploader disappearance and resumable downloads were exercised.
- Physical display capture: **NOT RUN successfully**, unavailable Xvfb environment.
- Independent per-chunk inclusion proofs/Merkle sidecars, room-secret rotation,
  delegated moderator authority and deployment CSP/SRI: **not implemented**;
  documented scope/security limits. Streaming remains provisional until final
  chain verification. Protected mode revokes new writes, not already shared bytes.
- Native Ed25519 is required for authenticated mode. Unsupported API mode retains
  legacy/local access without verified identity; signed-peer verification does
  not silently downgrade. Protected policy changes without Web Locks should use
  one owner tab; conflicting owner revision forks fail closed.
- A file link contains the room bearer secret and therefore grants room access.
  Open rooms intentionally accept unknown legacy peers as unverified. Their
  writes do not have asymmetric authorization guarantees.

The nine reviewable implementation commits preserve an emergency source rollback.
See `docs/migration-v3-v4.md` for its data compatibility and security consequences.

## Global storage v102 — 2026-10-12

- **210/210 unit tests pass**, including namespace/signature binding, effective
  relay-only privacy, quota reservations, weighted placement, private locator
  metadata ordering, shared-tab offers, recent-room isolation, global retention
  cleanup protection and the pinned Nostr subscription API.
- **9/9 global browser checks pass in Chromium and Firefox** using isolated
  contexts, unrelated rooms and actual public relay connections. Coverage includes
  collective shards, two encrypted replicas in different shards, provider reload,
  source closure plus a paused replica, byte-identical retrieval, shard reload,
  mobile fit, recent rooms, provider-tab takeover and mutual direct-route opt-in.
- **12/12 existing room-storage/interface checks pass**, including retained MP4
  download and decoded playback after the source leaves, reload and opt-out.
- Independent carrier fixtures disconnect the other global clients and local
  BroadcastChannel. **MQTT-only and Nostr-only each pass discovery, multipart
  storage and verified retrieval** of 650,000 bytes after source closure.
- A **32 MiB / 64-chunk NATS-only bulk test passes** storage and full-root,
  byte-identical retrieval after source closure. This is a bulk data test; it
  does not claim a multi-gigabyte or unattended storage endurance result.
- Inline scripts parse and `git diff --check` passes. Evidence is under
  `/tmp/tracker-v102/` on the test host.

Global capacity is live and self-reported. Browsers must remain open to serve;
quota, eviction and relay availability still apply. Public shard routes expose
capacity and pseudonyms, while room locators and file metadata stay private.

## NKN connection lifetime v105 — 2026-10-12

The privacy-off active ETV run exposed repeated unhandled closed-PC SDP errors.
Its original log recorded messages without stacks. A separate browser lifecycle
fixture, which closes only unconnected PCs after 750 ms, captured six errors
inside the actual pinned `nkn-sdk@1.3.6` SDP callback. This establishes the SDK race
in that fixture; the original natural errors have matching messages but no stack
that conclusively assigns their owner. A separate 180-second natural baseline
happened to produce no errors, so these short runs are not a statistical crash
rate comparison.

- The actual pinned SDK deterministic fixture fails without the adapter: two
  ignored `setRemoteDescription` rejections escape after constructor PCs close.
  The guarded fixture passes all six checks: 10,000 constructor/retry connect
  attempts coalesce into owned SDK children, late node replies cannot revive a
  closed owner, failed SDP retires only its child through one SDK backoff, reused
  Peer wrappers preserve their replacement PC, retired callbacks stop, and
  dependency shape changes fail explicitly.
- The same browser closure fixture passes with the adapter: 100.066 seconds of
  active observation, zero JS exceptions/crashes/stalls, 101.05 seconds of media
  playback, and startup/final source chunk probes pass. The unguarded fixture
  produced six SDK exceptions during 90.05 seconds of active observation.
- A normal privacy-off Chromium ETV stream with direct routes allowed passes
  330.107 seconds of active observation: zero exceptions/crashes/stalls, playback
  advances from 1.03 to 331.16 seconds, 2,290 chunks / 1,200,275,278 bytes received,
  and startup/final source probes pass. Both source and viewer connect to NKN.
  This is active playback and lifecycle coverage, not a complete-file or
  multi-year endurance result.
- The independent actual NKN browser smoke passes connection, encrypted message
  delivery with SDK ACK, and explicit close/reconnect rejection. `onConnect`
  means any SDK child is ready; the fixture selects a common connected child
  index on both peers. The earlier first-any-child send timed out and its failed
  artifact is retained. Production sending is unchanged.
- All 14 existing network lifetime tests pass. The SDK remains pinned and uses
  the existing NKN WebRTC transport. An exploratory secure-WebSocket trial failed
  because actual predecessors reported WSS unsupported; it was not enabled.

Browser ETV snapshot SHA-256:
`2f736b89674a1ec6f170b7902ec245112c0a03933cf18141550f8323f58e4d27`.
Evidence, including baseline failures, stacks, immutable snapshots and JSON
reports, is under `/tmp/tracker-long-haul/rtc-closed-audit/`. The adapter's app
functions were frozen before these tests; later AVI/build-tag edits may change
the complete page hash without changing this adapter. Reproduction commands are
in `tests/README.md`.

## Progressive AVI playback v105 — 2026-10-12

AVI conversion now appends bounded FFmpeg/WASM sections into one native MSE
player. Later sections convert while playback advances. Source frame windows
drive timestamps; AAC priming edits use `delay_moov` so encoder padding does not
accumulate across sections. Seek starts conversion at the chosen source window.
X pauses playback and new work after the current bounded section settles.

All four real-browser cases passed eight checks each:

| Browser | Native local File | Remote prefix, tail withheld |
| --- | --- | --- |
| Chromium | PASS | PASS |
| Firefox | PASS | PASS |

Fixture: `/tmp/tracker-avi-test/progressive-300s.avi`, 31,954,858 bytes,
300.041667 seconds, 320×180 MPEG-4 video and MP3 audio. Remote peers used real
local WebRTC with authenticated encrypted chunks. The harness deliberately held
back every chunk after the first four and overlapped initial cache writes to
exercise the receive-prefix accounting race. Both receivers played beyond
12 seconds with only 4/61 chunks received and conversion unfinished. More than
twelve native section transitions retained one continuous buffered range,
advancing decoded frames and audible Web Audio output. Closing/Resume preserved
the same player; seeking to 120 seconds skipped intervening conversion; the final
section reached native EOF. Actual teardown removed temporary plaintext and
released its Web Lock. Page errors: zero in every case.

The pre-fix v104 snapshot failed the withheld-tail test: after 15 seconds it had
4/61 chunks but zero decoded frames and playback time zero. Unit coverage adds
15 regressions for slow-encoder planning, AAC/source clock separation, stale seek
output, paused conversion, bounded input, immutable OPFS chunks, startup orphan
cleanup/active-tab protection, temporary-storage failure ownership, failed-engine
relink recovery and overlapping first receive writes. Full unit suite: 277 passed.

Browser proof core SHA-256:
`244f9d28a46cc7dcb151b8087bb8ca040389bdcb13779206b6f1fc37478d57df`.
Tagged v105 snapshot SHA-256:
`c234e0d36a50ab6c6856f80f9b980f758c404a360b7ea5c60758b40c60811aec`.
These differ only in `BUILD_ID`; the final local Firefox rerun used the tagged
snapshot itself. JSON and log evidence is under `/tmp/tracker-long-haul/`:
`avi-v105-final-local-chromium`, `avi-v105-final-remote-chromium`,
`avi-v105-final-local-firefox`, `avi-v105-final-remote-firefox`,
`avi-progressive-before`, and `avi-v105-all-unit.log`.

Audio continuity is measured after the analyser's first audible sample. An
initial local Firefox run failed because a newly created AudioContext produced
117 ms of zero samples before starting, with a subsequent longest quiet interval
of 43 ms. The corrected fixture records this initial context warmup separately
and keeps the same 100 ms continuity assertion after audio starts. The original
failed JSON was overwritten by its rerun; observed timing remains in the tool
trace, not a preserved original artifact. All four final runs passed the native
range/frame/audio checks; this does not establish sample-perfect audio fidelity.

Unlocked remote inputs use ephemeral immutable OPFS chunk files. Native local
Files, including verified plaintext sources for unlocked password-locked entries,
mount without whole-file copies. Password-locked remote input never writes
decrypted plaintext to OPFS. Without usable temporary storage, the input prefix
is limited to the existing RAM byte budget; playback then asks the user to
download and link a local source, keeping decoded media available. Slow devices
or codecs may still rebuffer. These tests cover Chromium and Firefox on this
host; they do not establish physical mobile/Safari behavior or years of uptime.
