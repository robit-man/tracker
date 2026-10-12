For elapsed-time Chrome/Firefox seeding and streaming tests, see the
[browser lifetime soak guide](long-haul.md). It records browser survival,
playback continuity, and retained resources separately, including pending
24-hour runs. [Recorded results](results.md) describe each tested snapshot.

Run the controller and MP4 fetch-planning regressions with Node:

```sh
node --test tests/streaming.test.cjs
```

The reference interface and free peer retention harness uses three independent
peers plus a local-cache scenario, with real encrypted public relays and direct
ICE disabled:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  FIXTURE=/path/to/short.mp4 node tests/interface-storage-browser.mjs
```

It checks both saved themes, all navigation views without changing the room
fragment, inspector keyboard tabs, mobile overflow and action sizes, and dialog
focus. One peer opts into storage, accepts a free retention request, verifies the
complete file and reloads. The original source then closes; a fresh third peer
must retrieve byte-identical data from the retained source and decode the video.
Finally it disables contribution. Use a short MP4 of at least five seconds.
`BROWSER=firefox`, `BROWSER_EXECUTABLE`, and `RESULT` select the browser and trace;
omit `TRACKER_HTML` to exercise the actual deployment. The harness checks voluntary
online storage, not a paid service or guaranteed durability after browser eviction.
`peer-storage.test.cjs` covers capacity reservation, authenticated controls,
idempotent pins, opt-out, reload behavior and replacement placement.

AVI compatibility playback, using two independent browser contexts and real
encrypted public relays with direct ICE disabled:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  node tests/avi-playback-browser.mjs /path/to/mpeg4-mp3.avi /path/to/h264-mp3.avi
```

The harness verifies decoded frames and advancing playback on both the local
source and receiving peer, closes the first player during codec loading, then
checks seeking and saved-position resume. It also checks the download SVG's
rotation direction. Supply short AVI fixtures with video and audio and a duration
over ten seconds; an additional MP4 fixture checks the existing playback path.
`BROWSER=firefox`, `BROWSER_EXECUTABLE`, and `RESULT` select the browser executable
and JSON trace. Omit `TRACKER_HTML` to test the deployed site. AVI uses bounded
FFmpeg/WASM sections appended to one native MediaSource player. Conversion
continues during playback, and seeks begin at the requested source window.

Progressive AVI coverage with the receiving tail deliberately withheld:

```sh
node --test tests/avi-progressive.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps \
  node tests/avi-progressive-browser.mjs /path/to/300-second.avi
BROWSER=firefox AVI_CASE=local TRACKER_TEST_DEPS=/tmp/tracker-test-deps \
  node tests/avi-progressive-browser.mjs /path/to/300-second.avi
```

This harness uses real local WebRTC, FFmpeg/WASM and native MSE. It checks early
decoded frames before the whole source arrives, continuing sections on the same
player, pause/Resume, direct seeks, natural EOF, and temporary input cleanup.
Use a video longer than 125 seconds with audio. `AVI_CASE=local` tests a native
local File; the default tests a remote prefix. `TRACKER_HTML` and `RESULT` select
the source snapshot and JSON evidence. Unlocked remote inputs use ephemeral OPFS
chunk files protected by per-input Web Locks; startup removes abandoned inputs.
Locked files and browsers without temporary storage use a bounded RAM prefix,
then ask for a downloaded and locally linked source to continue. Conversion
speed depends on the device and codec; a codec slower than playback can rebuffer.

Privacy and resumable media previews:

```sh
node --test tests/*.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  FIXTURE=/path/to/ETV.mp4 node tests/privacy-resume-browser.mjs
```

This uses two separate browser contexts and real public brokers. It toggles
privacy through the button, verifies persistence and closure of existing direct
connections and relay-only configuration of idle connection pools, and downloads fresh byte-identical
data through encrypted relays. X must stop playback, chunk receipt, and source
traffic after queued work retires. Play must reuse the retained media element,
position, and encrypted cache with a new request session. A subsequent reload
must restore the bookmark and fetch the saved MP4 range. With ETV, the test seeks
to 100 minutes and rejects downloading the preceding file prefix. The default
fixture is `/tmp/tracker-stream-test/faststart.mp4`; for other files set `SEEK_TIME`
to a valid position. `RESULT` selects the JSON trace, `BROWSER=firefox` and
`BROWSER_EXECUTABLE` select Firefox, and omitting `TRACKER_HTML` tests deployment.

