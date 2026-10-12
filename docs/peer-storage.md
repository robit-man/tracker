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

## Global contribution and collective shards

Contribute storage → Contribution scope offers **This room** and **Global mesh**.
The two consents and allocations are independent. Global contribution defaults
off; its anonymous offering defaults on. Once enabled, it remains available
while the browser visits any room under the same deployment base URL. Stored
objects and the provider’s pseudonymous signing identity persist in a separate
IndexedDB database. A single elected tab serves that database; another open tab
takes over when it closes, so capacity is not counted repeatedly.

The Global storage index lists live providers grouped into collective shards,
and sums their advertised capacity and free space. Each of the sixteen v1 shard
IDs (`00`–`0f`) can contain many providers. Automatic assignment is stable for a
provider; an operator can also select a shard. Shard URLs are deployment-relative:

```
https://robit-man.github.io/tracker/storage/
https://robit-man.github.io/tracker/storage/s/00/
```

The GitHub Pages 404 entry redirects these deep paths through the application
and restores the shard address. A private room fragment, when present, stays in
the fragment. Opening a public index link does not grant access to a private room.

**Keep available → Global mesh** requests one, two or three encrypted whole-file
replicas from any participating room. Placement uses available bytes, pending
reservations, active provider work, shard pressure and recent failures. It spreads
replicas across different shards when possible and tries other providers when a
placement fails. Browser quota bounds reservations; expiry releases both metadata
and ciphertext. Incomplete abandoned reservations are reclaimed after an hour.

The source must already have a verified local file or completed download. Each
canonical chunk receives an additional room AES-GCM envelope with a fresh nonce
and an opaque object/index context. Providers see random object IDs, ciphertext
lengths, retention deadlines and a separate global pseudonym. They receive no room
secret, room hash, catalog, filename or canonical content root. A provider commits
a copy only after all chunks and their ciphertext chain match. Only then does the
uploader publish a separately signed locator **inside the private room**.

A room member can retrieve using Global storage index → This room’s global copies
or the file inspector. A missing ordinary source also offers this path through
Download and Play. Retrieval checks AES-GCM authentication, chunk boundaries and
the complete immutable file root before enabling local seeding. The current global
retrieval path acquires and verifies the complete copy before local playback.

The global namespace is derived from the canonical deployment base URL. Separate
sites, project paths, ports and origins have independent directories, identities,
contribution settings and recent-room histories. The Room navigation stores up to
twenty recent private room links locally, with a remove action for each entry.

### Global transport and privacy

The global directory and addressed inboxes use the existing pinned NATS, MQTT and
Nostr adapters on separate deployment-scoped topics. Requests and responses carry
Ed25519 signatures bound to the deployment namespace, sender, recipient, timestamp
and body. Bounded fragments, replay suppression, sequential idempotent writes and
acknowledged retries carry bulk ciphertext over these relays. Relay connections
remain independent of the current room’s transport lifecycle.

Anonymous offering never initiates or accepts direct peer signaling. Disabling it
allows a WebRTC byte route with another participant who also allows direct routes;
the existing room privacy policy still applies. Broker routes remain available as
fallback. Relay-only mode hides network addresses from other peers, while relay
operators necessarily see their own connections. A stable pseudonym and traffic
metadata are visible; this is not an anonymity network against relay operators.

Capacity totals are live, self-reported offers, not verified physical disk totals
or a promise of unattended service. A closed browser stops serving, and browser
storage may be evicted. Confirmed global retention deadlines protect private room
listings from orphan expiry, just like room-scoped retention. All storage and
retrieval are free; no payment or external provider service is contacted.
