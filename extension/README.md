# Tracker Distributed Storage — browser extension

The extension runs the existing encrypted Tracker provider in a supervised,
pinned, inactive tab at the Tracker origin. Ordinary room tabs can close while
that managed tab serves verified retained copies. The browser must remain open;
sleep, offline operation, browser shutdown and browser eviction interrupt service.

- Chromium 121+: an event-driven MV3 worker supervises the real provider tab.
- Firefox 142+: an MV3 background script supervises the same provider runtime.
- Room and global allocations are independent. Enabling a room explicitly saves
  its invitation in extension-local storage. It is an access credential; anyone
  with access to this browser profile can obtain it. Global-only mode creates a
  separate random room and does not copy the selected room's invitation.
- File bytes, private catalogs and decryption keys stay in Tracker's origin.
  Both room cache and opaque global provider objects use the existing encrypted
  IndexedDB stores and authenticated peer transports. Unsaved disk selections
  need a retained browser copy or a permission that survives reopening.
- The managed room uses a separate persisted actor, preserving normal tab actor
  identity and avoiding conflicting authenticated binary sessions.
- Settings go through TrackerCore's validated storage/global commands. Changes
  made in a participating normal tab synchronize to the managed provider. Stop
  commits contribution opt-out in open matching tabs and closes the managed tab;
  unrelated rooms' room contribution and ordinary file sharing remain separate.
- Closing the managed tab while enabled recreates it. Stop in the popup first
  to keep it closed. Restarting the browser restores the enrolled provider;
  alarms check its actual reported state, rather than advertising fake presence.

## Files

- `manifest.json` supports both current engines; packaged manifests retain only
  their browser's supported background entry point.
- `protocol.js` closes the schema, validates capacities/scopes, and restricts
  URLs to the Tracker deployment and explicit localhost development origins.
- `background.js` owns enrollment, tab supervision, settings and liveness.
- `content.js` bridges narrow contribution commands using JSON-string events
  compatible with Firefox's isolated compartments. No script runs on unrelated
  public origins, and only the packaged popup may enroll rooms or create tabs.
- `popup.html` / `popup.js` expose real provider state and independent controls.
- No extension analytics, telemetry or remote configuration is collected.

## Build and install

Run `python3 scripts/package-extension.py` from the repository root. This writes
deterministic, unsigned Firefox and Chromium ZIPs plus SHA-256 metadata under
`downloads/`. `python3 scripts/package-extension.py --check` detects source drift.
The in-app button downloads the corresponding real package, and
[`install.html`](install.html) explains development installation.

There are no store listings or signing credentials yet. These packages do not
claim one-click installation: Chromium requires Load unpacked; Firefox requires
a temporary add-on until signed. No unsigned ZIP is presented as a signed XPI.

For production installation, submit the Firefox ZIP for AMO signing/listing and
the Chromium ZIP to the Chrome Web Store. Configure the resulting real
`EXTENSION_INSTALL.firefoxAmoUrl` and `chromeStoreUrl` in `index.html` only after
they are published. Do not fill them with guessed IDs or unavailable URLs.

## Validation

`node --test tests/extension.test.cjs` checks validation, sender authorization,
supervision and opt-out. `tests/extension-browser.mjs` (Chromium) and
`tests/extension-firefox-browser.mjs` (native Firefox) use isolated profiles and
real encrypted peer traffic. See `tests/README.md` for
dependency bootstrap and reproduction. The test does not use user browsers,
private rooms, CUDA or containers. Evidence is recorded under `artifacts/extension/`.
