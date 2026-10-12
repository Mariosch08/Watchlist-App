# Watchlist-App

Serverlose Film-/Serien-Watchlist (AWS, Terraform, React + Vite, TMDb) – im Ausbau zur Entdeckungs-App für mich und meine Freunde.

- Fortschritt und nächste Schritte: [`PROGRESS.md`](PROGRESS.md)
- Architekturentscheidungen: [`DECISIONS.md`](DECISIONS.md)

## Schnellstart (Entwicklung)

```bash
cd backend && npm install && npm test
cd ../frontend && npm install && cp ../.env.example .env.local   # Werte aus `terraform output` eintragen
npm run dev
```

Deployment und Einrichtung (TMDb-Key, erster Account, Admin): siehe „Offen für Mario“ in `PROGRESS.md`. Die vollständige Anleitung folgt in Phase 11.