Add `PRIVACY_MODE=1` to `live-stream-routes-browser.mjs` to enable privacy using
both actual buttons before publishing screen, camera/microphone, and audio.
This checks that these live modes also work with direct ICE unavailable.

Run the browser harness with a local MP4. Install its dependencies outside the
repository so the application remains a single HTML file:

```sh
npm install --prefix /tmp/tracker-test-deps playwright mp4box@2.4.1
/tmp/tracker-test-deps/node_modules/.bin/playwright install chromium
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TICKS=110 \
  node tests/streaming-browser.mjs /path/to/movie.mp4
```

The harness loads two separate Chromium browser contexts, indexes the actual
file on the source instance, and streams encrypted chunks over real WebRTC data
channels into the receiver's scheduler, cache, MP4Box and MediaSource pipeline.
It drops an initial chunk, reduces bandwidth, increases playback to 4×, interrupts
delivery for 15 seconds, restores delivery, and performs a buffered seek.
Assertions require playback and fragment generation to recover, with changing
SAFE targets and request windows and no browser or media errors.

`RESULT` selects the JSON trace path (default `/tmp/tracker-stream-results.json`).
The default run takes 120 samples after file indexing; use at least 100 samples
to include the recovery and seek assertions. This is a partial-playback stress
test, with local peer setup; it does not test public relay discovery or every
minute of the supplied movie. Neither the movie nor test hooks are embedded in
the application.

Exercise public discovery and relay recovery with the same real file:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps RELAY_ONLY=1 \
  node tests/streaming-public.mjs /path/to/movie.mp4
```

This opens two separate contexts on the deployed GitHub Pages site and creates a
new private room. It uses the normal file input, catalog discovery, encryption,
public brokers and media pipeline. `RELAY_ONLY=1` forces both contexts' ICE policy
to relay with no TURN servers, so direct connections cannot mask broker failures.
The receiver plays at 4×, goes offline for 15 seconds, then returns to 1× and
must recover playback and SAFE after reconnecting. Without `RELAY_ONLY`, direct routes are allowed.

Add `MOBILE_VIEWER=1` to exercise the mobile receiver code with a touch viewport
and Android user agent. Combined with `RELAY_ONLY=1`, this checks mobile startup
and recovery when direct ICE is unavailable. It emulates browser behavior, not
mobile hardware or a carrier network.

For validation before deployment, `TRACKER_HTML=/absolute/path/index.html` serves
that HTML snapshot at the Pages origin in these two test contexts. External
scripts and brokers still use the network. The trace records whether this
override was used; omit it to validate the actual deployment. `RESULT` selects
the trace path; default `/tmp/tracker-public-results.json`. The default 150
samples include the recovery assertions; startup and file indexing are additional.

Verify uncached MP4 seeking with the real file and two WebRTC instances:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps \
  node tests/streaming-seek.mjs /path/to/ETV.mp4
```

This ETV-specific scenario jumps to 100 minutes, backward to 20 minutes, and
forward to 150 minutes. It requires playback at each target while the intervening
file prefix remains missing, bounds new bytes to a decoder RAM window, evicts the
initial MSE range and rebuilds it from verified cache, then exercises rapid seeks
and continuing fragment production. The supplied file must exceed 150 minutes.

Run those forward/backward seeks through public brokers with direct ICE disabled:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps RELAY_ONLY=1 MOBILE_VIEWER=1 \
  node tests/streaming-public-seek.mjs /path/to/ETV.mp4
