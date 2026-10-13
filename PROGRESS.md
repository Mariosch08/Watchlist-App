# PROGRESS – Media-Watchlist → Entdeckungs-App

> Gedächtnis zwischen Sessions. Neue Session: nur diese Datei + `DECISIONS.md` lesen, dann die nächste offene Phase umsetzen.

## Status
- **Erledigt:** alle Phasen 0–13 (3b Frontend-Logik, 4 Detailseite, 5 Serien, 6 Empfehlungen, 7 Streaming-Tools, 8 Musik, 9 Freunde & Listen, 10 Tagebuch & Importe, 11 Statistik, 12 Mails & App, 13 Abschluss), Design „Reel“ (ersetzt „Quiet Ink“, D58), Sicherheits-Fix
- **Aktuelle Phase:** – (Plan abgeschlossen und live; danach: stats.fm (D57), Design „Reel“ (D58), „Reel clean“ (D59) und Musik-Tracker mit Hörprofil (D60) sechs medienübergreifende Funktionen samt einheitlicher Agenda (D61–D67), Geheimtipp-Fix (D68) und Monatskalender mit Musik pro Tag (D69))
- **Nächster konkreter Schritt:** Nach dem Merge Rückmeldungen aus dem echten Betrieb einarbeiten; offene Review-Befunde (`docs/reviews/`) prüfen; Ideen unten.

## Repo-Überblick
```
package.json, vitest.config.js   Root: Tests für DB (PGlite) + Logik der Edge Functions
tests/supabase-stub.sql, db.js   Nachbau auth-Schema/Rollen; createDb(), signUp(), asUser(), asAdmin()
tests/*.test.{js,ts}             auth, isolation, data-model (alle Tabellen/Phasen), friends (Rechte Phase 9), tmdb, imdb, letterboxd,
                                 importJob, csv, series, scoring, availability, music (inkl. Verschlüsselung), mail
supabase/config.toml             Alle Functions mit verify_jwt=false (Login bzw. Cron-Secret wird im Code geprüft)
supabase/migrations/*.sql        Schema, RLS, Trigger, RPCs – nur additive Migrationen
supabase/functions/_shared/      reine Module (auch vom Frontend importiert): tmdb, imdb, letterboxd (+Trakt), importJob, csv, series, ics,
                                 scoring, availability, music, mail, crypto; dazu admin/auth/cors/cron
supabase/functions/tmdb/         search/title/details/season/providers/genres/find/top_rated (Cache in tmdb_cache)
supabase/functions/imdb/         Import (IMDb CSV, Letterboxd CSV, Trakt JSON) in Batches, resolve/dismiss, IMDb-Export
supabase/functions/availability/ scan (Streaming pro Watchlist-Titel) + Cron „check“ (Verfügbarkeits-Alarme)
supabase/functions/calendar/     ICS-Abo per Token (Folgen, Filmstarts, Konzerte)
supabase/functions/series-tracker/, discovery-media/, discovery-music/, notify-email/   Cron-Jobs (+ Nutzer-Aktionen refresh/spotify-connect/test)
.github/workflows/deploy.yml     PR: Tests, Lint, Build, Deno-Check · main: db push, functions deploy, Secrets CRON_SECRET/APP_URL, Pages
.github/workflows/cron.yml       04:45 UTC Vorschläge + Musik, 05:15 UTC Serien + Alarme, alle 30 Min. Mails
frontend/src/
  pages/                         Watchlist, Discover, Music, Streaming, Calendar, Diary, Stats, Lists, ListDetail, Friends, Share,
                                 TitleDetails, Notifications, ImportExport, Profile, SpotifyCallback, Auth-Seiten
  components/                    details/, discover/, music/, lists/ (SwipeDeck, MovieNights), stats/ (SVG-Diagramme), profile/, series/, watchlist/
  hooks/                         useWatchlist, useSeries, useFriends, useAlerts, useMusic, useTitleSearch, useUrlView, useImportRunner …
  lib/api/                       einziger Ort für Supabase-Aufrufe (watchlist, tmdb, friends, lists, diary, music, streaming, settings …)
  lib/                           reine Logik mit Tests: watchlistView/Rules, series, tonight, lists, diary, stats, share, spotify (PKCE)
  styles/                        tokens.css, base.css, layout.css (App-Rahmen), components.css, motion.css (Reel)
frontend/public/                 manifest.webmanifest, sw.js (App-Shell), Icons
docs/SETUP.md, docs/DESIGN.md    Einrichtung (nur Browser) · Design-System „Reel“ (vor UI-Arbeit lesen)
```

