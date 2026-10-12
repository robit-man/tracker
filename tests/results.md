# Tracker v4 execution report

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