```

It requires playback at each target, another minute of playback after seeking,
positive SAFE, bounded sender WebSocket queues, and no runtime or media errors.
`TRACKER_HTML` and `RESULT` work as described above. Omit `TRACKER_HTML` to test the
deployed page.

To combine mobile relay pressure, alternate-CDN loading, and the managed-only
API branch before publication, add `DECODER_PRIMARY_BLOCKED=1 MANAGED_API_ONLY=1
SEEK_TARGETS=6000,1200` and `TRACKER_HTML=/absolute/path/index.html` to that command.
This checks the forward/backward seek followed by a minute at the 20-minute
position. The managed API is emulated with Chromium MSE; physical iPhones still
require device testing.

For a longer continuous-playback regression past the reported 326-second stall:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TICKS=210 MIN_PLAY_TIME=326 \
  node tests/streaming-browser.mjs /path/to/ETV.mp4
```

Test deadlines and sample counts are harness limits, not controller set points.

Check reserve protection throughout playback with enough bandwidth to sustain
the file, including a reduction to 768 KiB/s followed by restoration:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps RESERVE_GUARD=1 TICKS=150 \
  node tests/streaming-browser.mjs /path/to/ETV.mp4
```

This separate scenario keeps playback at 1× and introduces no outage or seek.
After SAFE first reaches the measured upper reserve, **every** subsequent sample
must stay above the current dynamic lower band and advance playback. It also
records both exact band boundaries. This catches brief reserve collapses that
a check of only the final buffer would miss.

Add `RESERVE_GUARD=1 SUSTAIN_TICKS=90` to the public seek harness to check the same
invariant for 90 seconds after its forward/backward seek and reserve buildup.
The public test reads exact reserve telemetry from the open debug panel.
It additionally audits the buffer ten times per second and rejects rebuffering
events after buildup. Add `EXTRA_VIEWER=1` to keep a second mobile receiver
streaming from the same source while the tested receiver seeks and refills;
this exercises shared relay capacity and duplicate frontier recovery traffic.
`LEGACY_VIEWER_HTML=/path/to/older-index.html` loads a saved older build in that
extra viewer, checking that common-broker media does not recruit legacy peers
into redundant forwarding while both receivers continue playing.

Updated peers sharing NATS negotiate compact encrypted binary envelopes on a
receiver-specific subject, avoiding nested base64 and unrelated media delivery.
Older peers and cross-plane delivery retain the encrypted fragment format.

Reproduce decoder-CDN failure and false whole-movie SAFE accounting with a real MP4:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps \
  node tests/streaming-decoder.mjs /path/to/movie.mp4
```

This blocks the primary MP4 decoder CDN and serves the exact alternate npm
distribution locally, including relative module imports. It requires continuous
playback beyond 1:29 with only the ManagedMediaSource API exposed (an alias
of Chromium MSE, not an iPhone hardware test). It then blocks both decoder sources, interrupts delivery
after a partial prefix, and requires zero SAFE and no native Blob playback until
the whole file is received and verified. Complete native playback must load once
and continue without replacing its source URL. Use a movie longer than two
minutes; the reported 1,401-chunk Eternal Sunshine MP4 is the regression fixture.

Screen capture and icon controls:

```sh
node --test tests/*.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  node tests/live-media-browser.mjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" RELAY_ONLY=1 \
  node tests/live-media-browser.mjs
```

The live-media harness requires `Xvfb` and Chromium on Linux. It creates a private
virtual desktop and calls the real `getDisplayMedia()` API; it does not record
your desktop or use a mocked capture stream. Two separate browser contexts use
normal room discovery and signaling to publish and receive that screen. It checks
continued playback, remote stop, icon centering, accessible names, hover and focus
tooltips, and all seven header actions at a 320px viewport. `RELAY_ONLY=1` disables
direct ICE to exercise encrypted relay segments. Omit `TRACKER_HTML` to test the
actual GitHub Pages deployment. `RESULT` selects the JSON trace and screenshot
prefix. Screen audio is optional and depends on the surface selected by the user;
the virtual desktop test covers video-only capture, with audio handling and
capture lifecycle covered by the unit regressions.

Room-link QR sharing:

