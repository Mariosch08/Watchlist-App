---
name: Quiet Ink
version: 1.0
description: Warm, editorial, restrained UI system. Professional and calm; deliberately avoids the generic "AI-generated" look.
colors:
  canvas: "#FBFAF7"        # page background, warm off-white
  surface: "#FFFFFF"       # cards, inputs, popovers
  surface-sunken: "#F4F2EE" # code blocks, table headers, sidebars
  border: "#E6E3DD"        # default hairline
  border-strong: "#D3CEC6" # input borders, dividers that must be seen
  text: "#1F1E1C"          # primary text, never pure black
  text-muted: "#5F5B55"    # secondary text, labels
  text-subtle: "#8A857D"   # placeholders, metadata, disabled
  accent: "#2F5D8A"        # ink blue: links, primary button, focus
  accent-hover: "#264D73"
  accent-soft: "#E8EEF4"   # selected rows, accent backgrounds
  success: "#2E7D4F"
  success-soft: "#E7F2EB"
  warning: "#A2650E"
  warning-soft: "#F8EFE0"
  danger: "#B3362C"
  danger-soft: "#F7E6E4"
colors-dark:
  canvas: "#191817"
  surface: "#211F1E"
  surface-sunken: "#161514"
  border: "#33302D"
  border-strong: "#45413D"
  text: "#ECE9E4"
  text-muted: "#ABA59D"
  text-subtle: "#7D776F"
  accent: "#7FA7D1"
  accent-hover: "#9BBBDD"
  accent-soft: "#24303C"
  success: "#6FBF8C"
  warning: "#D9A456"
  danger: "#E07A70"
typography:
  font-display: "'Source Serif 4', Georgia, serif"
  font-body: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', sans-serif"
  font-mono: "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace"
  display:  { size: 40px, line-height: 1.15, weight: 600, tracking: -0.01em, font: display }
  h1:       { size: 32px, line-height: 1.2,  weight: 600, tracking: -0.01em, font: display }
  h2:       { size: 24px, line-height: 1.3,  weight: 600, tracking: 0,       font: display }
  h3:       { size: 18px, line-height: 1.4,  weight: 600, tracking: 0,       font: body }
  body:     { size: 16px, line-height: 1.6,  weight: 400, font: body }
  body-sm:  { size: 14px, line-height: 1.5,  weight: 400, font: body }
  label:    { size: 13px, line-height: 1.4,  weight: 500, font: body }
  caption:  { size: 12px, line-height: 1.4,  weight: 400, font: body }
  code:     { size: 14px, line-height: 1.5,  weight: 400, font: mono }
spacing:
  base: 4px
  scale: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96]
radius:
  sm: 4px     # tags, checkboxes
  md: 6px     # buttons, inputs
  lg: 8px     # cards, dialogs
  full: 999px # avatars, status dots only
shadow:
  none: "none"
  sm: "0 1px 2px rgba(31,30,28,0.06)"
  md: "0 4px 12px rgba(31,30,28,0.08), 0 1px 3px rgba(31,30,28,0.06)"
  lg: "0 12px 32px rgba(31,30,28,0.12), 0 2px 6px rgba(31,30,28,0.06)"
motion:
  fast: 120ms
  base: 180ms
  slow: 260ms
  easing: "cubic-bezier(0.2, 0, 0, 1)"
breakpoints:
  sm: 640px
  md: 768px
  lg: 1024px
  xl: 1280px
---

# DESIGN.md: Quiet Ink

Read this file before writing or changing any UI. Follow it strictly. If a request conflicts with this file, follow the file and mention the conflict.

## 1. Visual Theme & Atmosphere

- **Mood:** calm, editorial, trustworthy. Like a well-typeset notebook or a good documentation site, not a startup landing page.
- **Philosophy:** content first, chrome second. Every visual element must justify its existence. Hierarchy comes from typography and spacing, not from color, gradients or effects.
- **Density:** medium. Generous around reading content, tighter in tables, lists and toolbars.
- **Feel of the surfaces:** warm off-white paper, hairline borders, almost no shadow. One accent color used sparingly.
- **Reference qualities:** printed magazines, Swiss typography, well-made internal tools. Not: crypto dashboards, gaming UIs, AI product launches.

## 2. Color Palette & Roles

Use tokens only. Never hard-code a hex value in a component.

