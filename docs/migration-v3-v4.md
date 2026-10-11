# Migration and rollback

Production remains a single `index.html` deployable on GitHub Pages. Baseline
`5050998` / `2026-10-10-source-link-v95` is archived exactly at
`tests/fixtures/tracker-v3.html`. V4 keeps the application ID, action names,
rendezvous derivation, PBKDF2 parameters, AES-GCM AAD, room secrets and room DB
names. Existing links, content IDs and chunk keys are retained.

The room database stays at schema version 4. Existing `kv`, `files`, `chunks`,
`handles`, `downloadHandles` and `streamChunks` stores remain in place. V4 adds
encrypted KV records for actor pins, signed operation history and optional owner
policy history. Catalog, content descriptors and signed history commit together
in one transaction. An aborted transaction cannot persist a partial new catalog
checkpoint. Transient preview cache clearing retains the original behavior;
resumable download chunks and jobs are preserved.

A separate origin-scoped `robit-node-identity-v1` database persists an Ed25519
non-extractable private CryptoKey and raw public key. It is shared across rooms
and paths on the same origin. Other applications must implement the same identity
DB contract to use it; this change does not modify Box or Inference. Cross-origin
sites do not share identity. Clearing a room does not clear this global key.
Web Locks and a transaction recheck coordinate creation; simultaneous first-run
tabs without Web Locks were tested. Every startup self-tests the persisted key.

Old records stay unsigned and retain their original publisher metadata. Merely
loading or linking a local copy does not invent original authorship. New uploads
sign manifests and catalog revisions. Forwarded records preserve original proofs.
A signed manifest takes precedence over conflicting unsigned legacy claims for
its CID; subsequent signed descriptors are immutable. Stored failed proofs are
flagged unavailable and invalid operation records retained separately in encrypted
`rejectedV4Records` and retried at later startups; existing local files are not wiped.

In an open room, unknown unsigned actors retain v3 interoperability and are
classified unverified. Once an actor is authenticated, unsigned messages cannot
use that actor. V4 metadata is additive to the old JSON projection; v3 readers
ignore the extra fields, so no duplicate dual broadcasts are needed. Binary
packets remain legacy-compatible for unknown v3 recipients. Modern peers instead
require session MACs. A failed signature never activates an unsigned fallback.

Native Ed25519 absence exposes `legacy-only: Ed25519 unavailable` in advanced
node diagnostics. Local legacy storage and unknown legacy peers remain usable;
signed-peer verification requires native algorithm support. A corrupted or
unavailable identity record is retained, not silently replaced. Previously pinned
actors cannot send unsigned controls when their key is unavailable. If the global
identity DB has actually been deleted and a new key created, Tracker allocates a
new room actor when necessary and indicates the provenance change. Previous
signatures retain their original author.

Protected mode is explicit through `TrackerSecurity.protect()` in browser console.
It pins the current verified node as owner and returns an anchored invite. Public
node IDs appear in `TrackerSecurity.diagnostics()` and `.peers()`. The owner can
issue `.grant(nodeId, ['read','write'], expiryMilliseconds)` and `.revoke(nodeId)`.
These methods publish signed, chained policies; they do not rotate room secrets.
Unsigned remote catalog records are rejected in protected mode. Historical local
files remain accessible, but unsigned legacy publications cannot acquire verified
provenance automatically. Losing the owner's key means losing its signing
authority, not transferring ownership to the next peer. Concurrent owner policy
updates should use one tab where Web Locks are unavailable; conflicting same-epoch
revisions fail closed and require the owner to reconcile the policy history.

## Rollback

For an emergency UI/wire rollback, restore the archived baseline to `index.html`
and deploy it. The unchanged room schema and compatibility projections allow v3
to read stored catalogs and cached downloads; the browser migration test exercises
that DB contract. Leave the identity DB and additive KV records in place. V3
ignores them. Do not delete room data or rotate secrets to roll back.

A **security rollback is not equivalent**: v3 does not enforce signed operations
or protected policies and accepts room-bearer writes. Protected rooms must remain
on v4 for those guarantees. Avoid using an old client to mutate a protected room.
Returning to v4 restores its pinned policy; old unsigned changes cannot become
trusted signed records. Deploying the baseline also lacks v4 file-link parsing,
so distribute room-only URLs during an emergency rollback.

Validation commands and actual coverage gaps are in `tests/results.md`.
