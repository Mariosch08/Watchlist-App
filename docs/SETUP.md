# Einrichtung: AWS, TMDb und erster Deploy (Codespaces)

Einmalig, ca. 30–45 Minuten. Reihenfolge einhalten.

## 1. AWS-Konto absichern (falls neu)
1. Konto auf <https://aws.amazon.com> erstellen (Kreditkarte nötig, Free Tier reicht).
2. Als Root-Nutzer **MFA aktivieren**: oben rechts Kontoname → *Security credentials* → *Assign MFA device*.
3. **Kostenalarm**: Konsole → *Billing and Cost Management* → *Budgets* → *Create budget* → Vorlage *Monthly cost budget*, z. B. 5 USD, deine E-Mail. (Die ersten zwei Budgets sind kostenlos.)
4. Oben rechts die Region **Europe (Frankfurt) eu-central-1** wählen.

## 2. Zugangsschlüssel für den Codespace
1. Konsole → **IAM** → *Users* → *Create user* → Name `watchlist-codespaces` (kein Konsolenzugang nötig).
2. *Attach policies directly* → **AdministratorAccess** (Terraform muss Rollen, Lambdas, Cognito usw. anlegen).
3. Nutzer öffnen → *Security credentials* → *Create access key* → *Command Line Interface (CLI)* → beide Werte kopieren. **Den Secret Key siehst du nur einmal.**
4. GitHub → dein Profilbild → *Settings* → *Codespaces* → *Secrets* → *New secret*. Lege diese drei an und wähle jeweils bei *Repository access* `Watchlist-App` aus:

   | Name | Wert |
   |---|---|
   | `AWS_ACCESS_KEY_ID` | Access key aus Schritt 3 |
   | `AWS_SECRET_ACCESS_KEY` | Secret access key aus Schritt 3 |
   | `AWS_DEFAULT_REGION` | `eu-central-1` |

5. Codespace neu erstellen bzw. neu bauen: Befehlspalette (`F1`) → **Codespaces: Rebuild Container**. Dabei werden auch AWS CLI, Terraform und Node installiert (`.devcontainer/devcontainer.json`).
6. Testen im Terminal:
   ```bash
   aws sts get-caller-identity     # zeigt deine Account-ID → Zugang funktioniert
   terraform version               # >= 1.10
   ```

> Die Schlüssel landen nie im Repo – Codespaces gibt sie nur als Umgebungsvariablen in deinen Codespace. Falls ein Schlüssel einmal öffentlich wird: in IAM sofort deaktivieren und neu erstellen.

## 3. TMDb-Zugang
1. Konto auf <https://www.themoviedb.org/signup> erstellen und E-Mail bestätigen.
2. Profilbild → *Einstellungen* → **API** → *Create* / *Request an API key* → Typ **Developer**, Nutzung „persönliches, nicht-kommerzielles Projekt“. Formular ausfüllen (App-URL darf z. B. dein GitHub-Repo sein).
3. Auf derselben Seite den **API Read Access Token** kopieren (langer Text, beginnt mit `eyJ`). Der kürzere *API Key* funktioniert auch – der Code erkennt beides.
4. Im Codespace-Terminal sicher in AWS ablegen (der Token erscheint dabei nicht im Terminal-Verlauf):
   ```bash
   read -rsp "TMDb Token: " TMDB_TOKEN && echo
   aws ssm put-parameter --name /watchlist/dev/tmdb_api_key --type SecureString --value "$TMDB_TOKEN" --overwrite
   unset TMDB_TOKEN
   aws ssm get-parameter --name /watchlist/dev/tmdb_api_key --query Parameter.Name   # Kontrolle
   ```

## 4. Terraform-State in S3 (einmalig)
Ein Codespace wird nach 30 Tagen Inaktivität gelöscht – der Terraform-State darf deshalb nicht nur dort liegen.
```bash
./infra/scripts/bootstrap-state.sh
```
Legt den Bucket `watchlist-tfstate-<account-id>` an (verschlüsselt, versioniert, privat) und schreibt `infra/envs/dev/backend.hcl`.

## 5. Deploy
```bash
cd infra/envs/dev
# Erlaubte Frontend-Adressen: lokal + die weitergeleitete Codespace-Adresse
cat > terraform.tfvars <<EOT
cors_origins = ["http://localhost:5173", "https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"]
EOT
terraform init -backend-config=backend.hcl
terraform plan          # anschauen: es sollte nur "create" vorkommen
terraform apply         # mit "yes" bestätigen
```

## 6. Frontend verbinden und starten
```bash
cd infra/envs/dev
cat > ../../../frontend/.env.local <<EOT
VITE_AWS_REGION=$(terraform output -raw region)
VITE_USER_POOL_ID=$(terraform output -raw user_pool_id)
VITE_USER_POOL_CLIENT_ID=$(terraform output -raw user_pool_client_id)
VITE_API_URL=$(terraform output -raw api_url)
EOT
cd ../../../frontend && npm run dev
```
Codespaces zeigt unten rechts „Open in Browser“ für Port 5173.

## 7. Erster Account (du) und Admin-Rechte
```bash
cd backend
AWS_REGION=eu-central-1 TABLE_NAME=watchlist-dev node scripts/create-invite.mjs     # gibt einen Einladungscode aus
```
Im Browser: *Registrieren* → Code, E-Mail, Passwort → Bestätigungscode aus der Mail eingeben → anmelden.
Dann dich zum Admin machen (danach ab- und wieder anmelden):
```bash
POOL=$(cd ../infra/envs/dev && terraform output -raw user_pool_id)
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" --username "deine@email.ch" --group-name admins
```
Ab jetzt erstellst du Einladungen für Freunde direkt auf der Profil-Seite.

## Häufige Probleme
- **`Unable to locate credentials`**: Secrets fehlen oder Codespace wurde nach dem Anlegen nicht neu gebaut (Schritt 2.5).
- **CORS-Fehler im Browser**: Neuer Codespace = neue Adresse → Schritt 5 (`terraform.tfvars` + `apply`) wiederholen.
- **Suche liefert Fehler 502**: TMDb-Token fehlt oder ist falsch (Schritt 3).
