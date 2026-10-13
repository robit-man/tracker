# WO-01 reproducible validation

Run from the repository root with Node 24. Dependencies are test-only; the deployed
application remains `index.html`. `tests/dependencies/package-lock.json` pins the
executed Playwright 1.64.0 dependency tree. CPU FFmpeg 6.1.1 generates the media fixtures.
Xvfb is needed only for the native screen capture regression.

```sh
npm ci --prefix tests/dependencies
export TRACKER_TEST_DEPS="$PWD/tests/dependencies"
"$TRACKER_TEST_DEPS/node_modules/.bin/playwright" install chromium firefox
gzip -dc artifacts/wo-01/source-c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7.html.gz > /tmp/wo01-baseline.html
export BASELINE_HTML=/tmp/wo01-baseline.html
node tests/wo-01-fixtures.mjs /tmp/tracker-wo01-media
node --test --test-timeout=30000 tests/*.test.cjs
node tests/wo-01-inventory.mjs
for engine in chromium firefox; do
  export BROWSER="$engine"
  node tests/wo-01-browser.mjs
  node tests/wo-01-boundaries.mjs
  node tests/wo-01-upgrade.mjs
  node tests/wo-01-transfer.mjs
  node tests/wo-01-capture.mjs
  node tests/wo-01-storage.mjs
  node tests/wo-01-media.mjs /tmp/tracker-wo01-media/fixture.mp4
  node tests/wo-01-media.mjs /tmp/tracker-wo01-media/tail.mp4
  RESTART_BYTES=33554432 LOCKED=0 node tests/wo-01-restart.mjs
  RESTART_BYTES=33554432 LOCKED=1 node tests/wo-01-restart.mjs
  TRACKER_HTML=index.html RESULT="/tmp/wo01-avi-$engine.json" node tests/avi-playback-browser.mjs /tmp/tracker-wo01-media/compat.avi
  TRACKER_HTML=index.html OUT="/tmp/wo01-storage-ui-$engine" node tests/browser-storage-browser.mjs
  TRACKER_HTML=index.html OUT="/tmp/wo01-policy-$engine" node tests/policy-notices-browser.mjs
  TRACKER_HTML=index.html RESULT="/tmp/wo01-source-link-$engine.json" node tests/source-link-browser.mjs
 done
TRACKER_HTML=index.html RELAY_ONLY=1 RESULT=/tmp/wo01-screen.json node tests/live-media-browser.mjs
TRACKER_HTML=index.html BROWSER=chromium RESULT=/tmp/wo01-global.json node tests/global-storage-browser.mjs
```

For the equivalent resource comparison, recover the authoring baseline from its
checked-in exact source archive rather than assuming an unrelated file in `/tmp`:

```sh
gzip -dc artifacts/wo-01/source-c96eafd12882414386ee3b23f21c09b3a0ba4b20aae8bd7f6e16f49da58120a7.html.gz > /tmp/wo01-baseline.html
BASELINE_HTML=/tmp/wo01-baseline.html node tests/wo-01-resources.mjs
```

The harnesses use owned browser profiles and random synthetic invitations. HTML
navigation interception creates isolated test deployment namespaces; SDK/CDN traffic
and encrypted peer routes remain real. Source-download checks additionally serve the
exact static `index.html` at the test deployment's source URL. This establishes local
integration, not a successful GitHub Pages deployment. Process-crash tests send
invitations over private stdin and kill only the verified owned process tree.

`runExamples` in `tests/wo-01-examples.mjs` is executed by the storage harness, against
an actual consenting provider. It demonstrates join, list, upload, verified download,
verify, relink, global pin, global release, and reading raw source. File bytes never
travel through the metadata JSON command envelope. Its short test-side byte-array
conversion is solely to allow an independent Node SHA-256 check.

All reports record source hashes. `finishEvidence` closes the harness contexts before
writing the verdict, including late teardown errors. No test touches CDP 9222, a user
profile, private media, unrelated endurance processes, CUDA or a container workload.
Historical diagnostic failures remain explicitly failed; they are not acceptance passes.
This order's short lifetime checks do not establish a day/year-long stability claim.