### Befehle
- Deno-Typcheck: `cd supabase/functions && DENO_CERT=/root/.ccr/ca-bundle.crt DENO_NO_PACKAGE_JSON=1 deno check --no-lock --node-modules-dir=none */index.ts` (Deno-Binary von GitHub-Releases nach `~/bin`)
- Root-Tests: `npm test -- --silent` (PGlite braucht ~1 s pro DB-Test)
- Frontend: `cd frontend && npm run lint && npm test -- --silent && npm run build` (Komponenten-Tests mit `// @vitest-environment jsdom`)
- Neue DB-Funktion testen: Migration schreiben → `tests/*.test.js` mit `asUser()`.

### Datenmodell (aktuell)
Migrationen `supabase/migrations/2026101*.sql` (eine pro Phase). Alle Tabellen: RLS, minimale Spalten-Grants, `on delete cascade`, in `export_my_data()` (v7).
| Tabelle | Inhalt / Regeln |
|---|---|
| `profiles`, `invites` | Profil (E-Mail nur für einen selbst lesbar), Einladungscodes (nur Admins) |
| `watchlist` (+ `watchlist_tombstones`) | Titel, Status, Bewertung, gesehen am, genre_ids, imdb_id, source (manual/imdb/letterboxd/trakt); Löschen hinterlässt Grabstein gegen Re-Import |
| `series_progress`, `watched_episodes` | Serienstand (Server) und abgehakte Folgen |
| `taste_profile`, `user_settings` | Genre-Anpassungen, abgelehnte Vorschläge; Abos, Last.fm-Name, Spoiler, Teilen-Schalter, Mail-Schalter, Kalender-/Abmelde-Token (geheim), digest_sent_at (Server) |
| `feed` | Vorschläge movie/tv/album (Server schreibt, Client reagiert über `feed_feedback`) |
| `availability_alerts` | „Sag mir, wenn es auf meinen Diensten ist“ |
| `music_artists`, `spotify_connections`, `concerts` | Top-Artists, Spotify (Token verschlüsselt, Spalte für Clients gesperrt), Konzerte CH |
| `friendships`, `friend_recommendations` | Freundschaften (Anfragen über RPC), „Schau das!“ |
| `shared_lists`, `list_members`, `list_items`, `list_votes` | Listen/Sammlungen mit Rollen; nur Freunde einladbar; Stimmen über `cast_vote` |
| `movie_nights`, `movie_night_votes` | Terminumfrage pro Liste; Verfügbarkeit über `set_availability` |
| `diary_entries` | Tagebuch (Datum, Ort, mit wem, Notiz, Bewertung, Rewatch; Letterboxd-Import ohne Duplikate) |
| `import_jobs`, `notifications`, `tmdb_cache` | Import-Jobs; Benachrichtigungen (dedupe_key, emailed_at); Server-Cache ohne Client-Zugriff |
| RPCs | `export_my_data`, `delete_my_account`, `series_overview`, `feed_feedback`, `send_friend_request`, `respond_friend_request`, `friends_overview`, `friends_on_title`, `friend_activity`, `recommend_title`, `list_people`, `cast_vote`, `set_availability`, `regenerate_calendar_token`, `check_invite` |

Regel für neue Tabellen: `references auth.users on delete cascade`, RLS an, minimale Spalten-Grants, Tests in `tests/`, in `export_my_data()` aufnehmen.

## Phasen-Checkliste
- [x] Phase 0 – Grundgerüst (Supabase, React-Frontend, minimale Watchlist mit TMDb-Suche, Deploy-Workflow)
- [x] Phase 1 – Benutzer & Login
  - [x] Supabase Auth (E-Mail + Passwort, E-Mail-Bestätigung), Registrierung nur mit Einladungscode; Admin-Freigabe über Dashboard-Einladung; erster Nutzer = Admin
  - [x] Zugriffsschutz: RLS auf allen Tabellen, `user_id` nur aus dem Login (getestet), Edge Function prüft Login
  - [x] Datenmigration entfällt (neues Projekt)
  - [x] Frontend: Login, Registrierung mit Code (Link `?invite=`), Passwort vergessen/zurücksetzen, Profil (Anzeigename, Benutzername, Passwort, Einladungen für Admins)
  - [x] Konto löschen + JSON-Export
  - [x] Tests grün (Root 25, Frontend 5), Build ok
