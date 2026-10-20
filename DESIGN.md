---
name: Hearth
description: Self-hosted shared family calendar — the kitchen wall planner, carried in the pocket.
colors:
  paper: "#fbfaf4"
  lattice-line: rgba(122, 150, 190, 0.16)
  marker-red: "#c0392b"
  margin-line: rgba(208, 80, 64, 0.5)
  weekend-tint: rgba(208, 80, 64, 0.07)
  ink: "#22252a"
  ink-soft: "#4c5260"
  ink-faint: "#666b76"
  event-blue: "#3b78c4"
  event-green: "#3b9e6b"
  event-yellow: "#d9b12e"
  button-white: "#ffffff"
  button-border: "#c9ccd2"
  button-hover: "#f6f2e9"
  error-red: "#a03427"
typography:
  display:
    fontFamily: "'Permanent Marker', cursive"
    fontSize: "clamp(3.5rem, 16dvw, 4.25rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
  hand-label:
    fontFamily: "'Permanent Marker', cursive"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "'Karla Variable', 'Karla', sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.4
  control:
    fontFamily: "'Karla Variable', 'Karla', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
  meta:
    fontFamily: "'Karla Variable', 'Karla', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
rounded:
  none: "0px"
  chip: "3px"
  panel: "4px"
  pill: "999px"
  md: "4px"
  lg: "8px"
spacing:
  lattice: "26px"
  xs: "4px"
  sm: "14px"
  md: "24px"
  lg: "40px"
  xl: "78px"
components:
  wordmark:
    textColor: "{colors.marker-red}"
    typography: "{typography.display}"
  google-button:
    backgroundColor: "{colors.button-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "50px"
  google-button-hover:
    backgroundColor: "{colors.button-hover}"
  schedule-chip:
    backgroundColor: "{colors.event-blue}"
    textColor: "#f2f6fb"
    rounded: "{rounded.chip}"
    height: "30px"
  week-panel:
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: Hearth

## Overview

**Creative North Star: "The Kitchen Wall Planner"**