```sh
npm install --prefix /tmp/tracker-test-deps playwright jsqr pngjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  node tests/room-share-browser.mjs
```

This harness scans both the PNG data and rendered desktop/mobile QR image with
an independent decoder, requiring the complete page URL including its private
room fragment. It checks copying (including the clipboard fallback), downloaded
PNG contents, updated URLs on reopening, focus containment, Escape/backdrop close,
and offline generation. Omit `TRACKER_HTML` to test the deployed Pages site;
`RESULT` selects the JSON trace and screenshot prefix. The embedded QR encoder is
Project Nayuki's MIT-licensed library, pinned to the commit recorded in the HTML.

Live capture through the file-stream delivery pipeline:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" RELAY_ONLY=1 \
  node tests/live-stream-routes-browser.mjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" DIRECT_HARNESS=1 \
  FIXTURE=/path/to/movie.mp4 node tests/live-stream-routes-browser.mjs
```

The first command tests real virtual-desktop screen capture, synthetic camera
video, and a known microphone tone in separate browser contexts through public
brokers with direct ICE disabled. It drops a live chunk and requires frontier
repair without restarting the encoder or MediaSource, then interrupts the screen
receiver's network and checks recovery on the same stream generation. Audio must
be decoded and measurable at the receiver. The second command establishes a real
WebRTC **data channel**, starts file playback, and requires all three live modes
to use that file-proven route while the file keeps playing. Neither modern live
viewer nor publisher may open a separate media PeerConnection.

For a test of the actual deployed page, omit `TRACKER_HTML` and `DIRECT_HARNESS`.
That run uses normal public discovery, capture, delivery and disconnect recovery;
it excludes the injected missing-chunk test. `MODES=screen,av,audio` selects
capture modes and `RESULT` selects the JSON trace path. The harness needs Chromium
and Xvfb, creates its own private display, and writes a generated microphone WAV
next to the trace. It does not exercise physical cameras, phones or carrier NAT.

Updated peers advertise compatible recorder/MSE formats and pull a growing,
byte-bounded live chunk journal through the file queue, encrypted compact relay
protocol, verified path hints, backpressure and independent frontier rescue.
Confirmed SourceBuffer appends acknowledge and retire journal bytes. Only byte
capacity exhaustion or a decoder error creates a fresh initialization; ordinary
retries and network recovery preserve the current encoder. Live startup uses the
existing measured SAFE upper band rather than a fixed reserve duration. Browser
peers without compatible recorder/MSE support retain the older media connection
path. Both ends need the updated page to negotiate chunk delivery.

`PrivateTrackerMesh.live()` exposes live delivery diagnostics: selected byte
paths, SAFE and its measured band, source/viewer frontiers, journal capacity,
stream generation and whether a separate media connection exists.

`FIREFOX_VIEWER=1` runs the receiver in Firefox instead of Chromium.
`FIREFOX_SOURCE=1 MODES=av,audio` exercises Firefox capture/encoding with its
synthetic media devices. `FIREFOX_BINARY` optionally selects an installed
Playwright Firefox executable. Synthetic microphone tests disable audio
processing so noise suppression cannot erase the calibration tone.

The live WebM muxer preserves encoded frames and their timestamps, orders both
tracks together, and opens a new cluster at a video keyframe. This avoids
Firefox discarding dependent frames after overlapping A/V timeslice boundaries.
The tests check payload/timestamp preservation, partial headers and blocks,
late audio packets, browser playback and missing-chunk recovery.

`MP4_ONLY=1 MODES=av,audio TRACKER_HTML="$PWD/index.html"` advertises only
native MP4 recorder formats to verify fragmented MP4 delivery and recovery.
Negotiation includes explicit H.264/AAC and H.264/Opus formats, filtered by the
publisher's encoder and receiver's MSE support. ManagedMediaSource uses the same
remote-playback setting as file playback. These checks do not replace Safari
or physical iPhone validation.

Set `OUTAGE_MS=18000 MODES=screen` to exercise a disconnect longer than the
legacy announcement expiry. An active chunk viewer remains reconnectable until
explicitly closed or the publisher ends the broadcast; missing heartbeats alone
do not discard its decoder, verified route evidence or stream generation. Idle
catalog listings and legacy connections retain their expiry behavior.

Enable the publisher's lightning button with `LOW_LATENCY=1` in
`live-stream-routes-browser.mjs`. This exercises the same encrypted chunk routes
with shorter capture batches, a measured playout cushion, live-edge catchup and
per-viewer compression. Stable buffering remains the default. Compression learns
from validated byte receipt and accumulated delivery debt, separately from
ordered decoder acknowledgements; it changes bitrate
and applies resolution/frame-rate constraints to a private capture track. An
encoder quality change sends a fresh initialization, while ordinary repairs keep
the current stream. There is no fixed seconds-based latency target.

Measure capture-to-display latency using actual decoded pixels:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  node tests/live-latency-browser.mjs
```

