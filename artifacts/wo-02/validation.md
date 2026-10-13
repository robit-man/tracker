# WO-02 validation

Status: **PASS**. Build: 2026-10-13-agent-surface-v111.
HTML SHA-256: `47b92841d32dcab2f82ffd49965bba1f8f2af94ab638e56302c2dded20155f21`. Exact-source archives are verified by gate.json.

Runtime: v24.14.0; Chromium 156.0.8078.4; Firefox 157.0; Playwright 1.64.0.
Primary feature observation: 2026-10-13T21:29:28.240Z through 2026-10-13T21:30:18.988Z. Every artifact records its own UTC start/end, browser and source digest. Commands and dependency installation are in [run.md](run.md).

| Requirement / case | Implementation symbols | Executed evidence | Result |
|---|---|---|---|
| WO-02-R01 | TrackerAgent; agentInitSurface; generated tracker-agent-discovery | A01-discovery; static generator; both browser suites | PASS |
| WO-02-R02 | Shared commandRegistry/commandDispatchOperation; native input and permission adapters | 49-group action inventory; core/boundaries/storage/capture/media regressions; A01 examples | PASS |
| WO-02-R03 | agentDescribeDescriptor; agentResultSchema; commandValidate | 322 unit cases; all successful runtime results validated; sorted 95-descriptor parity | PASS |
| WO-02-R04 | agentParseResource; agentListResources; agentReadResource | All five resource families; owned-room forwarding; URI negatives; process-stable file URI | PASS |
| WO-02-R05 | scripts/generate-agent-manifest.mjs; public-interface-only JSON | Hermetic regeneration; unauthorized discovery/resources; HTTP source/canary scans | PASS |
| WO-02-R06 | agentCheckMetadata; commandPage; agentAccessRevision; agentCanReadPlain | A03 250 signed folders plus real file aliases; projections/dedupe; stale grant cursors; locked read replay | PASS |
| WO-02-R07 | agentEventRequest; agentWindowMessage; agentCreateBinding; agentCloseBinding | A05 native cross-origin File/bytes, duplicates/forgeries/sibling denial; binding SIGKILL/reconnect; A08 | PASS |
| WO-02-R08 | system.state/health; commandSafeError; agentSurfaceUsage | A04 missing source/offline recovery; blocked reasons; authorization snapshots; bounded counters | PASS |
| WO-02-R09 | agentExampleSource; agentMarkdown; agentUnpack | A01-examples executes every helper including actual global pin and peer download; generator checks drift | PASS |
| WO-02-R10 | agentRegisterNativeTools; registration AbortSignal | A06 absent native API plus observing adapter; 95 real schemas/callbacks, denied and aborted execution | PASS |
| WO-02-R11 | agentPage; agentInitSurface; commandAccessDialog focus; wrapping CSS | A07 both themes/four widths; 100 native cycles; native Enter/Tab/Escape and unauthorized inspector | PASS |
| WO-02-R12 | commandDispatch dataOrigin; commandFile provenance; resource/byte/state origin labels | A02 prompt filename/key/path/secret canaries; locked retry; A05 no eval/JSON identity | PASS |
| WO-02-A01 | Public manifest → actual semantic calls | Both agent-acceptance reports: discovery and every documented example | PASS |
| WO-02-A02 | Signed data/provenance, scope and unlock boundaries | Both agent-acceptance reports plus URI/budget/unlock unit cases | PASS |
| WO-02-A03 | Normal signed publication; stable projected paging | Both agent-acceptance reports: 250 folders plus real content/aliases, no omissions/duplicates | PASS |
| WO-02-A04 | Independent encrypted peers and consenting provider | Both agent-acceptance and storage/core/media reports; byte hash, retention, source-away recovery | PASS |
| WO-02-A05 | Native Window/CustomEvent bridge; private authority bindings | Both agent-acceptance reports; exact origin/source/nonce, sibling/room/script negatives, one effect per retry | PASS |
| WO-02-A06 | Feature-detected browser-native registrations | Both agent-acceptance reports; observer is registration instrumentation, not a native-feature success claim | PASS |
| WO-02-A07 | Native dialog and labeled responsive module | Both keyboard and agent-acceptance reports; eight layouts, screenshots, keyboard/focus | PASS |
| WO-02-A08 | Bounded request caches/listeners and owned-context teardown | Both agent-acceptance reports plus equivalent published-baseline/candidate 100-cycle resource workload | PASS |

