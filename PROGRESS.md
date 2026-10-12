# PROGRESS – Media-Watchlist → Entdeckungs-App

> Gedächtnis zwischen Sessions. Neue Session: nur diese Datei + `DECISIONS.md` lesen, dann die nächste offene Phase umsetzen.

## Status
- **Erledigt:** Phase 0–8 (3b Frontend-Logik, 4 Detailseite, 5 Serien, 6 Empfehlungen, 7 Streaming-Tools, 8 Musik), Design „Quiet Ink“, Sicherheits-Fix
- **Aktuelle Phase:** 9 – Freunde & gemeinsame Listen
- **Nächster konkreter Schritt:** Freundschaften (Tabelle `friendships` existiert: Anfrage per Benutzername, annehmen/ablehnen, RPCs) → Seite „Freunde“ → gemeinsame Listen mit Rollen + Abstimmung → Geschmacks-Match, „Schau das!“, „Wer hat es gesehen?“, Filmabend-Planer. Strenge Rechte-Tests (Nicht-Freunde sehen nichts).

## Repo-Überblick
```
package.json, vitest.config.js   Root: Tests für DB (PGlite) + Edge-Function-Logik
tests/supabase-stub.sql          Nachbau auth-Schema/Rollen/Default-Grants von Supabase
tests/db.js                      createDb(), signUp(), asUser(db, userId, sql), asAdmin()
tests/*.test.{js,ts}             auth (Einladungen), isolation (RLS), tmdb
supabase/config.toml             CLI-Config; Functions mit verify_jwt=false (Login-Prüfung im Code)
supabase/migrations/*.sql        Schema, RLS, Trigger, RPCs – nur additive Migrationen!
supabase/functions/_shared/      tmdb.ts (testbare Logik), auth.ts (requireUser), cors.ts
supabase/functions/tmdb/         Edge Function: {action:'search'|'title'|'details'} → TMDb (de-CH), Key = Secret TMDB_API_KEY; details 24 h in tmdb_cache
supabase/functions/series-tracker/ täglich per Cron (x-cron-secret): series_progress aktualisieren, Benachrichtigungen
supabase/functions/discovery-media/ Feed „Für dich“ (Cron + refresh), Logik in _shared/scoring.ts (auch vom Frontend importiert)
supabase/functions/calendar/     ICS-Feed per Token-Link (Folgen + Filmstarts)
.github/workflows/cron.yml       Tägliche Jobs (hält Supabase wach)
supabase/functions/imdb/         Edge Function: start (CSV parsen, Job anlegen) / continue (Batch à 40) / resolve (manuelle Zuordnung) / export (IMDb-CSV)
supabase/functions/_shared/      csv.ts, imdb.ts (Parser, Merge-Regeln, Export), importJob.ts (Batch mit injizierten Deps), admin.ts (Service-Role-Client)
frontend/                        React 18 + Vite 5 + react-router 6 + supabase-js 2.45.4
  src/lib/supabase.js            Client (VITE_SUPABASE_URL/ANON_KEY), appUrl() für Mail-Links (Pages-Basispfad)
  src/lib/errors.js              errorMessage() DE, unwrap()
  src/auth/AuthContext.jsx       useAuth()/useUser(), Recovery-Erkennung
  src/router.jsx                 createBrowserRouter, Lazy-Routen, Guards (src/auth/guards.jsx)
  src/hooks/                     useWatchlist (Query + Mutationen), useTitleSearch, useUrlView, useImportRunner, useDocumentTitle
  src/lib/api/                   watchlist, tmdb, imports, profile, invites, account, auth (einziger Ort für Supabase-Aufrufe)
  src/lib/                       watchlistView (Filter/Sortierung, rein), watchlistRules (Spiegel des DB-Triggers), importRunner, queryClient, errors
  src/pages/                     Login, Register, ForgotPassword, ResetPassword, Profile, Watchlist, ImportExport, TitleDetails, NotFound
  src/components/details/        DetailActions, Trailer, StreamingProviders, CastList, SimilarTitles (Detailseite)
  src/components/                Layout, Form (useSubmit/Messages), TitleRow, WatchlistActions, ImportProgress, NotFoundResolver, Skeleton
  src/lib/                       supabase, errors, labels, watchlist, imdb, download
  src/styles/                    tokens.css, base.css, components.css, motion.css (index.css importiert alles + Fonts)
.github/workflows/deploy.yml     push main / manuell: Tests → supabase db push + functions deploy → GitHub Pages
docs/SETUP.md                    Einrichtung für Mario (nur Browser)
docs/DESIGN.md                   **Design-System „Quiet Ink“ – vor jeder UI-Arbeit lesen** (Tokens, Primitive, Checkliste; Anhang = Umsetzung im Projekt)
```

