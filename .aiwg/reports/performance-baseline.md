# Browser lifetime baseline

The reported tab crash was not reproduced. Local diagnostic review found no
recent matching kernel OOM record or Chrome dump. Firefox Snap pending reports
were also inspected; their dates/contexts precede this issue and do not identify
the tracker crash. The original
crash stack and cause therefore remain unconfirmed.

| Run | Start UTC | Sustained interval | Source SHA-256 |
|---|---|---|---|
| Unmodified v103 | 2026-10-12T19:01:57.548Z | 3900.1s | `5f0acc2a75f119d52f187777cf2af63b40f305771732362a73019e4230863ff7` |
| Patched core | 2026-10-12T19:23:02.287Z | 3900.1s | `2dae4f22af00e4865ee052edf1a7af8e9e2c05f24c5380a6a04b7d1c54bfab50` |
| Native quota followup / controlled RTC | 2026-10-12T19:43:02.291Z | 1800 one-second samples | `778d7c3f976917a1604bde511487d638fa3f4d144d38593a9137b0e244f9200d` |
| Validated v104 / screen followup + pending day soak | 2026-10-12T19:54:14.605878+00:00 (day run) | Screen 30min; day test still PENDING | `5ddf1d2d565781d867faf0082a041bfddf052424e3e100378f1ce34737f15bd2` |

Each hour run uses isolated Chromium/Firefox idle, ETV seeder and relay viewer
contexts. The real file is 2,736,439,118 bytes with verified root
`fbc758f0050c094fd52bcfc8a6e5bf67af8dfc80434ca56591e384bfe230e4af`.
Direct ICE is disabled. Separate actual local WebRTC tests isolate decoding from
public delivery. Chromium runs with GPU acceleration disabled.

Telemetry records heap/backing storage/DOM/listeners through Chromium CDP,
Linux whole-browser process-tree RSS, weakly observed native resources, collection
and queue sizes, responsiveness, SAFE and playhead. Firefox supplies RSS/resource
counts rather than CDP heap. Samples stream to disk and event summaries are bounded.
These are measured wall-clock runs, not accelerated aging or years-long proof. Day-long acceptance is pending the running 24-hour default-network seeding tests and their final disk-source read proof.