The gate requires all 20 current-source reports plus detailed acceptance IDs and archive hashes. Browser requests use real handlers with output-schema validation. The optional WebMCP observer records registrations and invokes their real dispatcher callbacks; it does not emulate an external MCP server or prove browser-native availability.

The published WO-01 baseline is e1fd8f8023563f861d695d657ab276f89a5a2126e634faa3ee5ccc8362b760fc, commit 744b5c8274b7e4f63409309196b10e3bd76126d4. Its completed evidence is unchanged. prerequisite-live-wo-01.json is an unintercepted deployed-source/peer-transfer prerequisite, not evidence of this candidate being deployed.

Equivalent 100-cycle owned room teardown: baseline retained heap growth 11600844 bytes and RSS growth 209362944; candidate 7704348 and 214151168 bytes. Final event-loop delay mean/p99: baseline {"mean":0.10500000044703484,"p99":0.20000001788139343}, candidate {"mean":0.09250000044703484,"p99":0.20000001788139343} ms. Both finish with no unhandled errors; candidate has one owned current room, no queued jobs or retained iframes, and 128 bounded command events. These are observed workloads, not a years-long or 24-hour stability claim.

Each browser also performs 1,000 correlated discovery/event calls, leaves active event work at zero, bounds remembered replies to 128, preserves listener counts through 100 consent cycles and leaves an owned child room. Independent process SIGKILL tests preserve the signing identity, original child job, verified 1,100,000-byte payload and stable resource URI; policies restore disconnected and revoke without a live client.

MP4 regressions drop an actual decoder-front chunk, recover it over encrypted relays, and observe advancing decoded frames. Once kicked off under adequate supply, SAFE remains above the measured dynamic lower band; native close pauses demand, reopening resumes the bookmark and a far seek advances playback. Real source-away and offline fixtures separately verify waiting/recovery rather than treating an outage as successful playback.

Storage keeps existing DB version 4 and encrypted command envelopes. New message-binding schema 1 records share the persisted parent grant and individual policy revision fence. Windows/nonces are ephemeral; reconnect requires local approval. Revoked policies/receipts are pruned with a bounded archive; completed content and parent-manageable jobs survive. Concurrent-tab disconnected approvals restore within the archive ceiling instead of incorrectly applying the eight-new-binding admission cap to reload.

Comments beside the public foundation, byte/schema budgets, resolvers, examples, optional registration, event/window binding, policy loader/pruning and revocation carry WO-02/Rnn tags. Reused command and native-consent algorithms retain their WO-01 comments. No new keys, crypto primitive, unsigned publication path, service, container or CUDA workload was added.

Limitations: this is the browser JS/event surface, not an external MCP server. Same-origin scripts remain outside the binding isolation claim. Capture/disk permission needs browser/OS consent; native streams in regressions are generated fixture media. DOM accessibility semantics and real keyboard focus are tested; no physical screen-reader user session is claimed. Browser eviction, disk loss or explicit clearing can remove local persistence. Input and result metadata stay bounded; consumers stream large content through byte ranges.

Intermediate failures are not passing evidence. diagnostics/ retains representative catalog-alias/serialization harness errors and the Chromium crash-fixture rAF timeout. The latter was fixed with interval polling for an offscreen iframe; the nonce was delivered and no application exception occurred. Other intermediate code fixes include response-envelope flattening, using the canonical root for file links, post-IO authorization, principal unlock invalidation and correct binding result schemas. Only this final exact-source gate establishes completion.
