# Tracker v4 execution report

Baseline: commit `5050998`, build `2026-10-10-source-link-v95`.
The exact deployed source is archived in `fixtures/tracker-v3.html`.

- PASS: `node --test tests/*.test.cjs` — 116 existing regressions before changes.
- Baseline and upgraded browser/performance results will be recorded as checkpoints complete.

Release matrix: room/file URL namespace parity; delayed and unavailable links;
locked content; persistent identity and simultaneous tabs; authenticated controls,
records and binary sessions; open v3 coexistence; protected policy; download
resume and media regressions. Only executed cases are reported as passing.
