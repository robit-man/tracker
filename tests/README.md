Run the controller and MP4 fetch-planning regressions with Node:

```sh
node --test tests/streaming.test.cjs
```

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
