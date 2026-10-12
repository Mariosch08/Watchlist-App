# Design-Regeln (verbindlich für jede UI-Arbeit)

Vorgaben von Mario, umgesetzt im Stil **„Projektionsraum“**: warmes Dunkelkammer-Schwarz, Kino-Leuchtschrift-Amber als dominante Farbe, Zinnoberrot als scharfer Druck-Akzent, Text in Plakatpapier-Creme. Helles Thema = cremefarbenes Plakatpapier mit Druckerschwarz.

## 1. Eigenständige Ästhetik
- Farben **nur** aus `frontend/src/styles/tokens.css` (`--color-*`). Amber (`--color-accent`) dominiert, Zinnober (`--color-print`) nur für scharfe Akzente/Gefahr.
- Schriften: **Fraunces** (Display, Titel), **Instrument Sans** (Fliesstext), **IBM Plex Mono** (Meta-Zeilen in Versalien wie Kinotickets). Selbst gehostet via `@fontsource` (keine Google-Fonts-Anfragen). Inter/Roboto/Arial/system-ui sind tabu.
- Starke typografische Hierarchie: grosse Fraunces-Überschriften, kleine Mono-„Eyebrows“ (`.eyebrow`) darüber.

## 2. Tiefe und Bewegung
- Hintergrund in Schichten: Projektor-Lichtkegel (radial-gradient), warmer Bodenschein, Filmkorn (SVG-Noise in `body::before`).
- Panels (`.panel`) mit Verlauf, feiner Linie und Schatten; Auth-Panels mit Ticket-Perforation (`.panel--ticket`).
- Bewegung: genau **ein** orchestrierter Seitenaufbau – `.reveal` + `--i` (Stagger via `animation-delay`). Hover nur dezent (Helligkeit). `prefers-reduced-motion` wird respektiert.
- Kein 3-Karten-Raster, keine generische Sidebar, solange die Struktur es nicht verlangt.

## 3. Code-Disziplin
- Kleine Dateien mit einer Aufgabe: Seiten in `pages/`, wiederverwendbare Teile in `components/` (`TitleRow`, `WatchlistActions`, `Form`), Datenzugriff in `lib/` (`watchlist.js`), Texte/Labels in `lib/labels.js`.
- Styles: `styles/tokens.css` → `base.css` → `components.css` → `motion.css`. Keine Hex-Werte, Magic Numbers oder festen Abstände ausserhalb der Tokens (`--space-*`, `--radius-*`, `--text-*`).
- Bestehende Primitive wiederverwenden statt neu bauen: `button` (Standard = Amber), `button.link`, `.danger`, `.icon-button`, `input`, `select`, `.panel`, `.eyebrow`, `.meta`, `.row`, `.muted`/`.error`/`.info`.

## 4. Arbeitsweise
- UI-Änderungen immer mit Screenshot (Playwright, gemockte Supabase-Antworten) prüfen und Mario zeigen.
- Positiv formulieren: Was soll sichtbar sein (z. B. „hoher typografischer Kontrast“), nicht nur was zu vermeiden ist.
