# Einrichtung – ohne AWS, alles im Browser

Du brauchst nur **Supabase** (Datenbank + Login + Server-Funktionen, gratis) und **GitHub** (das du schon hast). Kein Terminal nötig. Dauer ca. 20 Minuten.

## 1. Supabase-Projekt erstellen
1. Auf <https://supabase.com> mit deinem GitHub-Konto anmelden („Continue with GitHub“).
2. **New project**: Name `watchlist`, Region **Central EU (Frankfurt)**, Plan **Free**.
3. **Datenbank-Passwort** erzeugen lassen und **notieren** (brauchst du in Schritt 3).
4. Warten, bis das Projekt bereit ist (~2 Minuten).

## 2. Drei Werte aus Supabase kopieren
| Was | Wo in Supabase |
|---|---|
| **Project ref** (z. B. `abcdefghijklmnopqrst`) | *Project Settings → General → Project ID* |
| **Anon/Publishable key** (öffentlich, darf ins Frontend) | *Project Settings → API Keys* (`anon` bzw. `publishable`) |
| **Access token** (geheim) | Profilbild oben rechts → *Account preferences → Access Tokens → Generate new token*, Name `github-deploy` |

**Access token – einfachster Weg:** Im Dialog „Generate new token“ auf den Link **„Create legacy token“** klicken → Name `github-deploy`, Ablauf möglichst lang (z. B. 1 Jahr) → erstellen und sofort kopieren (wird nur einmal angezeigt).
Die neuen fein einstellbaren Tokens haben dutzende Einzelrechte; welche die Supabase CLI genau braucht, ist nicht dokumentiert – der Legacy-Token funktioniert sicher. Er liegt nur als verschlüsseltes GitHub-Secret und kann jederzeit unter *Access Tokens* widerrufen werden. Läuft er ab, schlägt der Deploy fehl → neuen Token erstellen und das GitHub-Secret ersetzen.

## 3. Werte in GitHub eintragen
GitHub → Repo **Watchlist-App** → *Settings* → *Secrets and variables* → *Actions*:

- Tab **Secrets** → *New repository secret*:
  - `SUPABASE_ACCESS_TOKEN` = Access token
  - `SUPABASE_DB_PASSWORD` = Datenbank-Passwort aus Schritt 1
- Tab **Variables** → *New repository variable*:
  - `SUPABASE_PROJECT_REF` = Project ref
  - `SUPABASE_ANON_KEY` = Anon/Publishable key

## 4. TMDb-Key in Supabase hinterlegen
1. Konto auf <https://www.themoviedb.org/signup> erstellen → *Einstellungen → API* → Developer-Key beantragen (persönliches, nicht-kommerzielles Projekt).
2. Den **API Read Access Token** kopieren (beginnt mit `eyJ`).
3. Supabase → *Edge Functions* → *Secrets* (bzw. *Project Settings → Edge Functions*) → **Add new secret**: Name `TMDB_API_KEY`, Wert = Token.

## 5. GitHub Pages einschalten
GitHub → Repo → *Settings* → *Pages* → *Build and deployment* → Source: **GitHub Actions**.

## 6. Deployen
1. Den Branch `claude/media-watchlist-discovery-app-00efb2` per Pull Request in `main` mergen (GitHub → *Pull requests* → *New pull request*; oder Claude bitten, ihn zu erstellen). Danach startet der Deploy automatisch.
2. Unter *Actions* zuschauen, bis alle drei Schritte grün sind (Tests → Supabase → Pages).
3. Deine App läuft dann unter **https://mariosch08.github.io/Watchlist-App/**

## 7. Login-Links einstellen
Supabase → *Authentication* → *URL Configuration*:
- **Site URL**: `https://mariosch08.github.io/Watchlist-App/`
- **Redirect URLs** → *Add URL*: `https://mariosch08.github.io/Watchlist-App/**` und `http://localhost:5173/**`

Optional unter *Authentication → Sign In / Providers → Email*: „Minimum password length“ auf **10** setzen.

## 8. Dein Konto (erster Admin)
Supabase → *Authentication* → *Users* → **Invite user** → deine E-Mail-Adresse. Den Link in der Mail öffnen, Passwort festlegen – fertig. **Nur ein über das Dashboard eingeladener Nutzer kann erster Admin werden**; über die öffentliche Registrierung geht das nicht (Schutz vor Fremden). Danach erstellst du auf der Profil-Seite Einladungscodes für Freunde.

