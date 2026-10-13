---
name: Reel
version: 2.0
description: Clear, compact tool UI for films, series and music. Simple on the surface, well structured, symbols everywhere, dark-first with a full light set.
colors:
  canvas: "#F5F5F7"        # page background
  surface: "#FFFFFF"       # cards, sidebar, sheets
  surface-raised: "#FFFFFF" # active segment, toasts
  surface-sunken: "#EFEFF3" # stat tiles, empty states, segmented track
  surface-hover: "#F1F1F5" # row and nav hover
  field: "#FFFFFF"         # inputs and selects
  border: "#E4E4EA"
  border-strong: "#CFCFD8"
  text: "#15151A"
  text-muted: "#5B5B68"
  text-subtle: "#7E7E8C"   # placeholders and icons only
  accent: "#5B4BF0"        # electric violet
  accent-hover: "#4A3AD8"
  accent-soft: "#EEECFF"
  accent-line: "#CBC5FF"
  star: "#D98A04"          # rating stars
  success: "#15803D"
  warning: "#B45309"
  danger: "#D1291B"
colors-dark:
  canvas: "#0B0B0F"
  surface: "#131318"
  surface-raised: "#1A1A21"
  surface-sunken: "#0F0F13"
  surface-hover: "#1C1C24"
  field: "#0E0E12"
  border: "#24242D"
  border-strong: "#363641"
  text: "#ECECF1"
  text-muted: "#A3A3B0"
  text-subtle: "#7B7B89"
  accent: "#9488FF"
  accent-hover: "#ADA3FF"
  accent-soft: "#1F1C3A"
  accent-line: "#3D3878"
  on-accent: "#0B0B0F"     # dark text on the bright violet
  star: "#FBBF24"
  success: "#4ADE80"
  warning: "#FBBF24"
  danger: "#F87171"
typography:
  font-display: "'Space Grotesk Variable', 'Inter Variable', system-ui, sans-serif"
  font-body: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
  font-mono: "'JetBrains Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace"
  display:  { size: 36px, line-height: 1.08, weight: 700, tracking: -0.025em, font: display }   # title on the detail page
  h1:       { size: 28px (24px phone), line-height: 1.15, weight: 700, tracking: -0.025em, font: display }
  h2:       { size: 18px, line-height: 1.3, weight: 600, tracking: -0.015em, font: display }
  h3:       { size: 15px, line-height: 1.4, weight: 600, font: body }
  body:     { size: 15px, line-height: 1.55, weight: 400, font: body }
  body-sm:  { size: 14px, font: body }
  label:    { size: 13px, weight: 500–600, font: body }
  caption:  { size: 12px, font: body }
  eyebrow:  { size: 11px, weight: 500, tracking: 0.08em, uppercase, font: mono }
  number:   { size: 26–32px, weight: 700, tabular-nums, font: display }
spacing:
  base: 4px
  scale: [0, 4, 8, 12, 16, 24, 32, 48, 64, 96]
radius:
  sm: 6px     # badges, posters, logos
  md: 8px     # buttons, inputs, tiles
  lg: 14px    # cards
  xl: 20px    # sheets, swipe card
  full: 999px # counters, avatars, tab pills
breakpoints:
  phone: "< 768px"     # app bar + bottom tab bar
  tablet: "768–1023px" # icon rail
  desktop: ">= 1024px" # full sidebar
---

# DESIGN.md: Reel

Read this file before writing or changing UI. Tokens live in `frontend/src/styles/tokens.css`; components use variables only.

## 1. Character

- **A tool, not a magazine.** Calm surfaces, clear structure, quick to scan. Every area has its symbol; every section starts with an icon and a short heading.
- **Dark first, light equal.** Dark (deep blue-black, layered surfaces) suits films and evenings on the sofa; the light set uses the same roles. Users choose *System / Hell / Dunkel* in the sidebar or the "Mehr" sheet (`src/lib/theme.js`, applied before first paint in `index.html`).
- **One accent.** Electric violet marks what is active or primary: nav item, pressed segment, primary button, focus, progress. Gold is reserved for rating stars. The brand gradient (violet → pink) appears only on the logo mark and progress fills.
- **Density:** compact lists and toolbars, generous around reading text (overview, notes).

## 2. Typography

- **Space Grotesk** for headings, the wordmark and big numbers – technical and friendly.
- **Inter** for all UI and reading text (`cv11`, `ss01` enabled).
- **JetBrains Mono** for data: counters, dates, eyebrow labels (`BIBLIOTHEK`, stat tile labels), episode codes, file names.
- All three are self-hosted variable fonts via `@fontsource-variable/*` (no Google requests).
- Inputs use 16px on touch screens (`--input-font`) so iOS does not zoom.

## 3. Layout

| Width | Navigation | Content |
|---|---|---|
| ≥ 1024px | Sidebar 248px: logo, groups *Bibliothek · Entdecken · Gemeinsam · Ich*, footer with Mitteilungen, theme, Abmelden | Max 1000px, 32px padding |
| 768–1023px | Same sidebar as a 76px icon rail (labels stay for screen readers, tooltips via `title`) | 24px padding |
| < 768px | Sticky app bar (logo, import status, bell) + fixed tab bar: Watchlist · Für dich · Tagebuch · Listen · Mehr. "Mehr" opens a bottom sheet (`<dialog>`) with tiles for every other area, the theme choice and Abmelden | 16px padding, safe-area insets respected |

- The navigation config lives in `src/components/navigation.js` (`AREA_ICON`, `NAV_GROUPS`). Add a new area there – the sidebar, tab bar, sheet and page heading pick it up.
- Page headings use `<PageTitle area="…">` (icon tile + h1). Section headings are `<h2>` with an 18px Lucide icon as first child; it is coloured by CSS.
- Signed-out pages use a centred card on a soft accent glow.

## 4. Components

- **Cards:** `surface`, 1px `border`, radius `lg`, padding 24px (16px phone), `shadow-sm`. Never nest cards.
- **Buttons:** default = secondary (surface + `border-strong`). `.btn-primary` (one per section), `.btn-ghost`, `.btn-danger`, `.btn-compact`, `.btn-icon`. Icon-only buttons need `aria-label` and `title`. Element defaults sit in `:where()` so a class always wins.
- **Segmented control:** sunken track, the pressed segment is a raised chip; counts in a mono pill. On phones long rows scroll sideways.
- **Lists:** rows with poster (48×72), title, meta line (type, year, ★ TMDb score in gold, badges) and actions. Dividers are inset hairlines; rows highlight on hover. On phones the actions move below the title and share the full width.
- **Stat tiles:** `.stats` grid of sunken tiles; mono eyebrow label above a Space Grotesk number.
- **Detail hero:** backdrop fades into the card, poster and title sit on its lower edge.
- **Badges:** 22px, radius `sm`; `badge--accent` for "yours" (rating, list status).
- **Empty states:** dashed border on a sunken area, one sentence and one action.
- **Toasts:** raised surface, `shadow-lg`, bottom right; above the tab bar on phones.
- **Loading:** shimmer skeletons in the final layout; no full-page spinners.

## 5. Rules

- Tokens only; no hex values in components (exception: the share image in `lib/stats.js`, which is an exported PNG).
- WCAG AA: 4.5:1 for text, 3:1 for UI parts. `text-subtle` only for placeholders and icons.
- Status colours always come with an icon or text.
- Focus is always visible (2px accent outline or accent ring on fields).
- Motion explains change only (hover, press, sheet, toast, progress); `prefers-reduced-motion` turns it off.
- Lucide icons only, 16px inline, 18px in headings and navigation, 20px in the tab bar and page titles.
