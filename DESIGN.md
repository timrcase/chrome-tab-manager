---
name: Tab Manager
description: A precision tab manager for power users, built with terminal DNA.
colors:
  phosphor-green: "#3dba6e"
  phosphor-dim: "#1a3a22"
  terminal-black: "#0d0f0d"
  surface-1: "#131a13"
  surface-2: "#182018"
  terminal-border: "#1e2d1e"
  text-primary: "#dff0df"
  text-muted: "#7a9a7a"
  tag-well: "#1a2a1a"
  danger-red: "#d95555"
typography:
  title:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.3px"
  body:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.5px"
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "5px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.phosphor-green}"
    textColor: "{colors.terminal-black}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-primary-hover:
    backgroundColor: "{colors.phosphor-green}"
    textColor: "{colors.terminal-black}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  button-ghost-hover:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "7px 14px"
  input-default:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  input-focus:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "5px 8px"
  chip-tag:
    backgroundColor: "{colors.tag-well}"
    textColor: "{colors.text-muted}"
    rounded: "20px"
    padding: "2px 8px"
  chip-tag-active:
    backgroundColor: "{colors.phosphor-dim}"
    textColor: "{colors.phosphor-green}"
    rounded: "20px"
    padding: "2px 8px"
---

# Design System: Tab Manager

## 1. Overview

**Creative North Star: "The Phosphor Workbench"**

Tab Manager is a precision tool for power users who live in context. The design system takes its DNA from the CRT phosphor monitor — not as nostalgia, but as a source of honest constraints: high contrast, purposeful color, and a surface that recedes until you need it. Every element on screen is there because it works, not because it fills space.

The system uses a single accent — Phosphor Green (`#3dba6e`) — against near-black green-tinted surfaces. This is not a dark-mode app that happens to be green. The green is structural: every neutral is tinted toward the hue, from the base layer up through inputs and borders. The accent is rare; its rarity is the point. When green appears in a concentrated form, it means something: an active state or a confirmed action.

Interaction feel is confident and deliberate. Elements do not eagerly animate or slide into place. State changes are crisp — a border sharpens, a color shifts — and the UI steps aside. Satisfying in the way a clean `git commit` is satisfying: task done, cursor ready.

This system explicitly rejects: the Halloween terminal (green glow blobs, scanline overlays, blinking cursor decoration); the generic dark SaaS (pure charcoal plus blue or purple accent, indistinguishable from any Tailwind scaffold); and retro cosplay of any kind. The phosphor reference is in the substrate, not in the ornamentation.

**Key Characteristics:**
- Single accent color used in ≤15% of any surface; its absence makes its presence felt
- All neutrals tinted toward the green hue; no pure greys in the system
- Monospace (JetBrains Mono) reserved for functional terminal moments: keyboard hints and timestamps
- Flat by default; tonal layering creates depth without shadows
- State transitions at 150ms maximum; no loading spinners for local operations
- Density respects power users; no padding added for breathing room that was not needed

## 2. Colors: The Phosphor Palette

One accent, many depths. Every neutral carries the hue.

### Primary
- **Phosphor Green** (`#3dba6e`): The sole accent. Used on active states, primary button fill, active tab indicators, and focused input borders. Never used decoratively. Its presence signals interactivity or confirmation; its absence signals rest.
- **Phosphor Dim** (`#1a3a22`): The accent's shadow. Background tint behind accent text (active chips, checked toggles). Keeps the accent from floating on bare black.

### Neutral
- **Terminal Black** (`#0d0f0d`): Base layer. Page background. Slightly warmer than void black — the ambient warmth of a phosphor screen, not a blank.
- **Surface One** (`#131a13`): Card and panel backgrounds. One layer above the base; green-tinted charcoal.
- **Surface Two** (`#182018`): Input backgrounds and elevated containers. Visibly lighter than Surface One; distinguishes interactive fields from inert panels.
- **Terminal Border** (`#1e2d1e`): All borders and dividers. Structural but not decorative.
- **Text Primary** (`#dff0df`): Primary readable text. Off-white with a deliberate green cast — reads as neutral in context, reveals its family in isolation.
- **Text Muted** (`#7a9a7a`): Labels, metadata, placeholder text, helper copy. Dimmed but still legibly green-family.
- **Tag Well** (`#1a2a1a`): Tag and chip resting background. Sits between Surface One and Phosphor Dim.
- **Danger Red** (`#d95555`): Destructive actions and error states only. Warm red tuned to harmonize with the green system rather than fight it.