| Token | Role |
|---|---|
| `canvas` | Page background. Never pure white `#FFF` for the page. |
| `surface` | Cards, inputs, menus, dialogs. |
| `surface-sunken` | Code blocks, table header rows, sidebars, empty-state areas. |
| `border` | Default 1px hairlines between items and around cards. |
| `border-strong` | Input borders, dividers that must stay visible. |
| `text` | Body and headings. Never pure black. |
| `text-muted` | Labels, secondary info, table metadata. |
| `text-subtle` | Placeholders, timestamps, disabled text. Never for essential info. |
| `accent` | Links, primary button, focus ring, active nav item. Nothing else. |
| `accent-soft` | Selected row, active tab background, highlighted callout. |
| `success / warning / danger` | Status only (badges, inline validation, toasts). Always paired with an icon or text, never color alone. |

**Rules**
- The accent appears in at most ~5% of any screen. If everything is blue, nothing is.
- Exactly one primary (accent-filled) button per view or section.
- Status colors are never used for decoration.
- Dark mode uses `colors-dark` with the same roles. Do not simply invert; keep warmth.
- All text must meet WCAG AA contrast: 4.5:1 for body text, 3:1 for large text (≥24px or ≥18.66px bold) and UI elements.

## 3. Typography Rules

- **Display & h1–h2:** Source Serif 4 (Google Fonts). Gives the editorial, human character.
- **Everything else:** IBM Plex Sans. Numbers in tables use `font-variant-numeric: tabular-nums`.
- **Code, IDs, keys, file paths:** IBM Plex Mono.
- Load fonts with `font-display: swap`; load only the weights used (400, 500, 600).

**Hierarchy table:** see `typography` in the front matter. Do not invent sizes in between.

**Rules**
- Maximum 3 type sizes visible in one component, maximum 5 on one screen.
- Weights: 400 for body, 500 for labels and buttons, 600 for headings. Never 700+ in UI, never 300 or lighter.
- Body line length: 60–75 characters (`max-width: 68ch`) for reading text.
- Sentence case everywhere: headings, buttons, labels, menu items. No Title Case, no ALL CAPS except short tags (≤ 2 words, `caption` size, `letter-spacing: 0.04em`).
- No text gradients, no outlined text, no text shadows.
- Hero/page titles are `h1` (32px), not 64–96px. Size does not equal importance.
- Left-align text. Center only for short empty states and single-line confirmations.

## 4. Component Stylings

All interactive elements have these states: default, hover, active (pressed), focus-visible, disabled, and where relevant loading and error.

**Focus:** `outline: 2px solid accent; outline-offset: 2px;` on `:focus-visible`. Never remove focus outlines without replacing them.

### Buttons
| Variant | Default | Hover | Notes |
|---|---|---|---|
| Primary | bg `accent`, text white | bg `accent-hover` | One per section. |
| Secondary | bg `surface`, 1px `border-strong`, text `text` | bg `surface-sunken` | Default choice. |
| Ghost | transparent, text `text-muted` | bg `surface-sunken`, text `text` | Toolbars, inline actions. |
| Danger | bg `surface`, 1px `danger`, text `danger` | bg `danger-soft` | Filled red only inside a confirm dialog. |

- Height 36px (default) or 32px (compact). Padding 0 14px. Radius `md`. Label `label` style.
- Icon + text: 16px icon, 8px gap. Icon-only buttons need `aria-label` and a tooltip.
- Disabled: 50% opacity, `cursor: not-allowed`, no hover effect.
- Loading: keep width, replace label with spinner + short text ("Saving…"). Disable during loading.
- Button labels are verbs describing the result: "Save changes", "Delete project". Never "Submit", "Click here", "Let's go!".

### Inputs & forms
- Height 36px, padding 0 12px, bg `surface`, 1px `border-strong`, radius `md`.
- Hover: border `text-subtle`. Focus: border `accent` + focus ring. Error: border `danger`, message below in `danger`, `body-sm`, with icon.
- Label above the input (`label` style, `text`), 6px gap. Never use placeholder as label.
- Helper text below in `caption`, `text-muted`.
- Group related fields; 16px between fields, 32px between groups.
- Validate on blur and submit, not on every keystroke.
- Required fields: mark the optional ones instead ("(optional)") when most fields are required.

### Cards
- bg `surface`, 1px `border`, radius `lg`, padding 20–24px, shadow `none`.
- Hover (only if clickable): border `border-strong`, shadow `sm`. Whole card is the link; no nested competing buttons except one secondary action.
- Never nest cards inside cards.

### Tables & lists
- Header row: bg `surface-sunken`, `label` style, `text-muted`.
- Rows: 44px height, 1px `border` bottom, no zebra stripes. Hover bg `surface-sunken`. Selected bg `accent-soft`.
- Numbers right-aligned with tabular figures. Text left-aligned.
- Empty table: short sentence + one action, inside the table area.

