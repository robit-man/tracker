# WO-01 degraded-mode boundaries

| Condition | Command outcome and recovery | Authority/data invariant | Executable validation |
|---|---|---|---|
| Agent grant absent/revoked | `AUTH_REQUIRED`/`PERMISSION_DENIED`; trusted local Settings approval is separate | Caller JSON cannot grant authority; ongoing agent capture stops on revocation | browser, boundaries, capture |
| Revocation while signing/encrypting | Pending publication rejects; same IDB transaction checks persisted grant revision | No signed-but-uncommitted catalog/source advertisement | boundaries: R03-async-revocation |
| No carriers / no source | `waiting_network`/`waiting_source`; worker released; observed availability resumes same authorized job | Offline listing/local upload/preferences remain available; no invented bytes | browser offline job; boundaries offline |
| Pause / close preview | Paused demand and durable bookmark/job; explicit resume required | Generation fences prevent a late callback from completing a cancelled job | transfer; media |
| Owning process killed | Encrypted job and acceptance receipt survive; source/password references can require renewal | Same operation/job, same locked upload key/nonce plan, one verified publication | restart, plain and locked, both engines |
| IDB quota/abort | Original structured error; no committed success receipt; retry preserves recorded outcome | Native file untouched; catalog/source state rolls back; cache deletion is atomic | boundaries; storage; core units |
| Damaged journal | `STORE_CORRUPT`; fail closed, do not replace identity or silently reset jobs | Schema/revision/generation and AEAD checks precede recovery | boundaries journal-corruption |
| Wrong source / damaged bytes | `CONTENT_INTEGRITY`; existing good source/cache retained | Final canonical SHA-256 chain required before complete/retained | boundaries relink; transfer; existing crypto/stream units |
| Wrong file password | `AUTH_REQUIRED`; authorized renewal and retry | Providers still see ciphertext; plaintext requires local unlock | boundaries locked files |
| Capture permission denied or picker pending | Principal-bound `input_required` interaction; native trusted consent or preauthorized MediaStream | No synthetic click bypass; stop releases worker and stops late returned tracks | capture; native screen regression |
| Disk permission denied | Principal-bound permission interaction; no destination truncation at import | Native source paths/passwords never in metadata results | boundaries native denied/output |
| Hidden additional room and capture | OS consent requires a visible native capture surface; room operations/byte IO still route through owned frame | A MessagePort does not grant browser/OS capture permission or transfer MediaStream support | bounded room/byte IO; capture interaction tests |
| Provider released/unavailable | Real RPC error and placement failure, never a fabricated retained copy | Global objects remain opaque; metadata and bytes acknowledged separately | storage; global-storage regression |
| Native lock callback rejects | Carry private outcome outside callback, then rethrow original RPC failure | Expected provider failure is still returned; no error swallowing | core lock unit; Firefox storage |
| Global/foreign cache clear | Refresh grant immediately at destructive boundary; current-room grant additionally checked atomically | Different IDB databases cannot share a transaction; no disk deletion or identity/catalog clearing | storage; browser-storage UI |
| No native destination writer | Disk-backed owner-local OPFS export when available; otherwise explicit 64 MiB Blob bound | Plaintext export is separate from encrypted room cache and visible to Browser storage clearing | native destination/output and storage accounting tests |
| Codec/CDN unavailable | Existing codec load failure/retry reports unavailable; no completed playback claim | Codec remains optional outside initial HTML; existing encrypted routes preserved | codec loader units; actual MP4/AVI browser regressions |
| Metadata/room/job/handle cap reached | `QUOTA_EXCEEDED`; acknowledge terminal jobs or release owned handles/rooms | Limits bound resources; they are not playback time targets | browser manifest/rooms; boundaries teardown; resources |
| Browser closes / eviction / disk loss | Running jobs recover from retained storage if available; no indefinite service promise | Browser storage persistence is conditional, not independent replicated durability | process-crash checks; documented limitation |

Private inputs and local encrypted journals remain in the authorized browser origin.
Explicit native/OPFS download exports can contain plaintext; the Privacy explanation
now describes that area and the agent binding. Relay operators still observe connection
metadata. Knowing a room/file invitation still grants that room's existing read capability.
