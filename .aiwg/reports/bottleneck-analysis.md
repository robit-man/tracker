# Browser lifetime failure modes

| Failure | Direct evidence | Repair |
|---|---|---|
| Waku SDK retained duplicate dials/pings | Actual SDK: 10,000 duplicate requests retain 9,999 queued jobs even after stop | Per-peer single-flight, 32 unique pending-peer ceiling, generation admission and one physical ping |
| NATS reconnect heartbeat ownership | Deterministic repeated-close fixture accumulates intervals before repair | One connection owner; close/stop release timer; starts coalesce |
| Nostr permanent event history and pending publication | Actual pinned SDK retains all 250,000 IDs; repaired adapter retains at most 2,048 | Bounded ID history, connected-relay publication, physical pending count/bytes |
| MQTT/NKN and route callbacks | Never-settling native-send fixtures retain work without physical admission | Byte/count credits retained until actual settlement; persistent close disposal |
| Live/media/model and lifecycle callbacks | Blocked send, missing init and stale async callbacks retain or revive stopped work | Byte budgets, recovery epochs, disposal, generation fences and idempotent suspend/restore |
| MSE quota retry storm | Healthy-link ETV trace repeatedly retries a rejected append, thousands of observed quota events | Retry only after measured native capacity frees, bounded append journal, cold-start and regrowth recovery |

SAFE above its advisory high band is intentional while useful native capacity
remains. The acceptance checks are the dynamic lower band, playback continuity,
bounded physical buffers/queues and quota retry gating; no arbitrary playback
horizon was introduced. Natural-GC heap peaks are not treated as retained leaks.