### Navigation
- Top bar: 56px, bg `canvas`, 1px `border` bottom, no shadow, no blur.
- Sidebar: 240px, bg `surface-sunken`. Items 32px high, radius `md`. Active: bg `accent-soft`, text `accent`, weight 500.
- Maximum 7 top-level items.

### Dialogs, menus, toasts
- Dialog: max-width 480px (forms up to 640px), radius `lg`, shadow `lg`, overlay `rgba(25,24,23,0.4)`. Title `h3`, actions right-aligned, primary on the right. Close on Esc; trap focus.
- Dropdown menus: radius `lg`, shadow `md`, 1px `border`, items 32px.
- Toasts: bottom-right, `surface`, shadow `md`, auto-dismiss after 5s (errors stay until dismissed). One line + optional action.

### Badges / tags
- Height 22px, padding 0 8px, radius `sm`, `caption` weight 500, soft background + matching text color (e.g. `success-soft` / `success`).

### Empty, loading, error states
- Every list, table and page defines all three.
- Loading: skeletons matching the final layout for >300ms waits; no full-page spinners.
- Empty: one sentence what this is, one action. No illustrations of robots, rockets or sparkles.
- Error: say what happened and what to do, in plain language. Never show raw stack traces to users.

### Icons
- One set only: Lucide (1.5px stroke). 16px inline, 20px in navigation.
- Icons support text; they don't replace it, except universally known ones (close, search, menu).

## 5. Layout Principles

- **Spacing:** only values from the scale (4, 8, 12, 16, 24, 32, 48, 64, 96). No 10px, 15px, 20px…
- **Rhythm:** related items 8–12px apart, sections 32–48px, page-level blocks 64–96px.
- **Container:** max-width 1120px for app content, 720px for reading/forms, centered with 24px side padding (16px on mobile).
- **Grid:** 12 columns, 24px gutter on desktop; single column below `md`.
- **Alignment:** everything snaps to a shared left edge. Avoid centered layouts for app screens.
- **Whitespace** is the main tool for grouping. Use borders only when whitespace is not enough; use backgrounds only for distinct regions.

## 6. Depth & Elevation

| Level | Use | Shadow |
|---|---|---|
| 0 | Page, cards, tables | `none` (use `border`) |
| 1 | Hovered clickable card, sticky header on scroll | `sm` |
| 2 | Dropdowns, popovers, toasts | `md` |
| 3 | Dialogs | `lg` |

- Elevation means "floats above content". Static content never gets a shadow.
- No glow, no colored shadows, no inner shadows, no glassmorphism / `backdrop-filter: blur`.

## 7. Do's and Don'ts

### Do
- Use real, specific content in mockups (realistic names, numbers, dates). Swiss formats where relevant: `12.10.2026`, `CHF 1'250.00`, 24h time.
- Write UI copy short, concrete and in sentence case. Prefer "3 items" over "You have 3 items in your list!".
- Keep one clear primary action per screen.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Make every interactive element reachable and usable by keyboard.
- Reuse existing components before creating new ones.

### Don't (these make UI look AI-generated)
- ❌ Purple/blue/pink gradients, gradient text, gradient buttons, gradient borders.
- ❌ Glowing effects, neon, aurora/blob backgrounds, mesh gradients, grain overlays.
- ❌ Glassmorphism, frosted panels, heavy blur.
- ❌ Emojis in headings, buttons, labels or navigation. ✨🚀 are banned.
- ❌ Sparkle icons, "magic" wands, robot illustrations for AI features.
- ❌ Oversized hero headlines (>40px) with a subtitle and two CTA buttons as the default layout.
- ❌ The "three feature cards with icon in a colored circle" row.
- ❌ Fully rounded pill buttons and 16–24px radii on cards.
- ❌ Shadows on every card; drop shadows plus borders plus backgrounds all at once.
- ❌ Hype copy: "Unlock", "Supercharge", "Seamless", "Revolutionize", "Elevate", "Effortless", "Next-gen", exclamation marks.
- ❌ Placeholder text like "Lorem ipsum", "John Doe", "Acme Inc.".
- ❌ Fonts Inter + default Tailwind gray palette + `rounded-2xl shadow-lg` combination.
- ❌ Decorative animations on load (fade-up on every section, floating elements, parallax).
- ❌ Centered everything.
- ❌ Dark mode as the only mode.

## 8. Responsive Behavior

- Mobile first. Design at 375px, then scale up.
- Below `md` (768px): sidebar becomes a drawer behind a menu button; tables become stacked cards or scroll horizontally inside their own container (the page itself never scrolls horizontally).
- Touch targets ≥ 44×44px on touch devices (visual element can be smaller with padding).
- Body text stays 16px on mobile (prevents iOS zoom on inputs). Headings scale down one step (h1 → 26px, display → 32px).
- Dialogs become full-width bottom sheets below `sm`.
- Test at 375, 768, 1024 and 1440px.