### Named Rules
**The One Voice Rule.** Phosphor Green is the only accent. It appears on ≤15% of any given surface. No secondary accent. No blue, purple, teal, or orange. Every other color is a neutral in the green family.

**The Substrate Rule.** Every neutral from `terminal-black` to `text-muted` is tinted toward the green hue. A pure grey (`#1a1a1a`, `#888`) does not belong in this system. When adding new neutrals, drift toward green, never toward grey.

**The No-Glow Rule.** The accent color is never expressed as a glow, bloom, box-shadow, or text-shadow. A crisp border-color or background shift is the maximum expression of Phosphor Green. Diffuse halo effects are the anti-reference.

## 3. Typography

**UI Font:** System sans-serif (ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI')
**Mono Font:** JetBrains Mono (with Fira Code, ui-monospace as fallbacks)

**Character:** The system sans carries all prose and UI labels — neutral, legible, invisible. JetBrains Mono carries the extension's terminal identity: keyboard hint strings and timestamps. The contrast is deliberate: workhorse sans interrupted by purposeful mono. Mono is the seasoning, not the dish.

### Hierarchy
- **Title** (700, 22px, line-height 1.2, -0.3px tracking): App title in the manager header. Appears once per view. Tight tracking makes it read as a logotype rather than a heading.
- **Body** (400–500, 14px, line-height 1.5): Tab titles, form labels, and most interactive elements. Weight 500 used for item titles and active states; weight 400 for all supporting copy.
- **Secondary** (400, 13px): Input text, button labels, tag chip content. One step below body — distinguishes interactive controls from content.
- **Label** (600, 11–12px, 0.5–0.6px tracking, uppercase): Section headers (SAVED TABS, BACKUP). Uppercase tracking is structural, not stylistic — it marks organizational hierarchy at a glance.
- **Mono** (400, 13px, JetBrains Mono): Keyboard shortcuts and timestamps. Colored in `{colors.text-muted}` for ambient timestamp/hint display.

### Named Rules
**The Mono Restraint Rule.** Monospace type appears in exactly two contexts: keyboard hint strings and timestamps. If you are reaching for mono to make something look technical rather than because it is terminal-domain content, use the system sans.

## 4. Elevation

No box-shadows. Depth is expressed entirely through tonal layering: each surface is a lighter step of the same green-tinted near-black. The stack: `terminal-black` (page) → `surface-1` (cards, panels) → `surface-2` (inputs, nested elements). Borders at `terminal-border` define edges without implying lift.

The system is flat at rest. No hover shadow on cards, no drop shadow behind the popup. The sole exception: a floating overlay (tooltip, dropdown) that must read as elevated above a card surface may use `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.65)` — dark, tight radius, not diffuse. This is a functional signal, not atmosphere.

### Named Rules
**The Tonal Stack Rule.** Never skip a layer. Inputs sit on Surface Two, which sits on Surface One (cards), which sits on Terminal Black. Placing an input directly on the base layer violates the stack and flattens the visual hierarchy.

**The Flat-At-Rest Rule.** Surfaces are flat at rest. If something needs a shadow to feel like an overlay, it should be an overlay (positioned absolutely, z-indexed). Cards in a list are not overlays; they do not get hover shadows.

## 5. Components

### Buttons
Confident and deliberate. No gradients, no soft hover halos. Opacity steps signal state.

- **Shape:** Gently rounded (5px — enough to read as modern without softening the tool feel)
- **Primary:** Phosphor Green fill (`#3dba6e`), Terminal Black text (`#0d0f0d`), 7px 14px padding. Hover: opacity 0.9. Active: opacity 0.75. Text is always Terminal Black — the contrast is correct and the combination is part of the identity.
- **Secondary:** Surface Two background, Text Primary label, Terminal Border stroke. Hover: border shifts to Phosphor Dim.
- **Ghost:** Transparent background, Text Muted label, no border. Hover: label brightens to Text Primary. Used for low-hierarchy actions (View saved tabs ↗).
- **Danger:** Danger Red fill, white text. Same shape and padding as primary. Hover: opacity 0.85.
- **All transitions:** 150ms ease. No slower.

### Tag Chips
- **Shape:** Pill (20px radius)
- **Default:** Tag Well background, Terminal Border stroke, Text Muted label. Hover: border shifts to Phosphor Green, label brightens to Text Primary.
- **Active/filter state:** Phosphor Dim background, Phosphor Green border, Phosphor Green label. This is the maximum color expression for a chip — no additional decoration.
- **Remove button (×):** Text Muted; shifts to Danger Red on hover. No background, no border.

### Cards / Item List
- **Shape:** 8px radius
- **Background:** Surface One
- **Border:** 1px Terminal Border at rest; shifts to Phosphor Dim on hover
- **Shadow:** None. See Elevation section.
- **Padding:** 12px 14px for item rows; 14px for expanded detail panels
- **Expanded state:** A 1px Terminal Border rule separates the header from the detail panel. The panel appears; it does not slide or animate open.

### Inputs / Fields
- **Style:** Surface Two background, Terminal Border stroke, 5px radius, 5px 8px padding
- **Focus:** Border color shifts to Phosphor Green. No glow. The color change is the signal.
- **Tag input area:** Same surface and border, min-height 34px to accommodate chip wrapping. `focus-within` triggers the green border on the container.
- **Error state:** Border shifts to Danger Red. Never red background.
- **Placeholder text:** Text Muted color.

### Tab Navigation
- **Default:** Text Muted label, transparent bottom indicator
- **Active:** Text Primary label, 2px Phosphor Green bottom border. Sits on a 1px Terminal Border baseline.
- **Badge counts:** Surface Two pill at rest; Phosphor Dim pill with Phosphor Green text when the parent tab is active.
- **Transition:** 150ms on color and border-color.

## 6. Do's and Don'ts

### Do:
- **Do** tint every neutral toward the green hue. There are no pure greys in this system — `#1a1a1a` becomes `#131a13`; `#888` becomes `#7a9a7a`.
- **Do** use JetBrains Mono exclusively for keyboard hint strings and timestamps. Use the system sans for everything else.
- **Do** express depth through the tonal stack: Terminal Black → Surface One → Surface Two. Layer surfaces in order.
- **Do** keep all state transitions at 150ms or under. The UI confirms before the user doubts.
- **Do** keep Phosphor Green rare. One active state, one primary action, one badge class per screen — no more.
- **Do** use uppercase with letter-spacing for structural section labels (SAVED TABS, BACKUP, ARCHIVE). They mark hierarchy; they are not decorative.
- **Do** let borders and background tints carry hover and active states rather than opacity shifts on the element itself (exception: buttons use opacity by design).

### Don't:
- **Don't** add glow, bloom, box-shadow, or text-shadow to the Phosphor Green accent. The Halloween terminal look — diffuse phosphor halos, glowing blobs — is the primary anti-reference.
- **Don't** add scanline overlays, blinking cursor decorations, or CRT filter effects. Terminal DNA lives in the color substrate and type choices, not in visual filters.
- **Don't** introduce a second accent color. Blue, purple, teal, cyan, orange — none belong here. The One Voice Rule is absolute.
- **Don't** use pure greys or pure black. No `#000`, `#111`, `#888`, `#aaa`. All neutrals carry the hue.
- **Don't** animate layout properties (height, width, padding, margin). Use opacity and color transitions only.
- **Don't** slide elements into place or use entrance animations for state changes. A panel appears; it does not glide.
- **Don't** use gradient text (`background-clip: text` with a gradient). Single solid colors only.
- **Don't** use glassmorphism or backdrop-filter effects decoratively.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards or list items. Use background tint, leading icons, or full borders instead.
- **Don't** replicate the generic dark SaaS: pure charcoal substrate plus a purple or blue accent equals any Tailwind app. This system is distinguishable by its substrate color alone; protect that distinction.