### Befehle
- Deno-Typcheck: `cd supabase/functions && DENO_CERT=/root/.ccr/ca-bundle.crt DENO_NO_PACKAGE_JSON=1 deno check --no-lock --node-modules-dir=none */index.ts` (Deno-Binary von GitHub-Releases nach `~/bin`)
- Root-Tests: `npm test -- --silent` (PGlite braucht ~1 s pro DB-Test)
- Frontend: `cd frontend && npm run lint && npm test -- --silent && npm run build` (Komponenten-Tests mit `// @vitest-environment jsdom`)
- Neue DB-Funktion testen: Migration schreiben → `tests/*.test.js` mit `asUser()`.

### Datenmodell (aktuell)
Migrationen: `20261012000000_init.sql` (Phase 1), `20261012120000_watchlist_rating.sql`, `20261012130000_data_model.sql` (Phase 2).
| Tabelle | Schlüssel | Inhalt / Regeln |
|---|---|---|
| `profiles` | `id` | email, display_name, username (unique), is_admin (nicht änderbar) |
| `invites` | `code` | nur Admins |
| `watchlist` | (user_id, media_type, tmdb_id) | title, original_title, vote_average, poster_path, release_date, imdb_id, status, source (manual/imdb), my_rating 1–10, rated_at/watched_at (per Trigger), runtime (Min.), added_at, updated_at. Client darf nur status/my_rating/rated_at/watched_at ändern |
| `watchlist_tombstones` | (user_id, media_type, tmdb_id) | entsteht beim Löschen; manuelles Wieder-Hinzufügen hebt auf, Import (`source='imdb'`) nicht |
| `series_progress` | (user_id, tmdb_id) | tmdb_status, Staffeln/Episoden, last/next_episode_to_air (jsonb), next_up_*, last_checked_at |
| `watched_episodes` | (user_id, tmdb_id, season, episode) | season ≥ 1 (Specials ignoriert), FK auf series_progress |
| `taste_profile` | user_id | genre_weights_movie/tv/music (jsonb), favorite_people, favorite_artists, rejected_ids (`movie:603`) |
| `user_settings` | user_id | streaming_providers (TMDb-IDs), lastfm_username, email_digest/instant, share_ratings_with_friends, unsubscribe_token (geheim) |
| `feed` | id, unique(user_id,type,external_id) | type movie/tv/album, source, score, reason, data, status, expires_at. Client: nur lesen/status/löschen; schreiben nur Server |
| `friendships` | (requester, addressee), Paar eindeutig | pending/accepted/declined; nur Empfänger antwortet |
| `shared_lists` / `list_members` / `list_items` / `list_votes` | | Rollen owner/editor/viewer über `list_role(list_id)`; Ersteller wird automatisch owner; Viewer lesen+voten, Editor fügt Titel hinzu, nur Owner verwaltet Mitglieder |
| `import_jobs` | id | kind, file_path, status, total/processed, imported/updated/skipped, not_found (ImportRow[]), items (geparste Zeilen, nach Abschluss geleert). Nur die imdb-Function legt Jobs an |
| `notifications` | id | type, title, body, data, read_at, emailed_at; Client darf nur read_at setzen |
| `tmdb_cache` | cache_key | kind details/mapping, expires_at (null = nie); **kein** Client-Zugriff (nur service role) |
| RPCs | | `check_invite`, `export_my_data` (v2, alle Tabellen), `delete_my_account`, `is_admin`, `list_role`, `purge_expired` (nur Server; Cron in Phase 5/6) |

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
  - [x] Tests: Root 142, Frontend 55 grün
