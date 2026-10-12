# Entscheidungen

**D1 – Leeres Repo → Neuaufbau.** Das Repo enthielt nur eine leere README; der beschriebene Bestand (Terraform, TMDb, React) war nicht vorhanden. Statt zu warten habe ich ein schlankes Grundgerüst gebaut, das den beschriebenen Stack nachbildet (Terraform, Lambda, React+Vite, TMDb), plus ein tolerantes Migrationsskript für Altdaten aus einer beliebigen DynamoDB-Tabelle.

**D2 – Branch.** Die Session-Umgebung schreibt den Branch `claude/media-watchlist-discovery-app-00efb2` vor (Push nur dorthin erlaubt). Er übernimmt die Rolle von `feature/discovery-app`; `main` wird nicht angefasst.

**D3 – Sprache Backend: Node.js 22 (ESM, plain JavaScript).** Eine Sprache für Frontend und Backend; AWS SDK v3 ist in der Lambda-Runtime enthalten → Zip = nur `backend/src`, keine Build-Pipeline. Tests mit vitest.

**D4 – Single-Table-DynamoDB** (`PK`/`SK`, `GSI1`, TTL-Attribut `ttl`), On-Demand. Alle Nutzerdaten unter `PK=USER#<sub>` → Export und Löschen pro Nutzer sind eine Query. `deletion_protection` + `prevent_destroy`. Kein PITR (kostet).

**D5 – Eine API-Lambda mit Router** hinter HTTP API (v2, günstiger als REST API). Der „Cognito-Authorizer“ ist beim HTTP API ein JWT-Authorizer mit Cognito als Issuer; er schützt die `$default`-Route, also jeden Endpunkt. CORS-Preflight beantwortet API Gateway selbst.

**D6 – ID-Token als Bearer.** Enthält `email` und `cognito:groups`; Audience = Client-ID. `user_id` = `sub` aus dem Token, Request-Body/Query werden dafür nie gelesen (getestet).

**D7 – Einladungen.** Registrierung nur mit Code (Cognito PreSignUp-Trigger prüft und verbraucht ihn atomar: existiert, `uses < max_uses`, nicht abgelaufen). Codes erstellen Admins (Cognito-Gruppe `admins`) im Profil; der erste Code per CLI-Skript. „Admin-Freigabe“ = Admin legt Nutzer per `admin-create-user` an (Trigger lässt das zu). Nebenwirkung: Bricht jemand nach dem SignUp ab, ist der Code verbraucht → Admin erstellt neuen.

**D8 – Frontend-Auth ohne Amplify.** Schlanker Client gegen die öffentliche Cognito-JSON-API (`USER_PASSWORD_AUTH` über TLS). Tokens in `localStorage` (Refresh-Token 30 Tage, widerrufen beim Abmelden). Spart ~200 kB Bundle. SRP wäre sicherer gegen Passwort-Logging im Client, ist als Idee notiert.

**D9 – Terraform in der Claude-Umgebung.** registry.terraform.io ist gesperrt; Provider kommen über einen Filesystem-Mirror von releases.hashicorp.com. Darum wird `.terraform.lock.hcl` vorerst nicht committet. Region `eu-central-1` (Variable).

**D10 – Konto löschen:** zuerst DynamoDB-Daten, dann `AdminDeleteUser`. Schlägt Cognito fehl, kann sich der Nutzer erneut anmelden und es wiederholen; umgekehrt blieben verwaiste Daten. Von Admins erstellte Einladungen (PK `INVITE#…`) bleiben bestehen (gehören dem Admin-Prozess).

**D11 – Benutzername** (optional, `[a-z0-9_]{3,20}`, eindeutig über Lock-Item `USERNAME#…` in einer Transaktion) schon in Phase 1, weil Phase 8 Freunde per Benutzername einlädt.

**D12 – Lambda arm64, 256 MB, Logs 14 Tage** (Free-Tier-tauglich, günstiger).
