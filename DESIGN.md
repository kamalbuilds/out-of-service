---
version: alpha
name: Out-of-Service-design-system
description: A transit-signage-style subway route planner. Warm off-white paper canvas, near-black ink, one blue accent (MTA blue), square panels with a 2px control radius, hairline borders, no shadows, no gradients, tabular numerals everywhere a number appears. Reads like a printed platform schedule, not a SaaS dashboard.
structure_source: "Structure adapted from Vercel DESIGN.md, awesome-design-md, https://github.com/VoltAgent/awesome-design-md/blob/main/design-md/vercel/DESIGN.md"
research_source: "Surface, ink, tier colours, type, spacing, and the Web Interface Guidelines checklist below are merged in verbatim from the research pass in docs/DESIGN.md, which scouted aura.build (https://www.aura.build) — the guidelines are upstream vercel-labs/web-interface-guidelines surfaced via an aura.build skill; typography/layout prose was mined from two aura.build design systems ('Portfolio - Technical System' by Sourasith Phomhome, 'Enterprise Payment Infrastructure' by Meng To — their color stories were rejected, their prose was not). This file is the single source of truth; docs/DESIGN.md now only points here."

colors:
  surface: "#F2EFE9"
  surface-soft: "#ECE8DC"
  surface-inset: "#E4DFCE"
  ink: "#0A0A0A"
  ink-muted: "#4A4A46"
  ink-subtle: "#7A776D"
  hairline: "#DDD8C8"
  hairline-strong: "#B8B29C"
  accent: "#0039A6"
  accent-soft: "#DCE6F5"
  accent-on: "#FFFFFF"
  reliable: "#0C6B3D"
  watch: "#8A5A00"
  unreliable: "#A6360F"
  out: "#7A1010"
  line-ace: "#0039A6"
  line-bdfm: "#FF6319"
  line-g: "#6CBE45"
  line-jz: "#996633"
  line-l: "#A7A9AC"
  line-nqrw: "#FCCC0A"
  line-123: "#EE352E"
  line-456: "#00933C"
  line-7: "#B933AD"
  line-s: "#808183"

typography:
  display-xl:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 48px
    fontWeight: 700
    lineHeight: 52px
    letterSpacing: -0.5px
    fontFeature: '"tnum", "lnum"'
  display-lg:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 32px
    fontWeight: 700
    lineHeight: 36px
    letterSpacing: -0.3px
    fontFeature: '"tnum", "lnum"'
  headline:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 24px
    fontWeight: 700
    lineHeight: 28px
    letterSpacing: 0px
  subhead:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 18px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0px
  body:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0px
    fontFeature: '"tnum", "lnum"'
  body-strong:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: 0px
    fontFeature: '"tnum", "lnum"'
  body-sm:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
    fontFeature: '"tnum", "lnum"'
  caption:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 12px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.6px
    textTransform: uppercase
  timetable-figure:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 16px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0px
    fontFeature: '"tnum", "lnum", "zero"'
  button:
    fontFamily: Archivo, Helvetica, Arial, sans-serif
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0.2px
    textTransform: uppercase

rounded:
  none: 0px
  control: 2px
  full: 9999px

spacing:
  xxs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 64px

components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  button-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-on}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: 10px 16px
  text-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: 10px 12px
    height: 40px
  tier-label-reliable:
    textColor: "{colors.reliable}"
    typography: "{typography.body-strong}"
  tier-label-watch:
    textColor: "{colors.watch}"
    typography: "{typography.body-strong}"
  tier-label-unreliable:
    textColor: "{colors.unreliable}"
    typography: "{typography.body-strong}"
  tier-label-out:
    textColor: "{colors.out}"
    typography: "{typography.body-strong}"
  chip-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: 2px 8px
  table-header:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    borderColor: "{colors.hairline-strong}"
    rounded: "{rounded.none}"
    padding: 8px 12px
  table-cell:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.timetable-figure}"
    borderColor: "{colors.hairline}"
    rounded: "{rounded.none}"
    padding: 8px 12px
  timeline-rail:
    backgroundColor: "{colors.hairline-strong}"
    width: 2px
  timeline-node-reliable:
    backgroundColor: "{colors.reliable}"
    rounded: "{rounded.none}"
    size: 8px
  timeline-node-watch:
    backgroundColor: "{colors.watch}"
    rounded: "{rounded.none}"
    size: 8px
  timeline-node-unreliable:
    backgroundColor: "{colors.unreliable}"
    rounded: "{rounded.none}"
    size: 8px
  timeline-node-out:
    backgroundColor: "{colors.out}"
    rounded: "{rounded.none}"
    size: 8px
  line-bullet:
    rounded: "{rounded.full}"
    size: 28px
    typography: "{typography.body-strong}"
  card-route:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: 16px
  top-nav:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline-strong}"
    typography: "{typography.body-sm}"
    height: 56px
    padding: 0px 16px
  footer:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.caption}"
    padding: 32px 16px
