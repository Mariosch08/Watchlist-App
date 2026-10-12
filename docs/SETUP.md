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

**Einstellungen für den Access token:**
- *Expires in*: möglichst lang (z. B. 90 Tage oder 1 Jahr). Läuft er ab, schlägt der Deploy fehl → neuen Token erstellen und das GitHub-Secret ersetzen.
- *Resource access*: **Project** → deine Organisation → Projekt `watchlist`.
- *Permissions*: **Project** = Read · **Database** = Read & Write · **Application services** = Read & Write · Rest = No access.
- Falls die GitHub Action später mit „unauthorized“/„403“ scheitert: stattdessen *Create legacy token* verwenden (voller Zugriff, funktioniert sicher mit der Supabase CLI).

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

## 8. Dein Konto
Öffne die App → *Registrieren*. **Der allererste Nutzer braucht keinen Code und wird automatisch Admin** – also gleich nach dem Deploy selbst registrieren. Bestätigungslink in der Mail anklicken, anmelden. Auf der Profil-Seite erstellst du dann Einladungscodes für Freunde („Link kopieren“ und verschicken).

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
