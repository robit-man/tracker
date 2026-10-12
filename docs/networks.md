# Room networks

The room uses independent rendezvous and transport adapters. Their status in
Settings → Room behavior & network details reflects actual connections.

| Network | Role |
| --- | --- |
| NATS | Encrypted rendezvous, byte relay and optional WebRTC signaling |
| MQTT | Independent encrypted control and byte relay fallback |
| Nostr | Independent encrypted control and byte relay fallback |
| WebTorrent / Trystero | Peer discovery and browser data channels |
| NKN | Independent routed overlay when direct privacy permits it |
| libp2p | Circuit-assisted browser discovery and WebRTC-upgraded peer transport |
| Waku | Encrypted room discovery, catalog, availability and retention controls |
| IPFS / Helia | Opt-in encrypted, content-addressed browser pins and Bitswap retrieval |

IPFS and libp2p share a transport stack; they are separate application roles,
not two wholly independent physical networks. Waku uses its own bootstrap peers,
Filter subscription and LightPush publication. It can bring up the room and
exchange libp2p addresses without the original carriers. Its queue is bounded
and replaces superseded presence/availability offers and state snapshots.
Targeted reverse kickoff has priority and cannot be replaced by ordinary presence. Media chunks, media
control tunnels and decoder demand never enter Waku.

libp2p control streams reuse the room’s signed envelopes. File/live binary frames
reuse the established authenticated binary sessions and scheduler. Frames are
length bounded, parsed across arbitrary stream boundaries and serialized with
backpressure. Byte-limited circuit connections are excluded from bulk route
selection; normal peers may upgrade to WebRTC. Privacy mode removes RTC
transports and accepts only relay circuit control streams. Toggling privacy
restarts the libp2p node under the new policy and preserves file sources and
existing media state.

Dependencies are version pinned and imported from public CDNs, as with the
existing single-file transport adapters. Public relay or CDN outages can leave
individual adapters degraded; no badge represents an availability guarantee.
The existing carriers continue running independently. Local pins survive reload
but serve only while their browser is open; public bootstrap nodes do not pin
users’ files for them.

Room uploads wait for local identity initialization before creating manifests or
catalog revisions. Discovery and availability can request a fresh catalog when
known sources advertise unknown files; requests are bounded to avoid reciprocal
loops. This also recovers a missed first hello across different carriers.

IPFS retrieval waits for a byte-capable connection to the signed locator's actual
provider, rather than treating any connected room peer as a block provider.
A targeted, authenticated presence request lets either end initiate the upgrade;
ordinary repeated presence preserves dial backoff. Saved locator addresses only
bootstrap unknown providers, so older records cannot overwrite live presence.
A pin is advertised only after its metadata is durable.