This captures a changing clock barcode on a private Xvfb display using real
`getDisplayMedia`, then reads the timestamp from the receiver's decoded video.
The publisher and receiver run in separate browsers with direct ICE disabled.
It compares stable mode with LIVE, constrains receiver admission to 40,000 B/s,
checks compression, restores capacity and checks live-edge recovery. The gate
uses actual encrypted broker payloads; it models a constrained last mile, not a
physical carrier network. Capture settings must remain unchanged by a slow
viewer's compression. `FIREFOX_VIEWER=1` selects Firefox, `FIREFOX_BINARY` can
select an installed binary, and `CONGESTION=0` skips bandwidth shaping. Omit
`TRACKER_HTML` to time the actual deployed site; admission shaping requires the
HTML override. Both browsers use the host clock, avoiding clock-offset estimates.
The JSON contains all pixel timing samples, not just their medians.

Check mobile file cards with real file import, long filenames, all metadata,
action hit areas and element bounds at 320, 360, 390 and 640 pixels, plus compact
desktop rows at 1280 pixels:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML="$PWD/index.html" \
  node tests/mobile-cards-browser.mjs
```

`RESULT` chooses the JSON path and screenshot prefix for both harnesses.

`DIRECT_HARNESS=1 NATIVE_DIRECT=1` in `live-stream-routes-browser.mjs`
uses the actual WebRTC data-channel backpressure without the file stress
harness's additional serial bandwidth-delay queue. `FIXTURE` can select the
full ETV movie for simultaneous file/live playback. Leave `NATIVE_DIRECT` off
to retain that deliberately constrained link for file scheduling stress tests.

Verify local source linking with actual hash workers and public relays:

```sh
node --test tests/source-link.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps \
  node tests/source-link-browser.mjs
