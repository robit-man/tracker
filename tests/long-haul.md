# Browser lifetime soak

This harness measures elapsed wall time; it does not simulate months or years by
advancing clocks. A successful hour is evidence for that hour, not a guarantee of
indefinite browser, operating-system, or public-relay availability.

Install Playwright in a separate dependency directory and install its browsers.
Run from the project root:

```sh
TRACKER_TEST_DEPS=/tmp/tracker-test-deps \
TRACKER_HTML=index.html FILE=/path/to/long-movie.mp4 \
DURATION_SECONDS=3900 SAMPLE_SECONDS=30 \
OUT=/tmp/tracker-long-haul/candidate node tests/long-haul-browser.mjs
```

The default run launches isolated Chromium and Firefox profiles. Each browser has
three independent contexts: an empty private room, a file seeder, and a viewer in
the seeder's private room. The file is indexed with the normal picker and played
with the normal stream action. Deep privacy disables direct ICE, so stream bytes
use the application's real encrypted public relay paths. The test does not touch
existing user browser sessions. Chromium disables GPU acceleration.
Set `PRIVACY_MODE=0` to exercise the normal default network configuration,
including NKN and direct routes, instead of the relay-only control.

The run copies its exact source to `snapshot.html` and records its SHA-256.
`DURATION_SECONDS` counts **after** setup, so startup and file hashing do not
shorten the steady observation period. Both viewers normally start before this
period; a startup failure is recorded and the remaining windows stay open for the
full observation period. Use a video longer than the soak to sustain decoding.

Artifacts are streamed to disk rather than accumulated in browser memory:

- `samples.jsonl`: timestamp, app Map/Set/queue sizes, SAFE and playback time,
  received/appended bytes, native socket/RTC/worker counts, active intervals by
  callback, DOM nodes, event-loop lag, and telemetry response latency.
- `processes.jsonl`: Linux process-tree RSS for the harness and its isolated
  browser, renderer, utility, and worker processes. RSS is not JS heap usage.
- `events.jsonl`: startup, playback stalls, page exceptions, and crash events.
- `console.jsonl`: bounded-length browser error messages; public relay connection
  failures are reported separately from JavaScript exceptions and renderer crashes.
- `workers.jsonl`: worker creation events.
- `status.json`: current bounded run summary, available while running.
- `summary.json`: final elapsed and observation time, failure counts, survival
  status, playback continuity, and combined completion status.
- `viewer-legs.jsonl`: completed receiver legs, received bytes and why a new
  receiver was opened when `RECYCLE_VIEWERS=1` is enabled.

Chromium also records CDP JS heap, backing storage, DOM document, node, and event
listener counts. Firefox has no equivalent Playwright heap API; process RSS and
app/native resource counts remain available. The in-page resource observer keeps
weak references to native objects and prunes dead entries at every sample. Its
in-memory event summary is capped at 200; the complete event stream stays on disk.

Compare the same scenarios and cadence against a baseline captured before code
changes. Separate startup/module compilation and media-buffer warmup from the
steady portion. Inspect persistent growth in live resources and post-warmup heap
or RSS alongside playback and queue state. A transient GC high-water mark alone
is not sufficient evidence of a leak. Playback stalls are logged without ending
the lifetime observation, and are not silently treated as successful playback.

Optional focused modes:

```sh
# Keep only empty-room controls open; FILE is not required.
IDLE_ONLY=1 DURATION_SECONDS=3900 ... node tests/long-haul-browser.mjs

# Leave empty-room and normal file-seeder controls open in both browsers for a day.
# This observes source/adapter lifetime without claiming active viewer playback.
SEED_ONLY=1 PRIVACY_MODE=0 WARM_SEED_TRANSPORTS=1 DURATION_SECONDS=86400 ... node tests/long-haul-browser.mjs

# Keep idle/seeder contexts fixed; replace the receiver after all file chunks
# arrive. Fresh isolated storage forces real serving again rather than cached replay.
RECYCLE_VIEWERS=1 PRIVACY_MODE=0 DURATION_SECONDS=86400 ... node tests/long-haul-browser.mjs

# At most five real disconnect/reconnect cycles on idle controls.
# The cap and 15-second spacing avoid hammering public brokers.
CHURN_CYCLES=3 ... node tests/long-haul-browser.mjs

# Opt in to one normal media play retry after three unchanged samples.
RECOVER_STALLS=1 ... node tests/long-haul-browser.mjs
```

