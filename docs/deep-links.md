# Room and file links

Tracker creates or joins a room automatically. **Share room** copies a room-only
URL. **Copy file link** on a file row copies its immutable content locator. A
failed clipboard operation opens the existing selectable share dialog and local
QR code. Opening either URL joins automatically, without identity setup.

```
https://robit-man.github.io/tracker/#<48-hex-room-secret>
https://robit-man.github.io/tracker/#<48-hex-room-secret>/f/<64-hex-root>
```

The root is Tracker's `sha256-chain-v1` root, not SHA-256 of the entire file bytes.
Internally the content ID remains `f-<root>`. Root hex is normalized to lowercase;
the room secret retains its exact case and original encoded custom-room behavior.
Fragments are decoded once. Invalid reserved `/f/` or `/a/` paths produce an
Invalid file link state; a recognized room prefix retains its existing room and
DB. Malformed links without a usable room prefix stop initialization.

Only the parsed room secret feeds PBKDF2, roomHash, encrypted swarm discovery and
`robit-private-tracker-${roomHash}`. The file suffix never changes these values.
Both URL types connect to the same room. Deployment paths and existing URL query
parameters are preserved. Names, folders, passwords and signing keys never enter
the generated locator. Custom non-48-hex rooms remain usable but cannot generate
this particular file URL format.

Resolution first checks local manifests and catalog entries, then requests
bounded `content-query`/`content-result` metadata. Original signatures and policy
permissions are checked before merging received records. Matching entries are
selected deterministically by ID, their ancestor folders expanded, and the row
scrolled into view. Renames and moves preserve the content locator. With a known
manifest and no catalog path, a temporary resource row provides the existing
file actions; it is never persisted as a catalog operation.

The status moves from Finding file to File located. Indexed content without a
live source reports waiting for a seeder. After 20 seconds without metadata it
reports File not available in this room; Retry and subsequent peer discovery
continue to resolve it. Back to room removes the file locator. No file download
or playback is triggered automatically. Interrupted transfers retain cached progress. A final root mismatch reports
Content verification failed, penalizes the contributing paths and discards that
corrupt file cache so a retry can fetch new bytes; other room data is retained.

Locked links address the canonical **encrypted** content root. Public names stay
scrambled, MIME stays generic and real metadata remains encrypted. The existing
password controls still require the correct password, which is never embedded
in the link. A permalink containing the room secret grants access to the entire
room; it is not file-only authorization.

Protected invites use an independently selected owner anchor:

```
#<48-hex-room-secret>/a/n-<64-hex-node-id>
#<48-hex-room-secret>/a/n-<64-hex-node-id>/f/<64-hex-root>
```

Share room and Copy file link preserve that anchor. Received public keys and
signed policy chains must match it. An existing local pin takes precedence over
an invite attempting to replace the owner. Removing the anchor from the address
bar does not remove the stored protected policy. Ordinary room URLs retain the
open collaborative default.

Global storage routes use `/storage/` and `/storage/s/00/` beneath the deployment
base. These public routes contain no room capability. Navigation from a private
room preserves its fragment locally; generated room/file links return to the
base application URL. The GitHub Pages 404 entry supports direct shard visits
and refreshes. Recent rooms are stored per base URL and can be removed individually
from Room navigation.