```

The browser test opens three independent room members with direct ICE disabled.
A member who never owned the listing rejects a same-size corrupt file, links a
renamed matching copy, reloads and relinks the orphaned listing, then supplies a
byte-identical download to a third member after the original uploader closes.
It also checks that the listing and original publisher stay unchanged.
`TRACKER_HTML` selects a predeployment snapshot; omit it to check the live site.
`BROWSER=firefox` selects Firefox, and `BROWSER_EXECUTABLE` can select its binary.
`RESULT` selects the JSON evidence path. Unit tests additionally cover locked
content hashes, permission reauthorization, stale handles, picker cancellation,
and respecting the global seeding-off setting.

V4 identity, signature, policy, URL and binary tests run with the ordinary suite:

```sh
node --test tests/*.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps node tests/v4-browser.mjs
TRACKER_TEST_DEPS=/tmp/tracker-v4-test-deps node tests/v4-interop-browser.mjs
```

The first browser harness checks navigation, clipboard, global nonextractable key
persistence, simultaneous initial tabs without Web Locks, sibling-origin paths,
manifest-only navigation, unsupported crypto and corrupt-key recovery. The second
uses real local WebRTC between separate profiles for bidirectional v4/v3 transfers,
locked links, final-root corruption rejection, persistent download resume and
protected grant/revocation policy. Public broker coverage uses the existing
`source-link-browser.mjs` with `TRACKER_HTML=index.html`.

`HEADLESS=1 MODES=av,audio` runs the live route harness on Chromium's full headless
binary without Xvfb; capture devices are synthetic browser inputs, while actual
capture, encoding, data channels and playback are used. Display capture still
requires the existing display/Xvfb workflow. Actual coverage and limitations,
including the baseline media fixture size, are recorded in `tests/results.md`.

Independent networks, orphan expiry and touch viewport behavior:

```sh
node --test tests/*.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps node tests/decentralized-browser.mjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps node tests/file-cleanup-browser.mjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML=index.html node tests/mobile-zoom-browser.mjs
```

The decentralized harness disables the original app carriers and
BroadcastChannel. It uses real public Waku Filter/LightPush, libp2p circuits and
WebRTC upgrades. It checks byte-identical MP4 transfer and decoded playback,
encrypted IPFS pin/retrieve, pin persistence, original source closure and
retrieval by a fresh peer from the remaining pin provider. Public relays may
reject individual connection attempts; evidence records the end-to-end result.

The cleanup harness compresses only the production seven-day/final-day/probe
constants in its fixture. It exercises real signatures, catalogs, native file
selection, wrong-hash rejection, reloads, replicated countdowns, mobile rescue,
retention protection and expiry tombstones. Production constants stay unchanged.

The mobile harness checks dark default and saved light preference, focus and
double-tap scale, gesture guards, 16px inputs, Chromium native pinch/touch scroll
and WebKit form focus/DOM scrolling. Install the Playwright Chromium and WebKit
engines. `RESULT` sets the evidence filename; `TRACKER_HTML` overrides the live
page where supported. Source-link coverage also checks the blinking recovery cue
and its removal after verified relinking.

Source recovery also checks a real persisted `FileSystemFileHandle` in Chromium.
The permission fixture first denies automatic access after reload, then restores
it and dispatches tab focus. The saved source must resume without a file picker,
and its relink pulse must clear. Unit coverage requires full hash verification
when saved-handle metadata changes, preserves seed-off/selection preferences,
and excludes incomplete download caches from automatic recovery.

Global storage coverage:

```sh
node --test tests/global-storage.test.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML=index.html \
  node tests/global-storage-browser.mjs
```

The browser harness uses separate contexts and unrelated private rooms over real
public relays. It closes the uploader and reloads both providers **before** a
fresh context visits the room. Recovery must pass through the encrypted global
catalog path; an old room announcement cannot satisfy the assertion. The normal
file download action must retrieve byte-identical content with one replica
paused. It also checks collective capacity, placement across shards, provider
reload, shard reload, mobile fit, recent rooms, provider-tab takeover and mutual
direct-route opt-in. Finally only one provider context remains; entering the
private room must discover and download its own opaque copy locally.

HTML overrides automatically use a random deployment path to keep simultaneous
runs and real contributors isolated. `BROWSER=firefox` selects Firefox.
`TRACKER_SITE=http://127.0.0.1:9031/` can select a local origin. Omit `TRACKER_HTML`
to exercise the actual deployment and its GitHub Pages deep-path entry; use an
isolated deployment if other active providers would affect placement assertions.
Set `TRACKER_BEFORE_HTML=/path/to/v105.html` together with `TRACKER_HTML` to pin
using the old app, then upgrade the same browser contexts. Existing encrypted
copies must gain recovery metadata without re-uploading or relinking the file.

Force an individual global relay with the fixture harness:

```sh
PLANE=mqtt node tests/global-storage-relays-browser.mjs
PLANE=nostr node tests/global-storage-relays-browser.mjs
```

This harness uses an isolated deployment URL, prevents the other global transport
clients from starting and closes BroadcastChannel. It checks actual public-relay
discovery, multipart ciphertext retention, cold catalog recovery and root-verified
retrieval. The uploader closes before the receiver is created. Normal room control
remains available, but provider catalog recovery is required independently.
`BULK_BYTES=64000` selects the smaller MQTT fixture; the default is 650,000 bytes.

Global recovery privacy boundary:

- HKDF-SHA-256 derives separate lookup, catalog encryption and per-object writer
  keys from the existing room key derivation, scoped to the deployment. The opaque
  lookup is neither the room hash nor a key that decrypts the room. Names, original
  signed manifests, catalog revision chains, owner policies and private placement
  locators remain inside AES-GCM ciphertext. Providers never join the room.
- An object owner registers a separate Ed25519 public writer key. Subsequent
  updates require signatures from its room-derived private key, bound to the
  object, deployment, lookup, ciphertext hash and previous catalog hash. No secret
  update credential crosses a relay. Previously signed writes cannot roll back newer provider
  state; an identical retry is idempotent. Private keys are not retained by the
  provider. The private-key import encoding follows
  [RFC 8410](https://www.rfc-editor.org/rfc/rfc8410.html#section-7); key separation
  follows [RFC 5869](https://www.rfc-editor.org/rfc/rfc5869.html).
- Recovery authenticates the ciphertext and original room signatures. Protected
  rooms take their owner anchor from the invite, then verify the retained policy
  before accepting authors. The provider cannot grant room membership or choose
  an owner. Catalog removals and their signed revision history travel with updates.
- Catalog ciphertext occupies a separate IndexedDB chunk, committed atomically
  with its opaque descriptor. Its 256 KiB limit counts against quota and follows
  the file object's expiry/removal. Discovery pages contain at most eight opaque
  descriptors, with two providers serviced per maintenance turn. Recovery and
  updates are single-flight, yield to foreground global transfers, and use bounded
  queues and deduplication maps. New pins are confirmed only after catalog storage
  is acknowledged as well as file storage.

Providers and relays can observe opaque token equality, object sizes and traffic
timing. This does not hide those patterns or defend availability against a
malicious provider; file identities remain encrypted. Copies require an online
provider, and browser eviction still applies. Opening a room restores its listing
automatically; Play/Download fetch retained bytes without a manual relink. It does
not download every large room file merely because the room was opened.

Old pins can be upgraded while the original uploader browser still has its signed
room metadata and global identity, and the providers run the current app. Backfill
uploads only recovery metadata. Old blobs with all original locators/catalogs
already erased cannot be found from the room secret alone.


### Relink verification progress

`FILE=/path/to/large.mp4 TRACKER_TEST_DEPS=/path/to/playwright-deps node tests/source-verification-browser.mjs`
indexes the file, reloads the room to lose its temporary source, and relinks the
same disk file through the real browser picker and background hash worker. Use a
large file so intermediate progress is visible. `BROWSER=firefox` selects Firefox;
`MOBILE=1` checks the 390px layout. The harness checks increasing inline progress,
byte totals and verification speed, preserves the original content root, confirms
seeding resumes, and verifies the progress and expiry blocks disappear. It saves
dark/light screenshots during verification and a JSON report; `RESULT` changes the
output path. `TRACKER_HTML` can select another app snapshot.

### NKN connection lifetime

Install the pinned SDK outside the repository, then exercise its actual child
clients and RTC adapter with deterministic discovery/closure races:

```sh
npm install --prefix /tmp/tracker-nkn-deps nkn-sdk@1.3.6
TRACKER_NKN_DEPS=/tmp/tracker-nkn-deps/node_modules node tests/nkn-sdk-lifetime.cjs
NKN_BASELINE=1 TRACKER_NKN_DEPS=/tmp/tracker-nkn-deps/node_modules node tests/nkn-sdk-lifetime.cjs
TRACKER_TEST_DEPS=/tmp/tracker-test-deps node tests/nkn-lifetime-browser.mjs
```

The baseline command deliberately exits unsuccessfully: the unguarded pinned
SDK ignores a rejected SDP promise after its peer closes. The guarded fixture
checks late constructor replies, connect single-flight, owned SDK backoff,
replacement-PC safety, shutdown and dependency shape checks. The browser smoke
uses two independent contexts and actual public NKN WebRTC connections to verify
encrypted delivery and explicit close. `RESULT` selects its JSON evidence path.
