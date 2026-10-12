# PROGRESS – Media-Watchlist → Entdeckungs-App

> Gedächtnis zwischen Sessions. Neue Session: nur diese Datei + `DECISIONS.md` lesen, dann die nächste offene Phase umsetzen.

## Status
- **Erledigt:** Phase 0, Phase 1 (Benutzer & Login, Supabase), Phase 2 (Datenmodell)
- **Nächste Phase:** Phase 3 – IMDb-Import & -Export
- **Nächster konkreter Schritt:** privaten Storage-Bucket `imports` (Pfad `<user_id>/…`, Policy nur eigener Ordner) per Migration anlegen; CSV-Parser (tolerant, Spalten `Const`, `Your Rating`, `Date Rated`, `Title`, `Title Type`, `Year`) in `supabase/functions/_shared/imdb.ts` mit Tests; Edge Function `import-imdb` (Mapping via `/find/{imdb_id}` + `tmdb_cache`, Merge-Regeln + Tombstones), Export-RPC/Function im IMDb-CSV-Format; Frontend: Upload + Ergebnis + manuelle Zuordnung.

## Repo-Überblick
```
package.json, vitest.config.js   Root: Tests für DB (PGlite) + Edge-Function-Logik
tests/supabase-stub.sql          Nachbau auth-Schema/Rollen/Default-Grants von Supabase
tests/db.js                      createDb(), signUp(), asUser(db, userId, sql), asAdmin()
tests/*.test.{js,ts}             auth (Einladungen), isolation (RLS), tmdb
supabase/config.toml             CLI-Config; Functions mit verify_jwt=false (Login-Prüfung im Code)
supabase/migrations/*.sql        Schema, RLS, Trigger, RPCs – nur additive Migrationen!
supabase/functions/_shared/      tmdb.ts (testbare Logik), auth.ts (requireUser), cors.ts
supabase/functions/tmdb/         Edge Function: {action:'search'|'title'} → TMDb (de-CH), Key = Secret TMDB_API_KEY
frontend/                        React 18 + Vite 5 + react-router 6 + supabase-js 2.45.4
  src/lib/supabase.js            Client (VITE_SUPABASE_URL/ANON_KEY), appUrl() für Mail-Links (Pages-Basispfad)
  src/lib/errors.js              errorMessage() DE, unwrap()
  src/auth/AuthContext.jsx       useAuth()/useUser(), Recovery-Erkennung
  src/pages/                     Login, Register, ForgotPassword, ResetPassword, Profile, Watchlist
  src/components/                Layout, Form (useSubmit/Messages), TitleRow, WatchlistActions
  src/lib/                       supabase, errors, labels, watchlist (Datenzugriff)
  src/styles/                    tokens.css, base.css, components.css, motion.css (index.css importiert alles + Fonts)
.github/workflows/deploy.yml     push main / manuell: Tests → supabase db push + functions deploy → GitHub Pages
docs/SETUP.md                    Einrichtung für Mario (nur Browser)
docs/DESIGN.md                   **Design-Regeln – vor jeder UI-Arbeit lesen** (Tokens, Schriften, Primitive, Motion)
```

### Befehle
- Root-Tests: `npm test -- --silent` (PGlite braucht ~1 s pro DB-Test)
- Frontend: `cd frontend && npm test -- --silent && npm run build`
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
| `import_jobs` | id | kind, file_path, status, Zähler, not_found |
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
- [ ] Phase 3 – IMDb-Import & -Export (Upload in Supabase Storage, privater Bucket pro Nutzer)
- [ ] Phase 4 – Details & Trailer
- [ ] Phase 5 – Serien-Tracking (pg_cron 07:15 Europe/Zurich → Edge Function)
- [ ] Phase 6 – Empfehlungen Filme/Serien (pg_cron 06:45)
- [ ] Phase 7 – Musik
- [ ] Phase 8 – Freunde & gemeinsame Listen
- [ ] Phase 9 – Statistiken
- [ ] Phase 10 – E-Mail-Benachrichtigungen (Brevo)
- [ ] Phase 11 – Abschluss

## Offene Probleme
- Migrationen + Function laufen auf dem echten Supabase-Projekt (Deploy grün). Claude-Umgebung erreicht github.io/supabase.co nicht direkt → App-Verhalten nur über Marios Rückmeldung prüfbar.
- pg_cron rechnet in UTC → Zeiten in Europe/Zurich müssen bei Sommer-/Winterzeit berücksichtigt werden (Lösung in Phase 5: stündlich laufen und in der Funktion auf Zürich-Zeit prüfen).

## Offen für Mario
- [x] Einrichtung laut `docs/SETUP.md` erledigt, erster Deploy grün (12.10.2026), App: https://mariosch08.github.io/Watchlist-App/
- [ ] Vor Freundes-Einladungen: Brevo-SMTP in Supabase eintragen (SETUP §9)
- Hinweis: Ab jetzt deployt jeder Merge nach `main` automatisch (Tests → Supabase → Pages). Läuft der Supabase-Token ab, Secret `SUPABASE_ACCESS_TOKEN` erneuern.

## Ideen (nicht umgesetzt)
- Passkeys/MFA über Supabase Auth.
- Eigene Domain statt `mariosch08.github.io`.