- [x] Phase 2 – Datenmodell
  - [x] Watchlist erweitert (imdb_id, my_rating, rated_at, watched_at, runtime, Trigger), Tombstones
  - [x] series_progress, watched_episodes, taste_profile, user_settings, feed, friendships, shared_lists/list_members/list_items/list_votes, import_jobs, notifications, tmdb_cache
  - [x] RLS + Spalten-Rechte, Export v2, Tests (Root 59 grün)
  - [x] Watchlist-UI: Status und eigene Bewertung 1–10 direkt in der Liste
- [x] Phase 3 – IMDb-Import & -Export
  - [x] Toleranter CSV-Parser (BOM, Quotes, `;`), Erkennung Ratings/Watchlist/Liste, Episoden übersprungen, Duplikate → neueste Bewertung
  - [x] Mapping via TMDb `/find` mit permanentem Cache (negativ 7 Tage), Retry bei 429/5xx
  - [x] Merge: keine Duplikate, Tombstones respektiert, Bewertung nur wenn neuer, bewertet → completed, Watchlist → planned, idempotent
  - [x] Batch-Verarbeitung (Client ruft `continue`, Fortsetzen nach Abbruch), manuelle Zuordnung nicht gefundener Titel
  - [x] Export IMDb-CSV (fehlende IMDb-IDs via `/external_ids` ergänzt) + JSON
  - [x] Tests (Root 84 grün), Deno-Typcheck der Functions ok
- [x] **Phase 3b – Frontend-Logik überarbeitet** (35 Befunde in `docs/reviews/frontend-findings.md`)
  - [x] TanStack Query als Datenschicht (`src/hooks/useWatchlist.js`, Keys mit User-ID, Cache wird beim Abmelden geleert), API-Module `src/lib/api/*`
  - [x] Optimistische Updates pro Zeile (Rollback nur dieser Zeile), nichts blockiert die ganze Seite; Status-Toast mit Rückgängig; Entfernen mit Rückgängig (stellt Bewertung/Daten wieder her)
  - [x] Ein Suchfeld: filtert die eigene Liste sofort + TMDb-Suche mit Debounce, „Merken“/„Schon gesehen“, Status bei vorhandenen Titeln
  - [x] Tabs mit Zählern (Als Nächstes/Gesehen/Pausiert/Alle), Typ-Filter, Sortierung, alles in der URL; schrittweises Rendern (60er-Schritte); Watchlist >1000 Titel (Paging)
  - [x] Import-Runner ausserhalb von React (überlebt Seitenwechsel, Auto-Fortsetzen, Retry nur bei vorübergehenden Fehlern, Chip in der Navigation), „Noch zuzuordnen“ über alle Jobs, „Ignorieren“
  - [x] Router mit Lazy-Loading, Fehlerseite, 404-Seite, Scroll-Wiederherstellung, Seitentitel, Fokus auf h1; Login: Rücksprung inkl. Query, abgelaufene Mail-Links, Bestätigungsmail erneut senden, Passwort festlegen für Dashboard-Einladungen
  - [x] Edge Functions liefern `code` statt Admin-Texte; Export über 1000 Titel, IMDb-ID-Nachschlag parallel; Import: Gesehen-Datum = IMDb-Bewertungsdatum; DB: Bewertung von „Geplant“ → „Gesehen“
  - [x] ESLint (react-hooks), Komponenten-Tests (jsdom + Testing Library), CI prüft Pull Requests (Lint, Tests, Build, Deno-Typcheck) – Root 86, Frontend 33 Tests grün
