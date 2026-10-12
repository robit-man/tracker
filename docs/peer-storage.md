# Free peer retention

Storage contribution is optional and initially off. Enable it in Contribute
storage, choose an allocation and preference, then save. Allocation is limited
by the browser's quota. Persistent requests durable browser storage; the browser
may decline. All current modes accept free room requests while seeding is on.

Use Keep available on a file to request one, two or three whole-file replicas for
7, 30, 90 or 365 days. A local copy counts toward the requested target. Providers
appear only after advertising an authenticated offer in this room. Statuses
report queued, fetching, ready, declined, error or released. Ready means the
complete canonical chunk chain matched the file's immutable root.

Retention reuses the normal encrypted acquisition and cache. Password-locked
files can be stored and served as ciphertext without unlocking. The catalog and
existing seed policy are preserved. Local disk uploads can be copied into the
durable encrypted cache so they remain usable after the original File object is
gone. Partial retention jobs resume only through the opted-in retention queue.

Offers expire when a provider stops reporting. While a placement request is
active, another available provider can be asked to replace a departed source.
Requests are best effort and require a remaining source to supply the bytes.
Free retrieval works while participating browsers keep the room open; it does
not create an unattended storage service or guarantee retention after eviction.

Turning contribution off pauses its work and removes only seeds that retention
enabled automatically. Release retention keeps cached bytes and preserves manual
seed choices. Ordinary user downloads remain independent of contribution.

## Control extension

The existing authenticated control envelope carries `storage-query`,
`storage-offer`, `storage-pin` and `storage-status`. Offers contain bounded
capacity/free-byte counts, storage preference, retained content IDs and a short
liveness expiry. Pins contain a canonical content ID, duration and
`storageProfile`; the generic `profile` field remains reserved for peer identity.
Status updates are accepted only from providers belonging to a known request.
Old clients ignore these extension types and continue normal file sharing.

All storage and retrieval are free. No x402 or other payment service is required
or contacted. Future payment integration should extend placement negotiation
without changing file identity, chunk verification or the transport routes.

## Unavailable listings

Each file with no live seeder and no known retained copy receives a seven-day
orphan deadline in a signed catalog revision. Peers replicate that deadline;
visiting or refreshing the page does not reset it. Existing listings without an
observation receive a fresh window. A verified local cache, a live seed, a local
IPFS pin or a confirmed retention period protects the listing.

The file card shows its countdown. In the final 24 hours, **Link local source**
verifies a chosen disk file against the immutable content root and resumes
seeding. **Let expire** acknowledges the prompt without shortening the deadline.
Before deletion, the browser queries sources and retention again and waits for
responses. Offline browsers, read-only members and pending source verification
cannot erase a listing. Expiry publishes a signed tombstone, preserving catalog
history; a returning verified source can restore an automatically expired item.
Manual deletions remain deleted.

When a previously linked File object is lost on reload, its relink action uses
the same reduced-motion-aware pulse as paused media. A wrong file does not clear
the cue. Restoring a matching source or a verified persistent handle clears it.

## IPFS copies

File inspector → Settings provides **Pin encrypted copy**, **Retrieve IPFS
copy** and **Remove IPFS pin**. The Helia browser node stores room-encrypted raw
blocks and a room-encrypted block index in separate persistent IndexedDB stores.
The private room distributes an independently signed locator. IPFS receives no
plaintext file bytes, index or filename. Password-locked content keeps its
canonical ciphertext inside this additional room encryption.

Retrieval verifies each IPFS block digest, decrypts the index and chunks, and
checks the complete canonical file root before marking a local source ready.
Another member can retrieve, verify and pin its own encrypted copy. Removing an
IPFS pin releases that pin’s blocks without deleting the ordinary verified file
cache or disk source. Browser persistence is subject to browser storage policy;
no external pinning company or paid retention service is configured.

An active pin advertises the configured retention period to room peers, which
protects the listing through that period even if the browser disconnects. The
local pin remains until explicitly removed. The node serves while the room is open. Public circuit relays can impose small
byte quotas; those paths are suitable for control traffic. Ordinary mode uses
WebRTC upgrades where possible for Bitswap and the existing media scheduler.
Relay-only privacy disables RTC transports entirely; IPFS providers still need
a reachable byte path, while normal file/live transfer retains the established
relay routes. Closing all providers does not create public offline retention.
