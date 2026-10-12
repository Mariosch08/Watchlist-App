# PROGRESS – Media-Watchlist → Entdeckungs-App

> Gedächtnis zwischen Sessions. Neue Session: nur diese Datei + `DECISIONS.md` lesen, dann die nächste offene Phase umsetzen.

## Status
- **Erledigt:** Phase 0 (Grundgerüst, da Repo leer war), Phase 1 (Benutzer & Login)
- **Nächste Phase:** Phase 2 – Datenmodell
- **Nächster konkreter Schritt:** `backend/src/lib/keys.js` um SK-Präfixe für alle Phase-2-Entitäten erweitern (siehe Abschnitt „Datenmodell-Plan“), Watchlist-Item um Felder `imdb_id`, `my_rating`, `rated_at`, `status`, `watched_at`, `runtime` erweitern (+ Validierung, `PATCH /watchlist/{media_type}/{tmdb_id}`), Tests.

## Repo-Überblick (Stand nach Session 1)
Das Repo enthielt beim Start **nur eine leere `README.md`** – kein bestehender Code, kein Terraform. Alles wurde neu aufgebaut (siehe DECISIONS.md D1).

```
backend/                  Node.js 22 (ESM, plain JS), Tests: vitest + aws-sdk-client-mock
  src/package.json        {"type":"module"} – src/ wird 1:1 als Lambda-Zip deployed (AWS SDK v3 kommt aus der Runtime)
  src/handlers/api.js     EINE API-Lambda mit Router (ROUTES-Tabelle) → neue Endpunkte dort registrieren
  src/handlers/preSignUp.js  Cognito-Trigger: Registrierung nur mit Einladungscode
  src/routes/{me,watchlist,admin}.js   Endpunkt-Logik, bekommt ctx {event, auth, params, query}
  src/lib/auth.js         getAuth(event) → userId NUR aus JWT-Claims; requireAdmin()
  src/lib/db.js           DocumentClient, queryAll, batchDelete; TABLE_NAME env
  src/lib/keys.js         Schlüssel-Schema (Single-Table)
  src/lib/http.js|validate.js  HttpError, json(), parseBody(), Validatoren
  src/lib/tmdb.js         tmdbGet() (Key aus SSM, v3-Key oder v4-Token), de-CH, CH
  src/lib/ssm.js          getSecret() mit Cache
  src/lib/invites.js      Code-Generierung/Normalisierung
  src/lib/legacy.js       Mapping alter Watchlist-Einträge (Migration)
  scripts/create-invite.mjs   ersten Einladungscode per CLI erzeugen
  scripts/migrate-legacy.mjs  Altdaten aus anderer DynamoDB-Tabelle Mario zuordnen (Dry-Run default)
  test/                   helpers.js (apiEvent), *.test.js
frontend/                 React 18 + Vite 5 + react-router 6, Tests: vitest
  src/auth/cognito.js     schlanker Cognito-Client (fetch, kein SDK), Fehlermeldungen DE
  src/auth/session.js     Tokens in localStorage, Auto-Refresh
  src/api.js              api(path,{method,body}) mit ID-Token
  src/pages/              Login, Register, Confirm, ForgotPassword, Profile, Watchlist
infra/
  envs/dev/               Root-Modul (lokaler State), outputs → frontend/.env.local
  modules/data            DynamoDB-Tabelle (PK/SK, GSI1, TTL `ttl`, prevent_destroy)
  modules/auth            Cognito User Pool + Client + Gruppe `admins` (prevent_destroy)
  modules/api             HTTP API, JWT-Authorizer auf $default-Route
  modules/lambda_function wiederverwendbar (Role, Log-Group 14d, nodejs22.x arm64)
```

### Befehle
- Backend-Tests: `cd backend && npm test -- --silent`
- Frontend: `cd frontend && npm test -- --silent && npm run build`
- Terraform: `cd infra/envs/dev && terraform fmt -recursive ../.. && terraform init -backend=false && terraform validate`
- In der Claude-Cloud-Umgebung ist registry.terraform.io gesperrt → Provider-Mirror unter `/root/tfmirror` + `~/.terraformrc` (siehe DECISIONS D9). Terraform-Binary: `~/bin/terraform` (pro Session neu herunterladen von releases.hashicorp.com).

### Datenmodell (Single-Table `watchlist-<env>`)
| PK | SK | Inhalt |
|---|---|---|
| `USER#<sub>` | `PROFILE` | email, display_name, username, created_at |
| `USER#<sub>` | `WL#<movie\|tv>#<tmdb_id>` | Watchlist-Eintrag (tmdb_id, media_type, title, poster_path, release_date, status, source, added_at) |
| `INVITE#<code>` | `INVITE` | Einladung (uses, max_uses, expires_at, ttl), GSI1PK=`INVITES` |
| `USERNAME#<name>` | `USERNAME` | Eindeutigkeits-Lock (owner) |

