# Tracker v4 protocol

## Identity and encoding

`robit-node-identity-v1` is an origin-scoped IndexedDB database with an `identity`
store and `node` record. Identity version 1 uses WebCrypto Ed25519. Its private
CryptoKey is non-extractable and persisted by structured clone; its public key
is 32 raw bytes. `nodeId = 'n-' + hex(SHA256(UTF8('robit-node-v1') || publicKey))`.
A transaction rechecks the record before installation; Web Locks additionally
coordinate supported browsers. Each startup signs and verifies a random local
challenge. A corrupt record is retained and never silently replaced. Unsupported
Ed25519 or failed storage is visibly classified in diagnostics as unsigned or
unavailable; an already authenticated actor cannot send unsigned messages.

Canonical encoding is the `robit-json-v4` subset of RFC 8785: UTF-8 JSON,
recursively sorted UTF-16 object keys, preserved array order, ECMAScript JSON
string/number serialization, no Unicode normalization. Nonfinite numbers,
undefined values, unpaired surrogates and prototype-related property names are
rejected. Maximum nesting is 32 and traversal is limited to 200,000 values.
Golden vectors and tampering tests live in `tests/v4-crypto.test.cjs`.

## Signed control envelope and old readers

The existing v1/v2/v9/v11 JSON projection remains on the wire, encrypted with the
unchanged room AES-GCM key and `ctl` AAD. An additive `auth` member is the distinct
protocol-4 envelope header. This avoids duplicate messages and makes old readers
ignore the new metadata while upgraded readers enforce it.

The header contains `protocol:4`, `algorithm:'Ed25519'`,
`domain:'robit-tracker-control-v4'`, exact `roomHash`, `actor`, full `nodeId`,
base64url raw `publicKey`, `mid`, `ts`, `expiresAt` and `signature`. The signed
bytes are `canonicalEncodeV4({...headerWithoutSignature, body:projectionWithoutAuth})`.
Thus every projection property, including version, actor, type, recipient, route,
session, filename and control body, is covered. The body is reconstructed rather
than duplicated on the wire. Base64url encoding has no padding.

`openSeal` is the common encrypted-control verification boundary for direct
Trystero, NATS, NKN, relays and BroadcastChannel. It checks framing (8 MiB encoded
packet limit), shape, canonical limits, room and sender context, key-derived node
ID, signature, freshness, replay and persisted actor binding before dispatch.
Signed lifetime is at most 120 seconds with 30 seconds of clock skew. The bounded
replay cache uses `nodeId|mid`; catalog safety additionally uses persisted signed
revision identities. A failed signature never falls back to legacy parsing.

Room-local UUIDs continue to identify routes and jobs. Actor-to-node pins are
encrypted in room KV state. First verified claims pin keys: this establishes
continuity and possession, not a real-world human identity or owner authority.
Signed claims cannot take over an existing pinned actor or authenticated route.
Unknown unsigned actors in an open room are explicitly `legacy-unverified`.
An unsigned message from a pinned actor is rejected.

## Durable records

New content descriptors carry a detached `proof` in the
`robit-tracker-manifest-v4` domain. Catalog entries carry a detached proof in the
`robit-tracker-catalog-v4` domain, plus `operationId`, `previousRevision` and
`operationAt`. The proof includes protocol, algorithm, domain, room, actor, node
ID, public key and signature. Signed bytes are the canonical proof header and
complete record body without `proof`. Existing fields are compatibility
projections; original authorship travels with every forwarded snapshot.

Manifests retain the canonical encrypted or plaintext `f-<root>` identifier and
`sha256-chain-v1` dimensions. Content descriptors are immutable. Unsigned
metadata never receives invented publisher signatures on upgrade.

Signed revisions wait for known predecessors; snapshots include original
operation history. A legacy predecessor is an explicit migration boundary.
Conflict order uses verified Lamport values and actor IDs, with operation ID as a
final tie breaker. Two different operations claiming the same entry/author/
counter slot are rejected. Replayed old adds cannot resurrect a newer signed
tombstone. Catalog, manifests and revision history persist in one transaction
in the existing room `kv` store; the room schema stays version 4.

## Trust limits

Open rooms remain `open-write-by-room-capability`: anyone possessing the link can
contribute. Signatures identify writers and prevent impersonation; they do not
make invited writers reputable. Legacy accepted mutations have no asymmetric
authorization guarantee. Room encryption protects against parties without its
secret, while same-origin malicious scripts can invoke a non-extractable key.

The original sequential hash chain proves the final file, not independent
inclusion of randomly fetched chunks. Streaming chunks remain provisional with
respect to the final root until the chain is complete. Existing source checking
and final cached-download verification remain necessary.