- [ ] Phase 9 – Freunde & gemeinsame Listen
  - Freundschaften, Listen mit Rollen, Abstimmung, „Was schauen wir?“ für die Gruppe, Freunde-Bewertungen (abschaltbar)
  - **Geschmacks-Match** in % zwischen Freunden
  - **„Schau das!“:** Titel mit Nachricht an Freund empfehlen → Bereich „Von Freunden empfohlen“
  - **Wer hat es gesehen?** auf der Detailseite
  - **Filmabend-Planer:** Terminumfrage + Titel-Abstimmung + ICS-Eintrag für alle
  - **Aktivitäts-Feed** (opt-in)
- [ ] Phase 10 – Tagebuch & Sammlungen (neu)
  - **Film-Tagebuch:** wann, wo (Kino/zuhause), mit wem, Notiz, Rewatch-Zähler
  - **Eigene Sammlungen** (z. B. „Weihnachten“, „Mit den Eltern“)
  - **Letterboxd- und Trakt-Import** (CSV, Erweiterung von Phase 3)
- [ ] Phase 11 – Statistiken & Herausforderungen
  - Statistiken, Jahresrückblick (teilbar), Musik-Stats
  - **Herausforderungen:** „52 Filme im Jahr“, IMDb Top 250, Oscar-Gewinner, „jedes Jahrzehnt“
- [ ] Phase 12 – Benachrichtigungen & App
  - E-Mail (Brevo): Wochen-Digest So 18:00, Sofort-Mails, Abmeldelink
  - **PWA:** installierbar, Share-Target („Teilen → Watchlist“ aus IMDb/Netflix-App), Web-Push als Alternative zu E-Mail
- [ ] Phase 13 – Abschluss (README mit Architektur, Setup, alles grün)

## Offene Befunde (aus den Reviews)
- `docs/reviews/backend-findings-partial.md`: 23 ungeprüfte Befunde (Sicherheit, Datenmodell), u. a. Erst-Admin-Bootstrap absichern, gemeinsamer Titel-Katalog, Bewertungs-Datum beim Import (erledigt).
- Review-Bereiche Edge Functions, CI/Betrieb, Produkt, Doku noch nicht durchgeführt (wegen Nutzungslimit gestoppt).

## Offene Probleme
- Migrationen + Function laufen auf dem echten Supabase-Projekt (Deploy grün). Claude-Umgebung erreicht github.io/supabase.co nicht direkt → App-Verhalten nur über Marios Rückmeldung prüfbar.
- pg_cron rechnet in UTC → Zeiten in Europe/Zurich müssen bei Sommer-/Winterzeit berücksichtigt werden (Lösung in Phase 5: stündlich laufen und in der Funktion auf Zürich-Zeit prüfen).

## Offen für Mario
- [x] Einrichtung laut `docs/SETUP.md` erledigt, erster Deploy grün (12.10.2026), App: https://mariosch08.github.io/Watchlist-App/
- [ ] Vor Freundes-Einladungen: Brevo-SMTP in Supabase eintragen (SETUP §9)
- [ ] GitHub-Secret `CRON_SECRET` anlegen (SETUP §8b), sonst läuft der tägliche Serien-Check nicht
- [ ] Musik: Supabase-Secret `LASTFM_API_KEY` (SETUP §8c); optional `TICKETMASTER_API_KEY` (Konzerte) und Spotify-App (`SPOTIFY_CLIENT_ID` als Secret + GitHub-Variable)
- Hinweis: Ab jetzt deployt jeder Merge nach `main` automatisch (Tests → Supabase → Pages). Läuft der Supabase-Token ab, Secret `SUPABASE_ACCESS_TOKEN` erneuern.

## Ideen (nicht umgesetzt)
- Suche in Alltagssprache („wie Dune, aber kürzer“) – bräuchte eine kostenpflichtige KI-API.
- Gemeinsam synchron schauen (Watch-Party) – aufwendig, rechtlich heikel.
- Passkeys/MFA über Supabase Auth.
- Eigene Domain statt `mariosch08.github.io`.
