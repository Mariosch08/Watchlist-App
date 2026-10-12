# PROGRESS – Media-Watchlist → Entdeckungs-App

> Gedächtnis zwischen Sessions. Neue Session: nur diese Datei + `DECISIONS.md` lesen, dann die nächste offene Phase umsetzen.

## Status
- **Erledigt:** Phase 0 (Grundgerüst) und Phase 1 (Benutzer & Login) – **auf Supabase umgebaut** (AWS verworfen, siehe DECISIONS D3)
- **Nächste Phase:** Phase 2 – Datenmodell
- **Nächster konkreter Schritt:** neue Migration `supabase/migrations/<datum>_data_model.sql`: `watchlist` erweitern (`imdb_id`, `my_rating` 1–10, `rated_at`, `watched_at`, `runtime`), neue Tabellen laut „Datenmodell-Plan“ mit RLS + `on delete cascade`, `export_my_data()` ergänzen; Tests in `tests/` (Isolation pro Tabelle).

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
.github/workflows/deploy.yml     push main / manuell: Tests → supabase db push + functions deploy → GitHub Pages
docs/SETUP.md                    Einrichtung für Mario (nur Browser)
```

### Befehle
- Root-Tests: `npm test -- --silent` (PGlite braucht ~1 s pro DB-Test)
- Frontend: `cd frontend && npm test -- --silent && npm run build`
- Neue DB-Funktion testen: Migration schreiben → `tests/*.test.js` mit `asUser()`.

### Datenmodell (aktuell)
| Tabelle | Schlüssel | Inhalt / Regeln |
|---|---|---|
| `profiles` | `id` → auth.users | email, display_name, username (unique), is_admin (nicht änderbar durch Nutzer). Wird per Trigger beim Sign-up angelegt |
| `invites` | `code` | max_uses, uses, used_by, expires_at; nur Admins lesen/erstellen/löschen |
| `watchlist` | (`user_id`, `media_type`, `tmdb_id`) | title, poster_path, release_date, status, source, added_at |
| RPCs | | `check_invite(code)` (anon), `export_my_data()`, `delete_my_account()`, `is_admin()` |

### Datenmodell-Plan für Phase 2
Tabellen (alle mit `user_id uuid default auth.uid() references auth.users on delete cascade`, RLS):
`series_progress` (pro Serie + gesehene Episoden als Tabelle `watched_episodes`), `taste_profile` (Genre-Gewichte movie/tv/music getrennt als jsonb, Lieblings-Personen/-Artists, abgelehnte IDs), `feed` (type movie/tv/album, source, score, reason, status new/liked/disliked/added, `expires_at`), `streaming_services` (Abos des Nutzers), `import_jobs`, `notifications`, `tombstones` (gelöschte Titel für Import), `friendships` (requester, addressee, status), `shared_lists` / `list_members` (Rolle owner/editor/viewer) / `list_items` / `list_votes` (RLS über Mitgliedschaft), `tmdb_cache` (ohne user_id, nur via Edge Functions/service role, `expires_at`; IMDb↔TMDb-Mapping).

## Phasen-Checkliste
- [x] Phase 0 – Grundgerüst (Supabase, React-Frontend, minimale Watchlist mit TMDb-Suche, Deploy-Workflow)
- [x] Phase 1 – Benutzer & Login
  - [x] Supabase Auth (E-Mail + Passwort, E-Mail-Bestätigung), Registrierung nur mit Einladungscode; Admin-Freigabe über Dashboard-Einladung; erster Nutzer = Admin
  - [x] Zugriffsschutz: RLS auf allen Tabellen, `user_id` nur aus dem Login (getestet), Edge Function prüft Login
  - [x] Datenmigration entfällt (neues Projekt)
  - [x] Frontend: Login, Registrierung mit Code (Link `?invite=`), Passwort vergessen/zurücksetzen, Profil (Anzeigename, Benutzername, Passwort, Einladungen für Admins)
  - [x] Konto löschen + JSON-Export
  - [x] Tests grün (Root 25, Frontend 5), Build ok
- [ ] Phase 2 – Datenmodell
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
