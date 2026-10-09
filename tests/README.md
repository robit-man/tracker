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
