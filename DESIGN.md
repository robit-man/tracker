---
version: 102
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

Dark is the initial theme. The sun/moon button switches every application
surface and persists the choice using the reference's `tracker-guide-theme`
setting. Apply the saved value before the first paint. Use semantic colors for
success, warning, error and information, including the optional debug graph.

## Layout and components

Use the reference's 253px navigation sidebar, 61px sticky topbar, bordered
panels, metric cards, segmented filters, inputs, switches, radio choices, range
controls, badges, progress indicators, empty states, alerts and lifecycle steps.
Navigation changes the view without changing the private URL fragment. Search
is the first sidebar control. Files and Live media show the full derived room
hash below the same compact section header used by Transfers. Breadcrumbs show
the sidebar group and current page (Workspace, Storage or Room). Do not use promotional heroes,
sidebar branding or decorative motifs; other views use concise section headers.
The browser title is `Room | abcd...1234`, derived from the actual room hash and
retained across navigation. Long breadcrumb labels truncate on small screens
while the header action buttons stay visible.

The workspace contains Files, Live media and Transfers. Distributed storage
contains Contribute storage, Provider marketplace, and Lifecycle & health.
Settings & identity contains bandwidth contribution, appearance, privacy and
optional connectivity details. Its modules share a grid gap, including the
two-column identity/bandwidth group and the full-width cards below it. Card
resets must preserve the spacing utilities used across views. The selected file
has Overview, Shards, Activity and Settings tabs. Shards shows actual verified chunks and whole-file replicas.

At tablet widths the file table becomes cards; at 800px the sidebar becomes a
drawer. On phones each file includes its wrapped name, labeled metadata and
wrapping action buttons of at least 40px. Panels and dialogs must fit at 320px.
Prevent pinch, trackpad pinch and double-tap page zoom while preserving scrolling.
Touch-device form controls use at least 16px text to prevent focus zoom. Respect
reduced motion, including the shared resume/relink pulse. A previously linked
resource pulses its relink icon after access is lost; verified relinking clears it.
Recover accessible persisted handles and finalized cached copies on reload and
when returning to the tab, without requesting permission automatically. Rehash
changed handle metadata before accepting it, preserving existing seed choices.

Use inline SVG action icons with accessible names and viewport-safe tooltips.
Tooltip surfaces, text and borders follow the active theme. Fade them in over
180ms, support keyboard focus and respect reduced-motion preferences.
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

## Orphans and independent networks

A signed catalog revision carries each orphan’s seven-day deadline. Source and
retained-copy observations cancel the countdown; a confirmed retention period
protects a listing while the provider is absent. During the final 24 hours show
Link local source and Let expire. Before a tombstone, query for live sources and
retention again; never remove entries while offline or before discovery starts.

libp2p supplies another authenticated peer route. Limited public circuits carry
control only; normal mode can upgrade them to WebRTC for file and live-media
bytes through the existing scheduler. Privacy mode omits the RTC transports and
uses the established encrypted relay carriers for media. Waku carries encrypted
discovery, catalogs, availability and retention controls, with a bounded,
coalescing queue; it does not carry media chunks or decoder demand.

File Settings offers opt-in encrypted IPFS pins, retrieval and release. Store
only room-encrypted blocks and an encrypted index on IPFS; independently sign
locators and verify the canonical whole-file root before advertising a retrieved
copy. Persistent browser block storage is local, not a promise that a public
service will retain content. Another participating pin provider must stay online
after the original browser leaves. Use actual connectivity states in network
details.

## Global storage and recent rooms

Contribution scope separates room consent from deployment-wide encrypted storage.
Global offers default to relay-only privacy. The Global storage index uses the
existing section-head and responsive card grids, with live capacity, available
space, provider count and collective shard modules. Private room copy controls
stay separate from public capacity listings. Room navigation includes a local,
removable recent-room list scoped to the deployment base URL.