- [x] **Phase 4 – Details & Trailer** (PR offen)
  - [x] TMDb-Function: Action `details` (ein Aufruf mit `append_to_response`, englische Beschreibung als Fallback), Cache 24 h in `tmdb_cache` (`details:movie:603:de-CH`), Cache-Fehler brechen nichts
  - [x] Detailseite `/title/:mediaType/:tmdbId`: Poster, Backdrop, Beschreibung, Genres, Laufzeit/Staffeln, TMDb-Bewertung, Regie/Drehbuch bzw. Idee, Cast (12), IMDb-Link, Merken/Gesehen bzw. Status + Bewertung
  - [x] Trailer (youtube-nocookie, lädt erst beim Klick), Streaming CH (Im Abo inkl. gratis/Werbung, Leihen, Kaufen, Quelle JustWatch), Ähnliche Titel (TMDb-Empfehlungen, Fallback „similar“, max. 12) mit Markierung „in deiner Liste“
  - [x] Titel in Watchlist und Suche verlinken auf die Detailseite; Tests Root 92, Frontend 38 grün
  - [ ] Soundtrack-Album verlinken, sobald Phase 8 (Musik) steht
- [x] Phase 5 – Serien-Tracking
  - [x] Detailseite Serie: Fortschritt, „Als Nächstes“, Staffeln aufklappbar, Episoden einzeln / „bis hier“ / ganze Staffel; Serie wird automatisch „Am Schauen“ bzw. bei Ende „Gesehen“
  - [x] Binge-Rechner, Spoiler-Schutz (Einstellung im Profil), „Weiterschauen“ auf der Watchlist inkl. vergessene Serien (30 Tage → Pausieren/Abbrechen)
  - [x] Kalender-Seite (30 Tage, Folgen + Filmstarts) + ICS-Abo (Edge Function `calendar`, geheimer Token, neu erzeugbar)
  - [x] Täglicher Check (Edge Function `series-tracker`, GitHub Actions `cron.yml` 05:15 UTC, Secret `CRON_SECRET`) → Benachrichtigungen (dedupliziert) → Glocke + Seite `/notifications`
  - [x] Tests: Root 104, Frontend 44 grün
- [x] Phase 6 – Empfehlungen & „Was schauen wir heute?“
  - [x] `_shared/scoring.ts`: Genre-Gewichte aus Bewertungen (8–10 ↑, 1–4 ↓, gedämpft bei < 3 Titeln) + Anpassungen; Score = Genre × 40 + TMDb-Rating + Aktualität + „Weil du X bewertet hast“ + eigene Abos − Gesehenes/Abgelehntes; Genre-Vielfalt im Top 20
  - [x] Edge Function `discovery-media` (Cron 06:45 + „Neu berechnen“ mit 10-Min.-Sperre), Quellen: upcoming/now_playing CH, on_the_air, discover nach Lieblingsgenres, discover auf eigenen Abos, recommendations der Top-Titel; Genres alter Einträge werden nachgetragen
  - [x] RPC `feed_feedback` (like/dislike/add, Gewichte begrenzt auf [-1, 1], 👎 → abgelehnt)
  - [x] Seite „Für dich“: Vorschläge mit Begründung, 👍/👎/Merken, Filter Typ/Genre/Neuerscheinungen; „Was schauen wir heute?“ (Typ, Stimmung, Dauer, „Nochmal“)
  - [x] Profil: Streaming-Dienste CH (Liste live von TMDb), Genre-Regler Filme/Serien
  - [x] Tests: Root 117, Frontend 46 grün
- [x] Phase 7 – Streaming-Tools
  - [x] Edge Function `availability`: `scan` prüft bis 300 offene Watchlist-Titel (`/watch/providers` CH, Cache 24 h, 8 parallel); `check` (Cron 07:15) meldet Alarme
  - [x] Seite „Streaming“: Abdeckung mit eigenen Abos, „Lohnt sich diesen Monat“, „Kaum genutzt“, beste Zweier-Kombination, Titel pro Dienst
  - [x] Verfügbarkeits-Alarm: Knopf auf der Detailseite, Tabelle `availability_alerts`, Benachrichtigung Typ `available`, Liste auf „Streaming“
  - [x] Filmstarts geplanter Filme im Kalender-Abo (seit Phase 5); ICS-Escape von `;` korrigiert
  - [ ] „Bald weg“ geht nicht: TMDb/JustWatch liefern kein Enddatum (siehe D37)
  - [x] Tests: Root 123, Frontend 50 grün