### Datenmodell-Plan für Phase 2 (Vorschlag)
- `USER#<sub>` / `SP#<tmdb_id>` series_progress · `TASTE#movie|tv|music` taste_profile · `FEED#<type>#<id>` feed (mit `ttl`) · `IMPORT#<job_id>` import_jobs · `NOTIF#<ts>` notifications · `TOMB#<media>#<id>` Tombstones · `FRIEND#<sub>` friendships (beidseitig) · `LISTREF#<list_id>` Mitgliedschaft
- `LIST#<id>` / `META`, `MEMBER#<sub>`, `ITEM#<media>#<id>`, `VOTE#<item>#<sub>` gemeinsame Listen
- `TMDB#<media>#<id>` / `DETAILS#<lang>` + `IMDB#<tt>` / `MAP` tmdb_cache (mit `ttl`)
- Achtung: Konto löschen (`deleteMe`) muss dann auch Listen-Mitgliedschaften/Freundschaften auf fremden PKs bereinigen.

## Phasen-Checkliste
- [x] Phase 0 – Grundgerüst (Terraform-Module, API-Lambda, React-Frontend, minimale Watchlist mit TMDb-Suche)
- [x] Phase 1 – Benutzer & Login
  - [x] Cognito User Pool (E-Mail+Passwort, E-Mail-Verifizierung), Registrierung nur mit Einladungscode (PreSignUp) oder Admin-Anlage per CLI
  - [x] JWT-Authorizer (Cognito) am HTTP API, `user_id` nur aus Token
  - [x] Migrationsskript für Altdaten → Mario (`backend/scripts/migrate-legacy.mjs`)
  - [x] Frontend: Login, Registrierung mit Code, Bestätigung, Passwort vergessen, Profil (Anzeigename, Benutzername, Passwort ändern, Admin-Einladungen)
  - [x] Konto löschen + JSON-Export
  - [x] Tests (Backend 37, Frontend 4) grün, `terraform validate` ok, Build ok
- [ ] Phase 2 – Datenmodell
- [ ] Phase 3 – IMDb-Import & -Export
- [ ] Phase 4 – Details & Trailer
- [ ] Phase 5 – Serien-Tracking
- [ ] Phase 6 – Empfehlungen Filme/Serien
- [ ] Phase 7 – Musik
- [ ] Phase 8 – Freunde & gemeinsame Listen
- [ ] Phase 9 – Statistiken
- [ ] Phase 10 – E-Mail-Benachrichtigungen
- [ ] Phase 11 – Abschluss
- [ ] (offen, ausserhalb der Phasen) Frontend-Hosting (S3 privat + CloudFront OAC) – spätestens in Phase 11

## Offene Probleme
- Kein `terraform plan/apply` möglich in der Claude-Umgebung (keine AWS-Credentials) → nur `validate`. Plan/Apply macht Mario im Codespace.
- `.terraform.lock.hcl` ist absichtlich in `.gitignore` (in der Cloud-Umgebung nur Mirror-Hashes für linux_amd64). Mario kann ihn nach `terraform init` im Codespace committen und aus `.gitignore` entfernen.

## Offen für Mario
1. **Bestehendes Projekt?** Das Repo war leer. Falls es den alten Code (Codespace) noch gibt: pushen und mir sagen – sonst gilt der Neuaufbau. Altdaten-Migration: `TABLE_NAME=watchlist-dev node backend/scripts/migrate-legacy.mjs <alte-tabelle> <deine-cognito-sub>` (erst ohne, dann mit `--apply`).
2. **TMDb-Key in SSM ablegen:** `aws ssm put-parameter --name /watchlist/dev/tmdb_api_key --type SecureString --value '<v3-key oder v4-token>'`
3. **Deploy:** `cd infra/envs/dev && terraform init && terraform plan && terraform apply` (eu-central-1). Danach Outputs in `frontend/.env.local` eintragen (Vorlage `.env.example`).
4. **Ersten Account anlegen:** `cd backend && AWS_REGION=eu-central-1 TABLE_NAME=watchlist-dev node scripts/create-invite.mjs` → Code im Frontend unter „Registrieren“ verwenden. Danach dich zum Admin machen: `aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <deine-email> --group-name admins` und neu anmelden.
   Alternative (Admin-Freigabe ohne Code): `aws cognito-idp admin-create-user --user-pool-id <id> --username <email> --user-attributes Name=email,Value=<email> Name=email_verified,Value=true --message-action SUPPRESS` + `aws cognito-idp admin-set-user-password --user-pool-id <id> --username <email> --password '<pw>' --permanent`.
5. Cognito verschickt Mails mit `COGNITO_DEFAULT` (max. 50/Tag) – reicht für Freunde; Umstellung auf SES in Phase 10.
6. Optional: Terraform-State in S3-Backend verschieben.

## Ideen (nicht umgesetzt)
- SRP-Login statt USER_PASSWORD_AUTH; Passkeys/MFA.
- Mehrere API-Lambdas statt einer, falls Kaltstarts stören.