Use deterministic local fixtures for thousands of reconnect/lifecycle cycles.
That stress result complements the real soak; it does not replace elapsed-time
evidence. Set `BROWSERS=chromium` or `BROWSERS=firefox` for a focused run, and `SITE`
when testing another deployment. Keep baseline and candidate output directories
separate; the harness refuses to reuse an output directory containing samples.
SIGINT/SIGTERM records an interrupted run and closes its isolated browsers. A captured build is routed only for the HTML document; its actual
pinned production libraries and public relays remain in use.
Idle-only and seed-only summaries set `playbackContinuous` to `null` because
those modes do not create a viewer. Seed-only acceptance also requires the source
to remain linked, enabled, readable, and present after the entire interval. The
production `readLocalChunk` function reads canonical first/middle/last chunks at
startup and completion; browser SHA-256 must match the original Node disk reads.
The recycling mode repeats these source proofs, reports cumulative source
`servedBytes` and per-leg receiver `netBytes`, and keeps source/idle pages open
for the entire run. Planned receiver replacements are not crashes or playback
stalls. Samples include a leg number; analyze playback progress within each leg.
`VIEWER_LEG_LIMIT=2` limits replacements for short fixture checks. The default has
no leg limit. `RECYCLE_VIEWERS=eof` replaces only on native `ended`; an eight-second
MP4 fixture currently exposes a separate MSE end-of-stream defect (complete bytes,
playhead just short of the duration, no `ended`). Preserve that failure; the
day-long active-serving test uses the validated all-chunks completion trigger.
`WARM_SEED_TRANSPORTS=1` calls the production incoming-demand recovery wake once
after indexing, which starts deferred NKN/torrent adapters on the seeders. Idle
controls remain untouched. NKN SDK/client/pending-credit state is sampled;
public connection availability is reported separately from resource lifetime.
After a demand wake, production idle disposal may stop deferred adapters while
the linked source and always-on carriers remain healthy; an absent NKN client
with zero pending work is not itself a lifetime failure.
For a detached run, use `nohup` with stdin
redirected from `/dev/null`, save `$!` to a PID file, and keep the log, snapshot,
`status.json` and final `summary.json` in a fresh run directory. A still-running
day-long test is pending evidence until its full observation period completes.
At completion, review timestamp gaps and sample coverage as well as the summary:
host suspension or a long unobserved interval does not establish continuously
observed awake-browser uptime, even when elapsed wall time reaches a day.

```sh
mkdir -p /tmp/tracker-long-haul/seed-day
nohup env TRACKER_TEST_DEPS=/tmp/tracker-test-deps TRACKER_HTML=index.html \
  FILE=/path/to/long-movie.mp4 SEED_ONLY=1 PRIVACY_MODE=0 WARM_SEED_TRANSPORTS=1 \
  DURATION_SECONDS=86400 SAMPLE_SECONDS=30 OUT=/tmp/tracker-long-haul/seed-day \
  node tests/long-haul-browser.mjs \
  </dev/null >/tmp/tracker-long-haul/seed-day/run.log 2>&1 &
echo "$!" >/tmp/tracker-long-haul/seed-day/pid
```

Inspect `status.json` for the latest sample count and startup/failure events,
`samples.jsonl` for resource growth, and `run.log` for startup and crash events.
`summary.json` appears only when the run finishes or exits. Inspect the saved PID
with `ps -p <pid> -o pid,ppid,pgid,sid,etime,args` before stopping; confirm its
`/proc/<pid>/environ` contains this run's exact `OUT` path. Send SIGTERM only to
that Node PID. It records interruption and closes its own browser instances
after the current sample/wait; leave the user's unrelated browsers untouched.
