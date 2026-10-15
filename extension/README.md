# Tracker Distributed Storage — browser extension

Persistent background contributor for global / room-based `Contribute storage`.

- Firefox: background script keeps presence heartbeats alive while the browser runs.
- Chrome / Chromium: event-driven service worker (alarms + messages). Chrome cannot
  run 24/7 background pages; the worker wakes every minute and on messages.
- Tabs remain the data plane. The extension is the presence/persistence plane.
  No room secrets, file bytes, or keys pass through the extension — only
  enable/scope/capacity config + heartbeat timestamps.

## Files

- `manifest.json` — MV3, Firefox (`gecko`) + Chrome compatible.
- `background.js` — heartbeat alarm, config store, tab broadcast.
- `content.js` — bridge: exposes `tracker:extension-available` /
  `tracker:extension-heartbeat` DOM events to the tracker page.
- `popup.html` / `popup.js` — enable toggle + scope selector.

## Packing

Firefox (self-distribution, unlisted):

1. `cd extension && zip -r ../tracker-storage.xpi *`
2. Submit the `.xpi` to addons.mozilla.org → Sign → unlisted.
3. Host the signed `.xpi` at `/downloads/tracker-storage.xpi` with header
   `Content-Type: application/x-xpinstall`.
4. The in-app button currently routes Firefox users to the AMO listing
   (one-click native install, no dev mode). Point `EXTENSION_INSTALL.firefoxAmoUrl`
   in `index.html` at the real listing. For pure self-hosting, point the button
   at the hosted `.xpi` URL instead — a user click triggers the native install flow.

Chrome:

1. Zip the `extension/` directory.
2. Publish via the Chrome Web Store developer dashboard.
3. Set `EXTENSION_INSTALL.chromeStoreUrl` in `index.html` to the real listing URL.
4. The in-app button opens the store listing (native Add to Chrome flow).
   `chrome.webstore.install()` is deprecated and is not used.

No flags, developer mode, or manual unpacked loading are required in either flow.
