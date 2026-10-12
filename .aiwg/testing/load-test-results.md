# Browser lifetime load tests

Build `2026-10-12-runtime-lifetime-v104`; 262/262 unit tests pass.

| Run | Start UTC | Sustained interval | Source SHA-256 |
|---|---|---|---|
| Unmodified v103 | 2026-10-12T19:01:57.548Z | 3900.1s | `5f0acc2a75f119d52f187777cf2af63b40f305771732362a73019e4230863ff7` |
| Patched core | 2026-10-12T19:23:02.287Z | 3900.1s | `2dae4f22af00e4865ee052edf1a7af8e9e2c05f24c5380a6a04b7d1c54bfab50` |
| Native quota followup / controlled RTC | 2026-10-12T19:43:02.291Z | 1800 one-second samples | `778d7c3f976917a1604bde511487d638fa3f4d144d38593a9137b0e244f9200d` |
| Validated v104 / screen followup + pending day soak | 2026-10-12T19:54:14.605878+00:00 (day run) | Screen 30min; day test still PENDING | `5ddf1d2d565781d867faf0082a041bfddf052424e3e100378f1ce34737f15bd2` |

| Run / Chromium scenario | JS heap min / max / final (MiB) | Active intervals min–max | Active WebSockets min–max |
|---|---|---|---|
| Baseline idle | 32.07 / 79.12 / 59.91 | 15–22 | 9–47 |
| Baseline seed | 35.78 / 86.25 / 55.3 | 17–22 | 21–47 |
| Baseline stream | 156.41 / 298.81 / 162.82 | 18–23 | 14–49 |
| Patched core idle | 28.26 / 92.9 / 39.06 | 15–20 | 10–53 |
| Patched core seed | 37.04 / 93.86 / 49.16 | 17–21 | 18–56 |
| Patched core stream | 35.92 / 352.21 / 186.26 | 21–25 | 17–46 |

| Check | Result |
|---|---|
| Unmodified and patched core, six isolated contexts each | Both survive full 65-minute steady periods; no renderer crash, page exception or telemetry timeout |
| Native quota followup controlled RTC ETV | 1800 one-second samples; 0 post-kickoff dynamic lower-band violations; 0 stalled observations; final playhead 1803.3s |
| Native MSE quota retry comparison | Earlier 3900-sample RTC: at least 15,410 unique observed quota events; 1800-sample quota followup: at least 110. Event logs expose only the most recent six, so these are lower bounds, not exact totals |
| Exact v104 screen cadence analysis | 182 ten-second observations; 1800.118s playhead progress; 0 unchanged intervals; 3 dynamic lower-band crossings in 181 guarded observations; pending peak 25,578B |
| Source re-link / lifecycle | Chromium 7 and Firefox 5 relink checks pass; synthetic persisted suspend/restore passes both; actual BFCache navigation unavailable |
| Short synthetic camera/microphone functional check | PASS: known 440Hz tone decoded, peak 0.279; dropped-head repair without generation restart, LIVE/file-proven RTC data route and concurrent ETV playback; not endurance |
| Actual Waku SDK and browser discovery | Duplicate/unique dial and ping stress pass; two real filter/lightpush browser checks pass |
| Actual global storage relays | Nostr 650,056-byte ciphertext and MQTT 64KiB retrieval pass; MQTT 650k candidate retention and baseline retrieval fail |
| Public-relay media continuity | ETV SAFE repeatedly reaches zero in both hour runs. Earlier screen soak fails a stale-generation assertion after a legitimate budget restart; frontier starvation was separately found/fixed. Final screen followup PASS; full evidence below |
| 24-hour seeding acceptance | PENDING: baseline PID 2797889, candidate PID 2797891; startup source proofs pass, final proof occurs only after the full day |
| v104 default-network active-serving control | FAIL no-JS-exceptions objective: closed RTCPeerConnection setRemoteDescription page errors appeared within minutes. Lifetime remains observing; candidate PID 3170341, fixed source/idle pages; a repaired exact-source day run is required |
| Full unit suite | 262/262 pass |

The hour-long core snapshot precedes the final MQTT close-hook and Waku preflight
generation corrections plus native MSE quota/cold-start/regrowth fixes. Their
exact diff is `/tmp/tracker-long-haul/final-live/versus-65min-candidate.diff`.
The quota snapshot receives its separate actual 30-minute RTC followup. The
validated v104 source additionally repairs live frontier latency estimation and receives
a separate real 30-minute screen followup. Neither later snapshot is represented
as having the same full-hour relay test; its 24-hour seeding test remains pending.

The baseline harness's old `passed:true` flag records survival only. It does
not certify uninterrupted playback; the sampled SAFE/playhead trace shows
public delivery stalls. The patched harness reports survival and continuity
separately.

The two hour runs overlap on one host and shared public brokers. Native heap
sawtooth, RSS warmup and unequal supply do not establish a percentage improvement.
Whole-browser RSS includes three contexts and SDK/media processes. Detailed
measurements and all failed checks are in [`tests/results.md`](../../tests/results.md).
