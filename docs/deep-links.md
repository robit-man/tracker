# Direct file links

Room: `#<48-hex-room-secret>`.
File: `#<48-hex-room-secret>/f/<64-hex-sha256-chain-root>`.

Only the secret enters the original SHA-256 room namespace, PBKDF2/AES-GCM
derivation, discovery channels and room IndexedDB name. Secret casing is retained;
root casing is normalized. Legacy custom fragments retain their decoded value
when they do not use reserved locator syntax. Malformed reserved locators are
rejected; a recognizable room prefix may still join that same room and display
the error. Malformed percent encoding without a recognizable room fails startup.

The hash is Tracker's existing `sha256-chain-v1` root, not SHA-256 of whole-file
bytes. A locked file uses its canonical encrypted-content root. Passwords, keys
and filenames never enter the file locator.

Opening a link selects the matching catalog entry, expands its ancestors and
shows existing actions. Multiple matching paths resolve by lexical entry ID.
Missing metadata is queried specifically by CID and retried while the page is
visible. No file bytes are downloaded automatically. After 20 seconds without
metadata the status says the file is unavailable; Retry restarts discovery and
Back to room removes only the locator. A known file without sources remains
selected with a waiting-for-seeder status.

Copy file link uses the clipboard and falls back to a selectable share dialog.
Share room constructs the room-only URL even from a file permalink. Links remain
in browser history; same-room fragment navigation updates selection without
changing keys. Navigation to another room reloads the app.

Every link contains the bearer room secret and therefore grants room access,
including other room resources and open-room collaboration. It is a resource
locator, not file-only authorization.
