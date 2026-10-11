---
version: alpha
name: Tracker
description: A compact private-room file console, preserving the established monospace controls and dark catalog.
colors:
  background: '#08090a'
  panel: '#0c0e10'
  text: '#eef1f3'
  muted: '#9099a2'
  primary: '#f1bb37'
  success: '#67d391'
typography:
  sans:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
omitted:
  - section: spacing
    reason: Existing component geometry remains owned by index.html.
  - section: rounded
    reason: Existing controls are square; special QR and avatar shapes remain in CSS.
---

## Overview

Tracker resembles a compact transfer console: bordered rows, technical metadata,
quiet controls and visible availability dots. The v4 brief explicitly preserves
this visual language. The audience shares files by room links on desktop and
mobile; the existing product uses English. Avoid account onboarding, promotional
cards, decorative gradients or a visual rebrand.

Runtime ownership: `index.html` is the canonical token source. This document
mirrors `:root` roles; it does not generate another theme or duplicate stylesheet.

## Colors

Dark surfaces and thin borders separate the catalog, details and overlays.
Amber identifies transfer activity; green identifies seeding and successful
actions. Preserve semantic labels alongside color. Focus uses the existing amber
outline. This application currently has one dark theme.

## Typography

Use the existing monospace stack for controls, file metadata and technical values;
use the sans stack for general layout. Preserve compact uppercase action labels
and plain sentence case status text. Let filenames wrap on mobile.

## Layout

Preserve the fixed header, scrolling catalog and desktop details sidebar. Mobile
rows become file cards through the existing breakpoints. File links add one icon
to the established actions; pending resource navigation is a compact status row.

## Elevation & Depth

Keep rows flat. Existing overlays and toasts alone use elevated shadows.

## Shapes

Preserve square bordered controls, circular availability dots and avatars, and
the rounded white QR frame. Use existing SVG strokes and icon decoration.

## Components

Reuse `.mini`, `setActionIcon`, `decorateActions`, the toast system and room share
dialog. Copy file link and Link local source are separate actions with separate
icons and accessible labels. Pending resolution never creates a catalog record.
Room sharing uses the canonical room URL even from a file permalink. Clipboard
failure exposes a selectable link through the existing share dialog. Preserve
keyboard focus and focus return. Password links expose existing unlock controls.

## Do's and Don'ts

Keep cryptographic details in the optional details/diagnostics surface. Do not
add accounts, wallets, connection setup, mandatory dialogs or key management.