Specifications: [Web Cryptography Level 2](https://www.w3.org/TR/webcrypto/) and
[RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html).

## Protected owner policy

Ordinary rooms remain open. Explicit `TrackerSecurity.protect()` pins the local
verified node and creates an owner-signed genesis; protected invite URLs carry
`/a/n-<full fingerprint>`. A previously stored owner pin survives a bare URL.
A conflicting supplied anchor stops initialization rather than replacing trust.
Receiving an unsolicited policy cannot opt an open room into protected mode.

Policy records contain `{protocol:4,roomHash,ownerNodeId,actor,epoch,revisionId,
previousRevision,createdAt,grants,proof}`. Each grant contains `{subjectNodeId,
permissions,expiresAt,nonce}`. The policy signature uses the durable record
encoding with domain `robit-tracker-policy-v4`. Epoch 1 requires a null previous
revision; later epochs require the exact known predecessor at epoch minus one.
Missing links wait in a bounded pending cache, and conflicting same-epoch records
are rejected. `policy-query/result` supplies the original owner-signed chain.
Policies and owner pins persist encrypted in the existing room KV store.

All signed bearer readers can receive and seed content. New incoming catalog and
manifest records require current unexpired write permission; live publication
controls do too. The owner has write authority directly. Only that owner publishes
grants or revocations. `moderate` is reserved and does not imply delegated policy
signing. Grant/revoke updates replace the grant set, advance epoch and bind the
prior revision. Durable record proofs also include their publication policy epoch.
Historical accepted local records are retained after revocation; remote admission
checks current policy. Offline peers cannot enforce an unseen revocation.
Confidentiality revocation/key rotation is outside this protocol.

## Binary and live session authentication

Each runtime generates ephemeral native X25519 (when available) and P-256 ECDH
keys plus a random nonce. Nonextractable private keys remain in memory. The signed
control body's `binarySession` is `{version:1,nonce,keys:{X25519?, 'ECDH-P256'}}`,
with base64url raw public keys (32 or 65 bytes). Both endpoints prefer X25519
when both descriptors support it, otherwise P-256. Invalid keys fail closed;
there is no fallback after a failed authenticated key agreement.

The canonical session context is `{domain:'robit-tracker-binary-session-v4',
roomHash,algorithm,endpoints}`. Endpoints contain `{actor,nodeId,descriptor}` and
are sorted by deterministic UTF-16 comparison of their canonical strings.
The session ID is SHA-256 of that canonical context. ECDH yields 256 bits imported
as HKDF input. HKDF-SHA256 uses UTF-8 roomHash as salt and canonical
`{...context,from,to}` as info, deriving a nonextractable 256-bit HMAC-SHA256 key
for each direction. Runtime nonces prevent reuse across reloads. Transfers bind
recipients by signed actor + transfer SID + runtime nonce, so simultaneous tabs
sharing a persistent room actor do not exchange recipient sessions. Direct routes
also retain their verified runtime nonce.

Binary metadata carries `nodeAuth = {version:4,session,from,to,senderSession,
recipientSession,seq,mac}`. MAC input is
`canonicalEncodeV4({domain:'robit-tracker-binary-v4',roomHash,
...nodeAuthWithoutMac,metadata:coreMetadata}) || encryptedPacketBytes`.
Core metadata excludes `nodeAuth`, `relayActor`, `relayPlane` and `txPath`.
These transport annotations are routing observations, never signed publisher
provenance; an authenticated direct route takes precedence over a claimed relay
actor. CID, transfer SID, chunk index/dimensions, seek epoch, seed wrapping and
live publication fields remain covered. A receiver verifies before decrypting
file/live payload or changing transfer state. Each complete packet has one MAC;
all redundant carriers share that packet/sequence and dispatch it once.

Replay tracks a 2048-sequence out-of-order window per runtime pair, rejects seen
sequences and older packets, and rechecks after async MAC verification. A MAC
for another recipient, runtime, transfer or payload fails. Binary relay fragment
wrappers are room-encrypted framing only; they cannot announce peer identities.
The complete assembled packet is authenticated at its destination. Framing
bridges remain bounded and cannot claim payload authorship. Control relay
fragments remain signed; their original assembled control is verified again.
Live announcements/signaling are signed, and live byte paths use the same MAC
boundary without Ed25519-signing each frame.

Unknown v3 actors in open rooms retain legacy encrypted binary interoperability.
A pinned v4 actor requires a valid session MAC, and protected rooms reject
unauthenticated legacy payloads. Control budgets allow 256 burst / 64 messages
per second per claimed actor; binary framing has separate existing bounded
reassembly budgets. State and targeted metadata are paged in batches of 128,
with separate paged availability for large catalogs. MAC overhead is constant
per complete packet and independent of file chunk count.
