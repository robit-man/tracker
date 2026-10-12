# Browser lifetime optimization summary

Validated v104 snapshot `2026-10-12-runtime-lifetime-v104` removes demonstrated accumulation paths in networking, media
and page lifecycle. Actual SDK stress changes 10,000 repeated Waku attempts from
9,999 retained queued duplicates to one physical dial; unique slow requests share
a 32-peer ceiling. Nostr's 250,000-event fixture stays within 2,048 retained IDs.
Physical write/ACK credits remain reserved until underlying operations settle.

Both captured core snapshots survive their actual 65-minute Chromium/Firefox
observations. The quota snapshot receives a separate 30-minute healthy-link ETV recovery test;
the validated v104 source has a separate screen followup and a pending 24-hour seeding
run. Public ETV delivery stalls under this shared-broker load and larger MQTT
storage attempts fail; these are not reported as uninterrupted delivery success.

The original user crash was not reproduced or conclusively attributed. AVI
progressive-transcoding work was requested after the v104 source froze and has
separate validation; this report does not relabel v104 tests as covering AVI. The
benefit is removal of proven unbounded work, not a measured memory percentage or
extrapolated years of uptime. See [`tests/results.md`](../../tests/results.md).