## 9. Motion

- Motion explains change, it does not decorate.
- Hover/press: `fast` (120ms). Menus, popovers, toasts: `base` (180ms) fade + 4px translate. Dialogs/drawers: `slow` (260ms).
- Animate only `opacity` and `transform`.
- No bounce, no spring overshoot, no infinite animations except loading indicators.
- With `prefers-reduced-motion: reduce`: disable translates, keep instant opacity changes.

## 10. Accessibility (non-negotiable)

- Semantic HTML first: `button` for actions, `a` for navigation, real `label` for inputs, landmarks (`header`, `nav`, `main`).
- Visible focus on every interactive element.
- Color is never the only carrier of meaning.
- All images have meaningful `alt` (or `alt=""` if decorative).
- Form errors are announced (`aria-describedby`, `aria-invalid`).
- Contrast AA minimum (see section 2).
- `lang` attribute set on `<html>`.

## 11. Implementation Notes

- Expose all tokens as CSS custom properties on `:root` (e.g. `--color-accent`, `--space-4`, `--radius-md`) and switch the dark set under `[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`.
- If Tailwind is used, map the tokens in `tailwind.config` / `@theme` and do not use default palette colors (`gray-500`, `indigo-600`, etc.) directly.
- No inline styles with raw values; no magic numbers.
- New component? Check this file first, then existing components, then build. Document new patterns here.

## 12. Agent Prompt Guide

**Quick reference:** canvas `#FBFAF7` · text `#1F1E1C` · muted `#5F5B55` · border `#E6E3DD` · accent `#2F5D8A` · serif headings (Source Serif 4) · IBM Plex Sans body · radius 6/8px · shadows only for floating elements.

**Checklist before finishing any UI task**
1. Only tokens used? No raw hex, no off-scale spacing?
2. Exactly one primary button per section?
3. All states defined (hover, focus, disabled, loading, empty, error)?
4. Keyboard and screen-reader usable? Contrast AA?
5. Works at 375px?
6. Nothing from the "Don't" list present?
7. Copy in sentence case, concrete, no hype words, no emojis?

**Example prompts**
- "Build the settings page following DESIGN.md: left sidebar nav, 720px form column, grouped sections with h2 headings, one primary 'Save changes' button."
- "Create a data table component per DESIGN.md section 4 with sorting, empty, loading and error states."

---

## Anhang: Umsetzung in diesem Projekt (Watchlist-App)

Ersetzt das frühere Design „Projektionsraum“ (Oktober 2026, auf Wunsch von Mario). Bei Konflikten gilt dieses Dokument.

- **Tokens:** `frontend/src/styles/tokens.css` (`--color-*`, `--space-1…9` = 4…96 px, `--radius-sm/md/lg`, `--text-*`, `--motion-*`). Dunkles Set über `prefers-color-scheme` und `[data-theme="dark"]`.
- **Schriften:** selbst gehostet über `@fontsource` (Source Serif 4 600, IBM Plex Sans 400/500/600, IBM Plex Mono 400) statt Google Fonts – gleiche Schriften, keine Anfragen an Google (Datenschutz). `font-display: swap` ist dort Standard.
- **Icons:** `lucide-react` (Star, Plus, Check, LogOut, AlertCircle, CheckCircle2).
- **Primitive** (`styles/components.css`):
  - Buttons: `<button>` = Secondary, `.btn-primary` (genau einer pro Abschnitt), `.btn-ghost`, `.btn-danger`, Modifikatoren `.btn-compact`, `.btn-icon`; `button.link` nur für Text-Links.
  - Layout: `.topbar`, `.nav`, `.page` (720 px Lesebreite), `.card`, `.card--auth`, `.card-head`, `.stack`, `.actions`, `.inline-form`.
  - Inhalte: `ul.list` + `.title-row` (44 px Zeilen, Hover `surface-sunken`), `.poster`, `.meta`, `.badge`/`.badge--accent`, `.empty`, `.notice--error/--success` (immer mit Icon), `.caption`, `.muted`, `.mono`.
  - Zustände: Skeletons in `components/Skeleton.jsx` (`TitleRowSkeleton`, `CardSkeleton`).
- **React-Komponenten:** `Form.jsx` (`useSubmit`, `Messages`), `TitleRow`, `WatchlistActions`, `ImportProgress`, `NotFoundResolver`, `Skeleton`, `Layout`.
- **Prüfung:** UI-Änderungen mit Playwright-Screenshots bei 375 px und Desktop, hell und dunkel (gemockte Supabase-Antworten), und Mario zeigen.
