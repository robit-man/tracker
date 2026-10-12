# Browser lifetime SLO evaluation

| Objective | Evaluation |
|---|---|
| No tab crash/freeze in completed 65-minute core observations | PASS for both captured snapshots and both engines; original crash remains unconfirmed |
| Stalled native operation and SDK work stays bounded | PASS deterministic physical-admission/SDK fixtures |
| One managed heartbeat per active runtime | PASS reconnect/single-flight/lifecycle checks |
| Local source survives persisted lifecycle restore | PASS synthetic Chromium/Firefox cycles; actual BFCache unavailable |
| Native quota followup healthy-link playback preserves dynamic lower band | PASS 1788 guarded one-second observations, 0 violations and 0 stalls |
| Uninterrupted public-relay ETV playback | FAIL in this load test; tabs survive but delivery stalls |
| Public-screen SAFE never crosses dynamic lower band | NOT ESTABLISHED: three guarded crossings around 200–214s despite no ten-second unchanged-playhead intervals |
| Exact v104 screen followup | PASS; see final screen artifact |
| No crash and readable seeding source for a full day | PENDING; the detached 24-hour runs are still observing |
| General global MQTT transfer reliability | NOT ESTABLISHED: 64KiB passes; larger baseline/candidate attempts fail |
| Continuous 24-hour serving across receiver legs | NOT ESTABLISHED: v104 default-network control records WebRTC signaling page errors; separate repaired-source followup required |
| Years of uninterrupted uptime | NOT ESTABLISHED by finite tests; no guarantee claimed |

Real elapsed-time evidence, deterministic stress and complementary functional
checks answer different questions and are not substitutes for each other.