- [x] Phase 8 – Musik
  - [x] Last.fm-Name im Profil (und auf „Musik“), Spotify optional per PKCE; Refresh-Token AES-GCM-verschlüsselt, für den Client nicht lesbar
  - [x] Edge Function `discovery-music` (Cron 06:45 + „Neu suchen“): Top-Artists (Last.fm 6 Monate, Spotify top/gefolgt) → ähnliche Artists (Last.fm) → Neuerscheinungen der letzten 30 Tage (MusicBrainz, 1 Anfrage/s, Spotify-Alben) → Feed `album` mit Grund, 👍/👎 lernt Tags
  - [x] Konzerte in der Schweiz (Ticketmaster, optional) inkl. Kalender-Abo; Benachrichtigungen für neue Alben der Top-10-Artists und Konzerte
  - [x] Seite „Musik“: Neuerscheinungen, Konzerte, Top-Artists; Soundtrack-Link auf der Detailseite
  - [x] Nachtrag: stats.fm als dritte Quelle (öffentliches Profil, kein Schlüssel): Top-Artists mit Streams + Hör-Summen (Tabelle `music_stats`) auf „Statistik“; fehlende MusicBrainz-IDs via Last.fm `artist.getinfo` (gecacht)
  - [x] Tests: Root 142, Frontend 55 grün
- [x] Phase 9 – Freunde & gemeinsame Listen
  - [x] Freundschaften per Benutzername oder E-Mail (Ablehnung bleibt unsichtbar, Gegenanfrage nimmt an), Seite „Freunde“
  - [x] Geschmacks-Match in % (ab 3 gemeinsamen Bewertungen, nur wenn beide Bewertungen teilen), „Wer hat es gesehen?“ auf der Detailseite
  - [x] „Schau das!“ mit Nachricht → „Von Freunden empfohlen“ (Merken/Ausblenden), Benachrichtigung
  - [x] Gemeinsame Listen: nur Freunde einladen, Rollen (bearbeiten/abstimmen), 👍/👎, Match wenn alle dafür, „Was schauen wir?“ ohne Gegenstimme, Swipe-Modus (Ziehen, ←/→), eigene geplante Titel übernehmen
  - [x] Filmabend-Planer: Terminumfrage (bis 4 Termine), Host/Owner legt fest, Titel aus den Stimmen, ICS-Download, Benachrichtigungen
  - [x] Aktivitäts-Feed (opt-in), Schalter im Profil; Navigation: „Import“ jetzt im Watchlist-Kopf und Profil
  - [x] Strenge Rechte-Tests (`tests/friends.test.js`): Nicht-Freunde sehen nichts, keine E-Mails, nur eigene Stimmen; Tests Root 155, Frontend 66 grün
- [x] Phase 10 – Tagebuch, Sammlungen & Importe
  - [x] Tabelle `diary_entries` (Datum, Ort, mit wem, Notiz, Bewertung, Rewatch), „Gesehen am …“ auf der Detailseite (setzt Filme auf „Gesehen“ mit diesem Datum), Seite „Tagebuch“ mit Monaten und Jahreszahlen
  - [x] Sammlungen = Listen ohne Mitglieder (keine zweite Datenstruktur, siehe D48); Seite heisst „Listen & Sammlungen“
  - [x] Letterboxd-Import (diary/ratings/watched/watchlist.csv; Abgleich per Titel + Jahr über die TMDb-Suche; Tagebuch wird mit übernommen, Re-Import ohne Duplikate)
  - [x] Trakt-Import (ratings/watchlist/watched JSON, direkte TMDb-IDs)
  - [x] Tests: Root 163, Frontend 69 grün
- [x] Phase 11 – Statistik, Jahresrückblick & Herausforderungen
  - [x] Seite „Statistik“ (Jahr wählbar): Titel, Stunden (Filme ohne Laufzeit mit 110 Min. geschätzt), Filme/Serien, Ø-Bewertung, Kino; Titel pro Monat, Genres mit Ø, Bewertungsverteilung, Jahrzehnte, Lieblinge; Musik-Top-Artists
  - [x] Jahresrückblick als Bild (SVG → PNG, Teilen-Dialog auf dem Handy, sonst Download)
  - [x] Herausforderungen: 52 Filme im Jahr, jedes Jahrzehnt seit 1920, TMDb Top 100 (statt IMDb Top 250, siehe D52), 10 Genres, 12 Kinobesuche
  - [x] Eigene kleine SVG-Diagramme statt Chart-Bibliothek (D51); Tests: Root 164, Frontend 75 grün
