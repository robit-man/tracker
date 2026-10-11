# Security model and remaining exposure

## Assets and authority

The 192-bit room secret is a bearer capability. PBKDF2-derived AES-256-GCM protects
room traffic and persisted KV values from parties without that secret. Anyone
holding a room or file URL can discover and decrypt that room. File passwords
protect separate encrypted content and metadata; they are not part of links.

Ed25519 keys identify a node and attribute signed actions. Node IDs are full
SHA-256 fingerprints with an explicit domain prefix. Non-extractability prevents
ordinary private-key export; it does not prevent malicious same-origin scripts
from using the key. Origin identity does not prove a human name or reputation.

Default rooms are open-write-by-room-capability. Any invited node can publish its
own records. Protected mode pins an independently supplied owner fingerprint,
verifies its key and policy chain, and checks current unexpired write grants.
Readers can download and seed verified content. Only the owner issues policies;
`moderate` is reserved metadata and does not delegate authority in this version.

## Adversaries and mitigations

- A room member forging another actor: controls bind the complete canonical body
  to its key, room and actor; persisted actor pins and route continuity reject
  substitution and unsigned downgrade. First contact establishes key continuity,
  not preexisting ownership. Protected owner identity comes from the invite/local
  pin, never an arbitrary first-seen founder claim.
- A forged snapshot or deletion: embedded manifests and original catalog
  operations are verified independently; signed counters, causal predecessors,
  revision slots and tombstones prevent unsigned version takeover and old-add
  resurrection. Authorized writers can still make unwanted changes under the
  room's collaboration semantics.
- A malicious relay or room member altering binary media: signed ephemeral key
  descriptors bind node and runtime sessions. X25519 or native P-256 ECDH with
  HKDF derives directional HMAC keys. The complete encrypted packet, transfer
  metadata, CID, recipient, runtime nonces and sequence are authenticated before
  file/live handlers. Multipath duplicates dispatch once; bounded out-of-order
  packets remain valid. Transport annotations are not publisher provenance.
- A malicious seeder signing incorrect bytes: attribution is not correctness.
  Source-link validation and complete-file hash-chain verification remain intact.
  A root mismatch prevents completion and seeding of a cached download. Streaming
  bytes are provisional until the complete chain verifies. Independent random
  chunk inclusion proofs/sidecars are deliberately deferred.
- Replay and flooding: signed controls have bounded lifetime/skew and a bounded
  replay cache that refuses admission rather than evicting fresh replay evidence.
  Control admission is token-bucket bounded per claimed actor (256 burst, 64/s,
  at most 4096 buckets). Actor pins, key caches, sessions, packet sizes, arrays,
  password KDF iterations, file counts, revision histories and parent traversal
  are bounded. Binary MAC replay windows are 2048 sequences. Room bearers can
  still deny service through valid traffic, Sybil identities and network floods;
  these limits reduce exposure, not provide resource isolation.
- Stale owner policies: an anchored chain advances by exact predecessor/epoch;
  forks, forged grants, expired writers and revoked writers are rejected on new
  remote record admission. Previously accepted local history remains visible.
  Offline peers cannot learn revocations they have not received. Signed grant
  revocation does not revoke already learned room decryption keys or cached bytes.

## Browser and dependency boundary

Peer filenames, names, aliases and metadata are escaped before HTML insertion;
new locator status uses textContent. Peer profiles have bounded aliases and hex
colors. Local folder rendering and incoming parent validation have depth/cycle
limits. Blob previews retain their existing rendering stack; PDF, model and
media parsing remain browser/library attack surfaces requiring current browsers.

Signing and session crypto use native WebCrypto, with no new crypto CDN library.
Existing dynamic dependencies remain explicitly version-pinned: Trystero 0.25.4,
NATS 3.4.0, NKN 1.3.6, MQTT.js 5.15.2, nostr-tools 2.25.2, MP4Box 2.4.1,
Three.js 0.180.0, OCCT 3.8.1 and the existing FFmpeg/WASM pins. CDN fallbacks,
transitive ESM imports and WASM remain supply-chain trust boundaries. No SRI/CSP
protection is claimed for those imports. A blanket CSP was not imposed because
inline code, blob workers and existing preview routes require a separately tested
policy. Self-hosting dependencies and deployment-specific CSP/SRI remain follow-up
hardening work; adding authentication does not eliminate that risk.

Browser history, extensions, clipboard access, endpoint compromise and malicious
same-origin JavaScript can expose room capabilities or act with the signer. HTTPS
and a secure browser are required. Protected confidentiality revocation would
require a separate room-secret/epoch rotation and grant distribution protocol;
v4 never silently rotates existing rooms.
