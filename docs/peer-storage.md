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