- [x] Phase 12 – Benachrichtigungen & App
  - [x] PWA: Manifest, Icons (Lesezeichen im Quiet-Ink-Blau), Service Worker (App-Shell offline, Assets cache-first), Shortcuts
  - [x] Share-Target `/share`: IMDb-/TMDb-Links → Detailseite, Letterboxd-Links und Texte („Schau dir „Dark“ auf Netflix an“) → Suche mit „Merken“; neue TMDb-Aktion `find`
  - [x] E-Mails über Brevo (`notify-email`): Sofort-Mails (alle 30 Min., mehrere Neuigkeiten in einer Mail), Wochenrückblick So 18:00 Zürich, Abmeldelink ohne Login (auch One-Click), Sandbox-Schalter, Test-Mail im Profil
  - [ ] Web-Push: bewusst weggelassen (siehe D55)
  - [x] Tests: Root 172, Frontend 77 grün
- [x] Phase 13 – Abschluss: README mit Funktionsübersicht, Mermaid-Architektur und Sicherheitsprinzipien; PROGRESS-Übersicht aktualisiert; alles grün
- [x] Über alle Medien (D61–D67)
  - [x] Score Bridge in beide Richtungen
  - [x] Abendstimmung aus den Scrobbles
  - [x] Abo-Rotation mit Kalender-Erinnerungen
  - [x] Aufhol-Countdown mit sanften Erinnerungen
  - [x] Life Reel im „Rückblick“
  - [x] Konzert-Buddys und gemeinsamer Bildschirm
  - [x] Eine Agenda für Kalender, ICS, Wochen-Mail und „Für dich“
  - [x] Teilen-Schalter im Profil gebündelt
  - [x] Tests: Root 236, Frontend 92 grün

## Offene Befunde (aus den Reviews)
- `docs/reviews/backend-findings-partial.md`: 23 ungeprüfte Befunde (Sicherheit, Datenmodell), u. a. Erst-Admin-Bootstrap absichern, gemeinsamer Titel-Katalog, Bewertungs-Datum beim Import (erledigt).
- Review-Bereiche Edge Functions, CI/Betrieb, Produkt, Doku noch nicht durchgeführt (wegen Nutzungslimit gestoppt).

## Offene Probleme
- Migrationen + Function laufen auf dem echten Supabase-Projekt (Deploy grün). Claude-Umgebung erreicht github.io/supabase.co nicht direkt → App-Verhalten nur über Marios Rückmeldung prüfbar.
- pg_cron rechnet in UTC → Zeiten in Europe/Zurich müssen bei Sommer-/Winterzeit berücksichtigt werden (Lösung in Phase 5: stündlich laufen und in der Funktion auf Zürich-Zeit prüfen).

## Offen für Mario
- [x] Einrichtung laut `docs/SETUP.md` erledigt, erster Deploy grün (12.10.2026), App: https://mariosch08.github.io/Watchlist-App/
- [ ] Vor Freundes-Einladungen: Brevo-SMTP in Supabase eintragen (SETUP §9)
- [ ] Benachrichtigungs-Mails: Supabase-Secrets `BREVO_API_KEY` und `MAIL_FROM` (SETUP §9b), dann Test-Mail im Profil
- [ ] GitHub-Secret `CRON_SECRET` anlegen (SETUP §8b), sonst läuft der tägliche Serien-Check nicht
- [ ] Musik: Supabase-Secret `LASTFM_API_KEY` (SETUP §8c); optional `TICKETMASTER_API_KEY` (Konzerte) und Spotify-App (`SPOTIFY_CLIENT_ID` als Secret + GitHub-Variable)
- Hinweis: Ab jetzt deployt jeder Merge nach `main` automatisch (Tests → Supabase → Pages). Läuft der Supabase-Token ab, Secret `SUPABASE_ACCESS_TOKEN` erneuern.

## Ideen (nicht umgesetzt)
- Suche in Alltagssprache („wie Dune, aber kürzer“) – bräuchte eine kostenpflichtige KI-API.
- Gemeinsam synchron schauen (Watch-Party) – aufwendig, rechtlich heikel.
- Passkeys/MFA über Supabase Auth.
- Web-Push als Alternative zu E-Mail (D55).
- Eigene Domain statt `mariosch08.github.io`.
