---
version: 99
name: Tracker
description: Private peer sharing using the supplied Tracker interface system.
reference: /home/roko/Downloads/index(84).html
colors:
  light:
    canvas: '#f8f9fa'
    surface: '#ffffff'
    ink: '#1d2329'
    primary: '#252c33'
    line: '#e3e7ea'
  dark:
    canvas: '#111518'
    surface: '#191e22'
    ink: '#e2e6e9'
    primary: '#e6eaed'
    line: '#30383d'
typography:
  sans:
    fontFamily: 'system-ui, sans-serif'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
spacing: 4px grid
radii: [4px, 6px, 9px, 13px, 17px]
---

## Source of truth

The supplied `index(84).html` supersedes the former dark transfer-console design.
Its semantic tokens, component styles, SVG symbol library, neutral surfaces,
rounded controls, typography and spacing are included in `index.html`. The
application remains one HTML file. Video surfaces remain black in either theme.

Light is the initial theme. The sun/moon button switches every application
surface and persists the choice using the reference's `tracker-guide-theme`
setting. Apply the saved value before the first paint. Use semantic colors for
success, warning, error and information, including the optional debug graph.

## Layout and components

Use the reference's 253px navigation sidebar, 61px sticky topbar, hero, bordered
panels, metric cards, segmented filters, inputs, switches, radio choices, range
controls, badges, progress indicators, empty states, alerts and lifecycle steps.
Navigation changes the view without changing the private URL fragment.

The workspace contains Files, Live media and Transfers. Distributed storage
contains Contribute storage, Provider marketplace, and Lifecycle & health.
Settings & identity contains bandwidth contribution, appearance, privacy and
optional connectivity details. The selected file has Overview, Shards, Activity
and Settings tabs. Shards shows actual verified chunks and whole-file replicas.

At tablet widths the file table becomes cards; at 800px the sidebar becomes a
drawer. On phones each file includes its wrapped name, labeled metadata and
wrapping action buttons of at least 40px. Panels and dialogs must fit at 320px.
Keep browser zoom available and respect reduced motion.

Use inline SVG action icons with accessible names and viewport-safe tooltips.
Use text alongside important primary actions. Dialogs support Escape, keyboard
focus containment and focus return. Inspector tabs support arrow/Home/End keys.
Do not replace focused controls when unchanged telemetry is refreshed.

## Actual peer storage

All storage and retrieval processes are free. Contribution is disabled until
the user opts in. Save allocation, browser persistence preference, retention
profile and duration locally in the room's encrypted IndexedDB. The selected
allocation is bounded by browser quota; pending copies reserve capacity too.

Provider cards come from authenticated, expiring room offers. Keep available
requests use the existing encrypted chunk acquisition, durable cache, complete
file-root verification and seed advertisement. A local upload can also be
materialized into the cache. Locked files are retained as canonical ciphertext.
Never show a completed replica before its file root has been verified.

Show actual placement status and live sources. Active requests may recruit
replacement providers until their retention period expires. Turning storage
contribution off stops its background work, including after reload. Releasing
retention stops automatic seeding while preserving cached bytes and pre-existing
manual seed choices. A provider serves only while its room is open and bandwidth
contribution permits it; browser persistence requests may be denied.

No payment, wallet, service contract, audit guarantee or fabricated provider is
connected. A future payment protocol can extend authenticated placement controls
without changing today's free opt-in process.