Hearth renders as the artifact it replaces: a ruled paper wall planner hung where the whole family looks twice a day. The ground is warm undyed paper (#fbfaf4) with a fine blue-drawn lattice at 26px; a red margin line runs down the left like the column on a school planer. The display voice is a marker in the hand — Permanent Marker — used sparingly for the family name and day labels; everything the family reads is quiet Karla, graphite ink on paper.

Color does jobs, never decoration: saturated marker chips (blue, green, yellow) mean real events, the red margin and weekend tint mean "the week's frame", and one honest error red carries failure. Controls stay standard web — buttons, sections, alerts — because two parents and three kids already know how those work. The world enters only through type, palette, density, and one signature move; it never dresses a widget as a household object.

**Key Characteristics:**
- Ruled-paper ground with red margin line; content always indents past it.
- Marker-weight display face for the family name and day labels only.
- Standard controls in their own shared grammar (favorites: the white Google pill).
- Chips carry events in saturated marker colors; color is information.
- One authored motion moment per surface: things go up and settle, like paper hung on a wall.
- Light and dark — follows the system setting by default, with a manual Light / Dark / System toggle. The dark wall is the same planner after lights-out: warm charcoal ground, bone ink, chalk-blue lattice; markers keep their colors.

## Colors

Warm paper neutrals carry the page; saturated marker colors do the information work. One red family handles margins, weekends, the wordmark, and errors — always frame-or-alert work, never decoration.

### Primary
- **Marker Red** (#c0392b): The wordmark and any display-weight signal written "by hand". Never body text, never a link.
- **Margin Red** (rgba(208, 80, 64, 0.5)): The left margin line and weekend column tint (0.07). Frame, not content.

### Secondary
- **Event Blue** (#3b78c4): Calendar chip, a family event in the week strip. White text on top.
- **Event Green** (#3b9e6b): Second calendar chip voice. White text on top.
- **Event Yellow** (#d9b12e): Third calendar chip voice — the one chip that takes dark ink (#3a2f10).

### Neutral
- **Paper** (#fbfaf4): Every ground. Sheets and the world behind them share one swept-paper surface.
- **Lattice** (rgba(122, 150, 190, 0.16)): The ruled grid drawn over paper — background structure, never container borders.
- **Ink** (#22252a): Text, week-panel frame, focus rings.
- **Ink Soft** (#4c5260): Taglines and helper copy.
- **Ink Faint** (#666b76): Meta notes and footers, small and quiet.
- **Button White** (#ffffff) with **Button Border** (#c9ccd2): The standard pill resting state.
- **Error Red** (#a03427): Failure copy only — names the problem and the recovery.

### Named Rules
**The Standard-Control Rule.** Layout, navigation, and controls are always standard web components. The planner world lends type, palette, density, and one signature move — it never costumes a button or a form.
**The Margin-Line Rule.** The red margin line runs the full height of any sheet-like surface at 34px from the sheet edge (3px line); content indents to 56px or more past the edge.

## Typography

**Display Font:** Permanent Marker (cursive, self-hosted via fontsource)
**Body Font:** Karla Variable (weight-variable grotesk, self-hosted via fontsource)

**Character:** A marker in hand against a steady, quiet grotesk. The marker voice is scarce by law — if everything is hand-written, nothing is.

### Hierarchy
- **Display** (Permanent Marker, 400, clamp(3.5rem, 16dvw, 4.25rem), line-height 1): The product name and single hero moments only.
- **Hand label** (Permanent Marker, 400, 13px, line-height 1.2): Day labels and small hand-written captions inside ruled panels.
- **Body** (Karla, 400, 17px, line-height 1.4): Taglines and reading copy.
- **Control** (Karla, 600, 15px, line-height 1): Buttons and tappable labels.
- **Meta** (Karla, 400, 13px, line-height 1.45): Notes, errors, footers — 14px if it must carry an explanation.

### Named Rules
**The One Hand Rule.** Permanent Marker appears at most twice on any screen — one display voice, one label layer. Body copy is always Karla.
**The 11px Floor Rule.** No functional text renders under 11px; chips and meta text sit at 11px and 13px minimum.

## Layout

Phone-first single column: the sheet is `min(480px, 100%)`. On phones (PWA), the sheet is the screen — full-bleed, `min-height: 100dvh`. On desktop (≥900px), the same column centers as a lifted sheet with soft shadow, margins 48px. The internal rhythm hangs on the 26px lattice: big gaps between the wordmark, week strip, and action land on multiples or `dvh`-scaled clamps so proportions hold across screen heights. Week panels divide space on a 7-column grid — the week has seven columns, always Monday-first (Dutch calendar habit).

## Elevation & Depth

Flat paper by default. Depth exists only where paper meets paper: a desktop sheet is lifted (`0 1px 2px rgba(34, 37, 42, 0.06)` plus `0 18px 48px -18px rgba(34, 37, 42, 0.22)`), and tappable pills carry one hair of shadow (`0 1px 2px rgba(34, 37, 42, 0.08)`) with an offset and blur. No layered escalations, no hover scale.

### Shadow Vocabulary
- **sheet-lift** (`0 1px 2px rgba(34,37,42,0.06), 0 18px 48px -18px rgba(34,37,42,0.22)`): Desktop-only sheet on the desk surface.
- **pill-touch** (`0 1px 2px rgba(34,37,42,0.08)`): White tappable controls at rest.

## Shapes

Paper geometry: hard 4px corners on ruled panels (week strip, frames), 3px on small chips, none on sheets. Tappable pills at 999px. Strokes carry structure — the week panel gets a 2px ink frame, its inner columns 1px dividers (rgba(34,37,42,0.35)); controls get a 1px neutral border (#c9ccd2). Focus is an ink ring: `outline: 2px solid #22252a; outline-offset: 2px`.

## Components

### Google Button
The standard white pill in Google's own brand grammar — never re-skinned.
- **Shape:** pill (999px), height 50px, width `min(300px, 100%)`
- **Color:** button-white ground, ink text, 4-color G logo inline SVG (20px)
- **Hover:** button-hover (#f6f2e9) ground, 120ms ease-out
- **Active:** translateY(1px), 90ms
- **Focus:** ink focus ring
- **Busy:** label swaps to "Opening Google…", disabled at 0.7 opacity, `cursor: progress`
- **Motion:** transitions on background-color and transform only

### Week Panel
The signature component — a ruled week strip that reads as a schedule the moment it loads.
- **Shape:** 2px ink frame, 4px radius, 7 equal columns with 1px dividers
- **Labels:** Permanent Marker 13px at the top of each column, centered
- **Weekend:** rightmost column tinted weekend-tint
- **Height:** 150px at phone width

### Schedule Chip
A saturated marker-colored event block pressed into the week's paper.
- **Shape:** 3px radius, height 30px, inset 16%/12% from its cell
- **Text:** 11px Karla 700, planner shorthand ("Swim", "Dent."), single line, overflow clipped
- **Palette:** event-blue / event-green / event-yellow with matching text colors
- **Motion:** 160ms scale-settle, staggered 90ms per chip, starting 320ms after sheet hang; none under reduced motion

### Error Message
Failure that names the problem and the recovery in product language.
- **Copy:** error-red at 14px on paper, `role="alert"`, max-width 340px
- **Position:** between week panel and action, 18px down

### Toast (Sonner)
Confirmation a change landed — success voice only; failures stay inline in the sheet where they were made.
- **Surface:** white sheet `#ffffff`, ink text, 1px button-border `#c9ccd2`, 8px radius, sheet-lift shadow (one notch lighter)
- **Type:** Karla 15px, control weight in the title; description ink-soft
- **Icons:** drawn lucide glyphs, not emoji — success event-green, error error-red, busy ink-soft spinner
- **Position:** bottom-center, above the Add pill and safe area; stacked, auto-dismissing
- **Substance:** the copy names the outcome in product language ("Dentist" saved. / "Dentist" deleted.) and, when offline, says it sends when connection returns — no icon-only, no vague "Success"

## Do's and Don'ts

### Do:
- **Do** keep every interaction control a standard web component in its own familiar grammar.
- **Do** draw color at page-scale jobs: chips carry events, the margin frames the week, red is consumed by wordmark/margin/error — never all three at once on the same element.
- **Do** self-host both faces and settle motion with `cubic-bezier(0.22, 1, 0.36, 1)` from a visible default.
- **Do** theme the browser surfaces from the palette (selection = rgba(208, 80, 64, 0.25), focus = ink ring).

### Don't:
- **Don't** costume a control as a household object (magnet, magnet-board chrome, chalk scrawl on a form field).
- **Don't** use marker display type for anything the task depends on reading twice.
- **Don't** flip the paper to cold or blue-black for dark mode — the night wall stays warm charcoal; markers and the red family keep their hue (red lifts one notch for legibility).
- **Don't** invent placeholder data with claims — chips show planner-authentic shorthand events only.