---

## Overview

Out of Service reads like a printed platform schedule bolted to a wall, not a SaaS dashboard. The canvas is `{colors.surface}` (#F2EFE9), a warm off-white paper tone that never goes pure white; text is `{colors.ink}` (#0A0A0A), never pure black. The only chromatic accent on chrome is MTA blue `{colors.accent}` (#0039A6), reserved for links, the primary interactive affordance, focus rings, and the accent button. Everything else in the interface is monochrome: paper, ink, and two graded warm grays for hairlines and muted text.

Panels are square. Cards, chips, tables, and timeline nodes carry `{rounded.none}` (0px) — no exceptions. Interactive controls that a finger or cursor presses — buttons and text inputs — get a small `{rounded.control}` (2px) so the tap target reads as "pressable" without softening into a SaaS pill. The only fully circular shape is the line bullet (`{rounded.full}`), because the real MTA bullet is a circle and nothing else in this system earns that exception.

Depth is built from hairlines, not shadows. `{colors.hairline}` (1px, #DDD8C8) separates table rows and card edges; `{colors.hairline-strong}` (#B8B29C) frames buttons, inputs, cards, and the top nav. There is no drop shadow, no blur, no gradient anywhere in this system — a printed schedule does not float.

Type is Archivo throughout — a grotesk with true tabular lining figures, which matters because this product is mostly numbers: arrival times, minutes-late counters, reliability percentages, stop counts. Every context that renders a number turns on `"tnum" "lnum"` (tabular, lining figures) via `font-variant-numeric: tabular-nums`, matching the Web Interface Guidelines rule below, so digits never jitter in width as they update — exactly like a split-flap departure board where each digit occupies a fixed slot.

**Key characteristics:**
- Paper canvas (`{colors.surface}` #F2EFE9), ink text (`{colors.ink}` #0A0A0A) — 17.25:1 contrast, WCAG AAA, computed.
- MTA blue (`{colors.accent}` #0039A6) is the single chromatic UI accent — 8.57:1 contrast against surface, computed. Nothing else in the chrome carries a saturated hue.
- Four status tiers — reliable / watch / unreliable / out — set directly as ink-weight colored text on the paper surface (no chip fill required), each individually checked against `{colors.surface}` below.
- `{colors.line-bdfm}` (#FF6319, MTA orange) is reserved exclusively for the B/D/F/M line bullet. It is visually close to nothing else in this palette and must never be reused as an accent, a button color, or a status tier — the accent role belongs to MTA blue alone.
- Zero radius on every panel, card, chip, and table; a 2px control radius on buttons and inputs only; full-circle radius on line bullets only.
- Hairline borders carry every edge; zero shadows, zero gradients, zero `backdrop-filter`.
- Tabular numerals (`"tnum" "lnum"`) on every numeric field: timetable figures, minute counters, percentages.
- MTA-authentic line bullet colors, each with the correct on-bullet text color (black or white) for legibility, not a house style choice.

## Colors

### Surface
- **Paper** (`{colors.surface}` — `#F2EFE9`): the default background for every screen. Warm off-white, never pure white.
- **Paper Soft** (`{colors.surface-soft}` — `#ECE8DC`): table headers, footer band, one step warmer/darker than paper for light sectioning.
- **Paper Inset** (`{colors.surface-inset}` — `#E4DFCE`): recessed wells — disabled fields, inactive tab background.
- **Hairline** (`{colors.hairline}` — `#DDD8C8`): 1px dividers — table rows, list separators.
- **Hairline Strong** (`{colors.hairline-strong}` — `#B8B29C`): 1px borders on buttons, inputs, cards, nav.

### Text
- **Ink** (`{colors.ink}` — `#0A0A0A`): headlines, body, primary numerals. Contrast against `{colors.surface}` = **17.25:1** (WCAG AAA, computed).
- **Ink Muted** (`{colors.ink-muted}` — `#4A4A46`): secondary text, table headers, captions.
- **Ink Subtle** (`{colors.ink-subtle}` — `#7A776D`): timestamps, placeholder text, lowest-emphasis labels.

### Accent
- **MTA Blue** (`{colors.accent}` — `#0039A6`): the single chromatic accent for chrome — primary links, the accent CTA, focus rings, the active-state underline. Contrast against `{colors.surface}` = **8.57:1** (WCAG AAA, computed). This is also the real MTA color for the A/C/E trunk line, so the accent doubles as the A/C/E line bullet.
- **Accent Soft** (`{colors.accent-soft}` — `#DCE6F5`): tinted background for the accent chip / "planned route" highlight band.
- **MTA Orange is not an accent.** `{colors.line-bdfm}` (#FF6319) exists only to paint the B/D/F/M bullet. Reusing it as a second UI accent would make "this is the B/D/F/M line" and "this is a clickable thing" collide on the same hue — the system reserves exactly one chromatic accent, and it is blue.

### Semantic status tiers
Each tier's foreground color is computed against `{colors.surface}` (#F2EFE9), not guessed. All four pass WCAG AA (4.5:1) directly as ink-weight text on the paper surface — no separate chip fill is required to make a tier legible:
- **Reliable** (`{colors.reliable}` — `#0C6B3D`, dark green): on-time / high-confidence routes. Contrast against `{colors.surface}` = **5.74:1**.
- **Watch** (`{colors.watch}` — `#8A5A00`, dark amber): delayed / degraded service, worth checking before you leave. Contrast against `{colors.surface}` = **5.16:1**.
- **Unreliable** (`{colors.unreliable}` — `#A6360F`, dark red-orange): frequent delays / do not rely on this route right now. Contrast against `{colors.surface}` = **5.80:1**.
- **Out** (`{colors.out}` — `#7A1010`, deep red): service suspended. Contrast against `{colors.surface}` = **9.58:1** — deliberately the highest-contrast tier since it is the most consequential state.

Tier state and route identity never share a hue: the four tier colors above are a separate palette from the ten MTA line-bullet hexes below, so "this elevator is down" and "this is the G train" can never be confused on sight. A tier label always pairs its color with text and, where space allows, an icon — color never carries meaning alone, per the accessibility guideline below.

### MTA line bullets
Real MTA line colors, used only for line bullets, never for arbitrary chrome:

| Lines | Hex | Bullet text | Contrast (computed) |
|---|---|---|---|
| A/C/E | `#0039A6` | white | 9.83:1 |
| B/D/F/M | `#FF6319` | black | 7.05:1 |
| G | `#6CBE45` | black | 9.09:1 |
| J/Z | `#996633` | white | 4.88:1 |
| L | `#A7A9AC` | black | 8.91:1 |
| N/Q/R/W | `#FCCC0A` | black | 13.78:1 |
| 1/2/3 | `#EE352E` | white | 4.05:1 (large-text only; use `{typography.body-strong}` 16px/600 minimum inside the bullet, never smaller) |
| 4/5/6 | `#00933C` | white | 4.01:1 (large-text only, same rule as above) |
| 7 | `#B933AD` | white | 5.07:1 |
| S | `#808183` | white | 3.90:1 (fails AA at any size — set S-shuttle bullet text at 700 weight and treat the bullet as decorative-plus-adjacent-label, never the sole identifier) |

Do not invent a bullet color. These ten hexes are fixed to the physical signage the user already recognizes; changing them breaks recognition, not just brand.

## Typography

### Font Family
**Archivo** (Google Fonts, loadable via `next/font/google`) carries every size in the system — display, body, caption, and numerals. Chosen over Vercel's structural source face (Geist, proprietary, Inter-substituted) because Archivo ships true tabular lining figures out of the box, has transit/wayfinding-adjacent grotesk proportions, and needs no substitute — it is the real font, not a stand-in. Load weights 400 / 600 / 700 only; the system never goes lighter than 400 or beyond 700.

Enable `font-variant-numeric: tabular-nums` (equivalently `font-feature-settings: "tnum", "lnum"`) on every numeric context — timetable figures, minute counters, stop counts, percentages — via the `{typography.timetable-figure}` token or by adding the feature flag to any token rendering a number. This is the single most load-bearing typographic rule in the system: without it, arrival-time digits shift width as they tick down and the "departure board" illusion breaks.

### Hierarchy

| Token | Size | Weight | Line Height | Tracking | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 48px | 700 | 52px | -0.5px | Hero arrival countdown, station name on the route header |
| `{typography.display-lg}` | 32px | 700 | 36px | -0.3px | Section headline ("Next departures", "Service status") |
| `{typography.headline}` | 24px | 700 | 28px | 0 | Card and panel titles |
| `{typography.subhead}` | 18px | 600 | 24px | 0 | Route summary line, stop name |
| `{typography.body}` | 16px | 400 | 22px | 0 | Default paragraph and list text, tabular numerals on |
| `{typography.body-strong}` | 16px | 600 | 22px | 0 | Emphasized body, tier labels, line-bullet glyph text |
| `{typography.body-sm}` | 14px | 400 | 20px | 0 | Secondary text, nav links, table body |
| `{typography.caption}` | 12px | 600 | 16px | 0.6px, uppercase | Chip labels, table headers, timestamps |
| `{typography.timetable-figure}` | 16px | 600 | 20px | 0 | Any standalone number: minutes away, delay count, percentage |
| `{typography.button}` | 14px | 600 | 20px | 0.2px, uppercase | All button labels |

### Principles
- **Tabular numerals are mandatory, not optional**, everywhere a digit appears next to another digit that will update (countdowns, delay minutes, percentages).
- **Uppercase is reserved** for captions and button labels only — never headlines, never body.
- **No italics, no serif fallback.** Archivo's fallback stack is `Helvetica, Arial, sans-serif` — never a serif substitute, which would read as editorial rather than functional.
- **Negative tracking only at display sizes** (-0.3 to -0.5px); body and caption sit at 0 or slightly positive (caption +0.6px, matching a stencil/wayfinding label convention).

## Layout

### Spacing System
- **Base unit**: 4px, an 8pt grid.
- **Tokens**: `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 64px.
- Card and table-cell interior padding sits at `{spacing.md}` (16px) by default; dense timetable rows may tighten to `{spacing.sm}` (12px). A marketing-page-scale 80px section padding was considered during research and explicitly rejected as too loose for a data-dense utility tool.

### Grid & Container
- Max content width ~960px for the route planner column — this is a utility tool, not a marketing page, so it stays narrow and centered rather than stretching wide.
- Timetable and table views run full-width inside the container with `{spacing.md}` gutters.
- Card grids (route options) stack 1-up on mobile, 2-up at tablet, up to 3-up at desktop.

## Borders & Shadows
No shadows exist in this system. Every elevation cue is a `{colors.hairline}` or `{colors.hairline-strong}` 1px border. A card sits on the page because it has a visible edge, not because it floats above one.

## Motion
Motion is functional, not decorative — it signals a state change (a status flips from reliable to watch, a countdown ticks) rather than delighting.
- **Duration**: 120–150ms for color/state transitions (status text recoloring, button press). No motion longer than 200ms outside of route re-routing recalculation, which may show a brief (400ms) loading tick.
- **Easing**: linear or ease-out only. No spring, no bounce, no overshoot — a split-flap display does not ease.
- **Never `transition: all`** — animate the specific property that changed (`color`, `background-color`, `border-color`), per the anti-pattern list below.
- **Respect `prefers-reduced-motion`**: disable the flip/tick animation on countdown digits and fall back to an instant swap.

## Components

### Buttons
- **`button-primary`** — ink fill, paper text, `{rounded.control}` 2px, uppercase `{typography.button}`. The default action.
- **`button-secondary`** — paper fill, ink text, 1px `{colors.hairline-strong}` border, `{rounded.control}`. Paired secondary action.
- **`button-accent`** — MTA blue fill, white text, `{rounded.control}`. Reserved for the single most important action per screen (e.g. "Plan this route"). Never more than one accent button visible at a time. Never substitute `{colors.line-bdfm}` orange here.

### Inputs
- **`text-input`** — paper background, 1px `{colors.hairline-strong}` border, `{rounded.control}` 2px, ink text, 40px height. Focus state: border switches to `{colors.accent}` at 2px — no glow, no shadow ring, per the Focus States guideline below.

### Tier labels
- Status is set directly as colored `{typography.body-strong}` text (`tier-label-reliable`, `tier-label-watch`, `tier-label-unreliable`, `tier-label-out`) on the paper surface — no fill required, since all four pass AA directly. Always pair the color with the tier word itself ("Reliable", "Watch", "Out") and, where space allows, an icon; never color alone.

### Chips (accent only)
- `chip-accent` — the one chip in the system, `{colors.accent-soft}` fill with `{colors.accent}` text, `{rounded.none}` (chips are flat like everything else — the 2px control radius belongs to buttons and inputs only). Used for "planned route" / "selected" badges, never for status tiers.

### Tables
- **`table-header`** — paper-soft background, ink-muted uppercase caption text, bottom border `{colors.hairline-strong}`, `{rounded.none}`.
- **`table-cell`** — paper background, ink text set in `{typography.timetable-figure}` for any numeric column (arrival time, delay minutes), `{typography.body-sm}` for text columns. Row divider `{colors.hairline}` 1px, never zebra-striped — the hairline alone carries row separation.

### Timelines
- **`timeline-rail`** — a 2px vertical `{colors.hairline-strong}` line connecting stops.
- **`timeline-node-*`** — an 8px square (`{rounded.none}` — squares match the system's square-corner language) in the tier color, placed on the rail at each stop to show that segment's live status.

### Line bullets
- **`line-bullet`** — the one circular element in the system (`{rounded.full}`), 28px diameter, filled with the line's authentic MTA hex, text set in `{typography.body-strong}`, color per the on-bullet contrast table above. Never resize below 24px — the 1/2/3, 4/5/6, and S bullets are already at the edge of legible contrast and shrinking the glyph compounds it.

### Forms
- Labels set in `{typography.caption}` above the field, ink-muted color, uppercase, 0.6px tracking. Every input needs `autocomplete` and a meaningful `name`; every control needs a `<label>` or `aria-label`.
- Error states use `{colors.unreliable}` text under the field, focus moves to the first invalid field on submit, never a red border glow — consistent with the "hairline, not shadow" elevation rule.
- Placeholders end with `…`, not `...`, and show an example pattern.

## Interface Guidelines (verbatim)

Source: `vercel-labs/web-interface-guidelines`, surfaced via an aura.build skill (`https://www.aura.build/skills/77b75b55-6806-4750-84b3-1e9c00b391d8/web-interface-guidelines`, upstream `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`). Reproduced in full for the sections that apply to a data-dense, accessible, no-motion product; every rule below is binding for this codebase, not aspirational.

> ### Accessibility
> - Icon-only buttons need `aria-label`
> - Form controls need `<label>` or `aria-label`
> - Interactive elements need keyboard handlers (`onKeyDown`/`onKeyUp`)
> - `<button>` for actions, `<a>`/`<Link>` for navigation (not `<div onClick>`)
> - Images need `alt` (or `alt=""` if decorative)
> - Decorative icons need `aria-hidden="true"`
> - Async updates (toasts, validation) need `aria-live="polite"`
> - Use semantic HTML (`<button>`, `<a>`, `<label>`, `<table>`) before ARIA
> - Headings hierarchical `<h1>`–`<h6>`; include skip link for main content
> - `scroll-margin-top` on heading anchors
>
> ### Focus States
> - Interactive elements need visible focus: `focus-visible:ring-*` or equivalent
> - Never `outline-none` / `outline: none` without focus replacement
> - Use `:focus-visible` over `:focus` (avoid focus ring on click)
> - Group focus with `:focus-within` for compound controls
> - Sticky headers/footers/overlays must not cover the focused element
>
> ### Forms
> - Inputs need `autocomplete` and meaningful `name`
> - Use correct `type` (`email`, `tel`, `url`, `number`) and `inputmode`
> - Never block paste (`onPaste` + `preventDefault`)
> - Labels clickable (`htmlFor` or wrapping control)
> - Submit button stays enabled until request starts; spinner during request
> - Errors inline next to fields; focus first error on submit
> - Placeholders end with `…` and show example pattern
>
> ### Typography
> - `…` not `...`
> - Curly quotes `"` `"` not straight `"`
> - Non-breaking spaces: `10&nbsp;MB`, `⌘&nbsp;K`, brand names
> - Loading states end with `…`: `"Loading…"`, `"Saving…"`
> - `font-variant-numeric: tabular-nums` for number columns/comparisons
> - Use `text-wrap: balance` or `text-pretty` on headings (prevents widows)
>
> ### Content Handling
> - Text containers handle long content: `truncate`, `line-clamp-*`, or `break-words`
> - Flex children need `min-w-0` to allow text truncation
> - Handle empty states—don't render broken UI for empty strings/arrays
> - User-generated content: anticipate short, average, and very long inputs
>
> ### Content & Copy
> - Active voice: "Install the CLI" not "The CLI will be installed"
> - Title Case for headings/buttons (Chicago style)
> - Numerals for counts: "8 deployments" not "eight"
> - Specific button labels: "Save API Key" not "Continue"
> - Error messages include fix/next step, not just problem
> - Second person; avoid first person
> - `&` over "and" where space-constrained
>
> ### Anti-patterns (flag these)
> - `user-scalable=no` or `maximum-scale=1` disabling zoom
> - `transition: all`
> - `outline-none` without focus-visible replacement
> - Inline `onClick` navigation without `<a>`
> - `<div>` or `<span>` with click handlers (should be `<button>`)
> - Images without dimensions
> - Form inputs without labels
> - Icon buttons without `aria-label`
> - Hardcoded date/number formats (use `Intl.*`)

## Do's and Don'ts

### Do
- Keep `{colors.surface}` (#F2EFE9) as the only background color for reading surfaces. Warm off-white, never pure white, never a colored tint.
- Reserve `{colors.accent}` (#0039A6) for the single chromatic accent on chrome: links, focus, one accent button per screen.
- Turn on `font-variant-numeric: tabular-nums` for every number that sits next to another number or updates over time.
- Use `{rounded.none}` (0px) for every panel, card, chip, table, and timeline node; `{rounded.control}` (2px) only on buttons and inputs; `{rounded.full}` only on line bullets.
- Carry every elevation cue with a `{colors.hairline}` or `{colors.hairline-strong}` border, never a shadow.
- Use the exact ten MTA line hexes and their documented on-bullet text color. Do not restyle them to fit a palette.
- Set tier state directly as colored text, always paired with the tier word and, where space allows, an icon.

### Don't
- Don't introduce a second chromatic UI accent. `{colors.line-bdfm}` (#FF6319) paints the B/D/F/M bullet and nothing else — it is never a button, link, or focus color.
- Don't round panels, cards, chips, or tables beyond 0px, and never use a pill shape outside the line bullet.
- Don't add box-shadow, blur, `backdrop-filter`, or gradient anywhere in the system.
- Don't animate with `transition: all`; animate the specific property that changed.
- Don't render a status tier below its computed contrast ratio; if a new tint is proposed, compute its ratio against `{colors.surface}` before shipping it, don't eyeball it.
- Don't invent colors, fonts, radii, or spacing values outside this token set. If a new component needs a token that doesn't exist here, add it to this file first, in the same format, with a computed contrast ratio if it carries text.
- Don't set body copy or numerals in a serif or a display-only weight; body stays at 400, numerals in `{typography.timetable-figure}` at 600.