## 8b. Tägliche Jobs aktivieren (Serien-Check)
Jeden Morgen prüft GitHub Actions deine Serien auf neue Staffeln und Folgen (und hält Supabase wach, damit das Gratis-Projekt nicht pausiert).
1. Ein zufälliges Passwort erzeugen (mind. 16 Zeichen, z. B. mit einem Passwort-Manager).
2. GitHub → *Settings → Secrets and variables → Actions → Secrets* → **New repository secret**: Name `CRON_SECRET`, Wert = dieses Passwort.
3. Beim nächsten Deploy wird es automatisch auch in Supabase hinterlegt. Testen: *Actions → Daily jobs → Run workflow*.

## 8c. Musik (Last.fm, optional Spotify und Konzerte)
Alle Schlüssel kommen in Supabase → *Edge Functions → Secrets* (nie in den Code oder Chat).
1. **Last.fm (nötig für „Musik“):** <https://www.last.fm/api/account/create> → Name „Watchlist“, Rest leer lassen → den **API key** als Secret `LASTFM_API_KEY` speichern. Danach in der App unter *Profil → Musik verbinden* deinen Last.fm-Namen eintragen.
2. **Konzerte in der Schweiz (optional):** <https://developer-acct.ticketmaster.com/user/register> → *My Apps* → **Consumer Key** als Secret `TICKETMASTER_API_KEY`.
3. **Spotify (optional, Last.fm reicht):** <https://developer.spotify.com/dashboard> → *Create app* → Redirect URI `https://mariosch08.github.io/Watchlist-App/music/callback`, API „Web API“ → die **Client ID** zweimal eintragen: als Supabase-Secret `SPOTIFY_CLIENT_ID` und in GitHub unter *Settings → Secrets and variables → Actions → Variables* als `SPOTIFY_CLIENT_ID` (keine Geheimzahl, nur eine Kennung). Spotify erlaubt im Entwicklungsmodus nur Konten, die du im Dashboard unter *User Management* einträgst – Freunde dort hinzufügen.
4. Optional `TOKEN_ENCRYPTION_KEY` (zufällig, mind. 32 Zeichen) – sonst wird der Schlüssel für die Spotify-Tokens aus dem Service-Role-Key abgeleitet.

## 9. Bevor sich Freunde registrieren: E-Mail-Versand
Der eingebaute Supabase-Mailversand schickt nur an Mitglieder deines Supabase-Teams (also nur an dich) und nur wenige Mails pro Stunde. Für Freunde einen kostenlosen Mail-Dienst anschliessen:
1. Konto bei <https://www.brevo.com> (Free: 300 Mails/Tag) → *Senders* → deine E-Mail-Adresse als Absender bestätigen.
2. Brevo → *SMTP & API* → *SMTP* → **SMTP-Key erzeugen**.
3. Supabase → *Authentication* → *Emails* → *SMTP Settings* → **Enable custom SMTP**:
   Host `smtp-relay.brevo.com`, Port `587`, Benutzer = Brevo-Login (steht auf der SMTP-Seite), Passwort = SMTP-Key, Absender = deine bestätigte Adresse, Name `Watchlist`.

Alternative ohne Mail-Setup: Freunde in Supabase unter *Authentication → Users → Invite user* einladen (das ist die „Admin-Freigabe“, braucht keinen Code).

## Lokal entwickeln (optional, z. B. im Codespace)
```bash
npm install && npm test                    # Datenbank- und Funktions-Tests
cd frontend && npm install
cp ../.env.example .env.local              # VITE_SUPABASE_URL = https://<project-ref>.supabase.co, Key eintragen
npm run dev
```

## Häufige Probleme
- **Action „supabase“ rot**: Secret/Variable falsch geschrieben oder DB-Passwort falsch (Schritt 3).
- **Suche zeigt Fehler**: `TMDB_API_KEY` fehlt in Supabase (Schritt 4).
- **Link in Bestätigungsmail führt auf localhost**: Site URL setzen (Schritt 7).
- **Projekt pausiert**: Gratis-Projekte pausieren nach 7 Tagen ohne Nutzung; im Supabase-Dashboard auf *Restore* klicken.
