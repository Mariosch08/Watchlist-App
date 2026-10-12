# Entscheidungen

**D1 – Neues Projekt.** Es gibt keinen Bestand und keine Altdaten (von Mario bestätigt). Die Phase-1-Aufgabe „bestehende Daten migrieren“ entfällt.

**D2 – Branch.** Die Session-Umgebung schreibt den Branch `claude/media-watchlist-discovery-app-00efb2` vor (Push nur dorthin). Er übernimmt die Rolle von `feature/discovery-app`; `main` wird nicht angefasst – Mario merged per Pull Request.

**D3 – Kein AWS, sondern Supabase + GitHub Pages** (Wunsch von Mario: „einfacherer Weg, kein AWS“). Ersetzt den ersten AWS/Terraform-Entwurf (Commits bis `708cd46`).
- Einrichtung nur per Browser: Projekt anlegen, 4 Werte in GitHub eintragen; Deploy macht GitHub Actions (`.github/workflows/deploy.yml`: Tests → `supabase db push` + `functions deploy` → GitHub Pages).
- Supabase Free: Postgres 500 MB, Auth, Edge Functions, Storage, pg_cron – reicht für Mario + Freunde. Einschränkung: Projekt pausiert nach 7 Tagen Inaktivität (in Dashboard wieder starten).
- Abbildung der ursprünglichen AWS-Vorgaben: Cognito → Supabase Auth · API Gateway/Cognito-Authorizer → Row Level Security (`user_id = auth.uid()`) + Edge Functions mit Login-Prüfung · DynamoDB → Postgres-Tabellen · SSM → Supabase-Secrets · S3-Upload → Supabase Storage (Phase 3) · EventBridge → `pg_cron` + `pg_net` ruft Edge Functions (Phase 5/6/10) · SES → SMTP-Dienst Brevo (Free 300/Tag, Phase 10) · Terraform → SQL-Migrationen in `supabase/migrations` (versioniert, nie destruktiv).

**D4 – Sicherheit über Row Level Security.** Das Frontend spricht direkt mit der Datenbank (supabase-js). Jede Tabelle hat RLS; `user_id` hat den Default `auth.uid()` und Policies prüfen `user_id = auth.uid()` – ein mitgeschickter fremder `user_id` wird abgelehnt (getestet). Zusätzlich Spalten-Rechte (z. B. darf niemand `is_admin` oder Einladungs-Zähler setzen) und CHECK-Constraints als Input-Validierung.

**D5 – Tests der Datenbank mit PGlite** (Postgres als WASM in Node, keine Installation): `tests/supabase-stub.sql` bildet das `auth`-Schema, die Rollen `anon`/`authenticated` und Supabase-Standardrechte nach; dann laufen alle Migrationen und Tests als „eingeloggter Nutzer“.

**D6 – Einladungen.** BEFORE-INSERT-Trigger auf `auth.users` verlangt einen gültigen Code (`invites`: nicht abgelaufen, `uses < max_uses`) und zählt ihn atomar hoch. Ausnahmen: der allererste Nutzer (wird Admin, kein Bootstrap-Skript nötig) und im Supabase-Dashboard eingeladene Nutzer (`invited_at` gesetzt = Admin-Freigabe). `check_invite()` gibt dem Formular vorab eine verständliche Fehlermeldung. Risiko: Registriert sich nach dem Deploy jemand Fremdes vor Mario, wäre er Admin → Mario registriert sich direkt nach dem ersten Deploy.

**D7 – Edge Functions prüfen den Login selbst** (`requireUser` via `auth.getUser`, `verify_jwt = false`), weil das Gateway-Flag mit den neuen asymmetrischen JWT-Keys von Supabase nicht zuverlässig funktioniert. Fachlogik liegt in `supabase/functions/_shared/*.ts` ohne Deno-APIs → mit vitest testbar.

**D8 – Watchlist-Titel kommen vom Client** (Suchergebnis der TMDb-Funktion). Das ist unkritisch, weil jeder nur seine eigene Liste sieht; Längen sind per CHECK begrenzt. Für geteilte Listen (Phase 8) werden Titeldaten aus dem TMDb-Cache gelesen.

**D9 – Konto löschen** = `delete_my_account()` (security definer) löscht den Auth-Nutzer; alle Nutzertabellen hängen per `ON DELETE CASCADE` an `auth.users`. Neue Tabellen müssen das ebenfalls tun. Export = `export_my_data()` (läuft mit Nutzerrechten, RLS greift) – neue Tabellen dort ergänzen.

**D10 – Benutzername** (optional, `[a-z0-9_]{3,20}`, UNIQUE) schon in Phase 1, weil Phase 8 Freunde per Benutzername einlädt.

**D11 – Supabase CLI im Workflow auf `latest`.** Eine fixe Version wäre reproduzierbarer, aber ich konnte hier keine aktuelle Versionsnummer verifizieren. Bei Problemen in `deploy.yml` eine Version pinnen.

**D12 – Suche:** `/search/movie` und `/search/tv` parallel statt `/search/multi` (mehr Treffer, keine Personen), eigenes Ranking: Textübereinstimmung mit deutschem **oder** Originaltitel + TMDb-Reihenfolge + Bekanntheit (`log10(vote_count)`). Originaltitel wird angezeigt, weil de-CH-Titel abweichen (z. B. „Sieben“ = „Se7en“).

**D13 – Datenmodell als normalisierte Postgres-Tabellen** statt Single-Table: RLS pro Tabelle, Fremdschlüssel mit `on delete cascade` (Konto löschen bleibt eine Zeile). Server-Tabellen (`feed`-Einträge, `notifications`, `tmdb_cache`) werden nur von Edge Functions mit Service-Role geschrieben; der Client darf dort nur reagieren (Status, gelesen).

**D14 – Streaming-Abos, Last.fm-Name und Mail-Einstellungen in `user_settings`** (eine Zeile pro Nutzer, beim Sign-up angelegt). Spotify-Tokens kommen in Phase 7 in eine eigene Tabelle ohne Client-Zugriff.

**D15 – Tombstones per Trigger:** Löschen eines Watchlist-Eintrags erzeugt einen Tombstone; manuelles Hinzufügen hebt ihn auf, ein Import (`source='imdb'`) muss ihn respektieren (Phase 3). Beim Löschen des Kontos werden keine Tombstones erzeugt.

**D16 – Status und Bewertung schon in Phase 2 in der Watchlist-UI**, damit das neue Datenmodell nutzbar ist (zwei Auswahlfelder, kein eigener Screen). Detailseite mit Bewerten folgt in Phase 4.

**D17 – IMDb-Upload ohne Datei-Speicher:** Statt Bucket + Upload-URL schickt das Frontend den CSV-Text (max. 5 MB) per HTTPS direkt an die Edge Function `imdb`. Die Datei wird nie gespeichert (besser als „nach 7 Tagen löschen“); nur die geparsten Zeilen liegen bis zum Abschluss im Job und werden dann geleert.

**D18 – Import in Batches, vom Client angetrieben:** Edge Functions haben ein Zeitlimit; deshalb verarbeitet jeder `continue`-Aufruf 40 Zeilen (TMDb-Lookups mit 6 parallel, Retry bei 429). Bricht der Browser ab, lässt sich der Job fortsetzen. Ein Cron-getriebener Hintergrund-Import wäre möglich, ist aber für Einzelimporte unnötig.

**D19 – Merge-Regeln:** Neue Titel: bewertet → `completed` + Bewertung, sonst `planned`; `source='imdb'`. Bestehende: Bewertung nur ersetzen, wenn das IMDb-Datum neuer ist; „Geplant“ wird bei Bewertung zu „Gesehen“; fehlende IMDb-ID/Laufzeit werden ergänzt; sonst unverändert. Tombstones verhindern Wiederanlage. TV-Episoden, Spiele, Podcasts werden übersprungen.

**D20 – Edge Functions schreiben mit Service-Role**, filtern aber jede Abfrage explizit auf die verifizierte `user.id` (`requireUser`). `import_jobs` kann der Client nur lesen/löschen.

**D21 – Design „Quiet Ink“ ersetzt „Projektionsraum“** (Vorgabe von Mario, `docs/DESIGN.md`). Konflikte mit den früheren Regeln (Filmkorn, Verläufe, Einblend-Animationen, Versalien) entschieden zugunsten von Quiet Ink. Abweichung: Schriften selbst gehostet statt Google Fonts (Datenschutz, gleiche Optik).

**D22 – Phasen neu nummeriert (12.10.2026)**, weil Mario alle Zusatz-Ideen übernommen hat. Alt → neu: 7 Musik → 8, 8 Freunde → 9, 9 Statistiken → 11, 10 E-Mail → 12, 11 Abschluss → 13. Neu: 3b Frontend-Logik, 7 Streaming-Tools, 10 Tagebuch & Sammlungen. Verweise auf alte Phasennummern in früheren Einträgen (z. B. D8 „Phase 8“, D14 „Phase 7“) meinen die alte Zählung.

**D23 – TanStack Query als Datenschicht** (Phase 3b): ein Cache für alle Seiten, Keys enthalten die User-ID, beim Konto-Wechsel `queryClient.clear()`. Watchlist wird ganz geladen (Paging à 1000) und clientseitig gefiltert/sortiert – bei einigen tausend Titeln schneller und einfacher als Server-Filter. Mutationen pro Zeile, optimistisch, Rollback nur der betroffenen Felder.

**D24 – Ein Suchfeld für beides:** filtert die eigene Liste sofort und sucht parallel (Debounce 350 ms, ab 2 Zeichen) auf TMDb. Spart eine zweite Suche und zeigt, ob ein Titel schon in der Liste ist.

**D25 – Regel „Bewertung heisst gesehen“** lebt im DB-Trigger und wird im Frontend (`watchlistRules.js`) nur für die optimistische Anzeige gespiegelt. Gilt nur für „Geplant“; laufende Serien bleiben offen.

**D26 – Edge Functions senden `{ error, code }`**; das Frontend übersetzt Codes in deutsche Texte. Freunde sehen keine Admin-Hinweise mehr.

**D27 – Detailseite mit einem TMDb-Aufruf** (Phase 4): `details` holt Details, Credits (Serien: `aggregate_credits`), Videos, `watch/providers`, Empfehlungen und `similar` per `append_to_response` und liefert ein schlankes Objekt. Ergebnis 24 h in `tmdb_cache` (für alle Nutzer gleich, keine persönlichen Daten); fällt der Cache aus, wird direkt TMDb gefragt. Fehlt die deutsche Beschreibung, kommt die englische.

**D28 – Trailer erst nach Klick:** Bis „Trailer abspielen“ gedrückt wird, geht keine Anfrage an YouTube; danach `youtube-nocookie.com`. Nur YouTube-Keys mit sicherem Zeichensatz werden übernommen. Reihenfolge: Trailer vor Teaser, Deutsch vor Englisch, offiziell bevorzugt.

**D29 – „Ähnliche Titel“ = TMDb-Empfehlungen** (was andere auch geschaut haben), Fallback auf das genrebasierte `similar`, wenn es keine Empfehlungen gibt. Streaming CH: Gratis- und Werbe-Angebote zählen zu „Im Abo“; TMDb verlangt die Quellenangabe JustWatch.
**D30 – Erst-Admin nur per Dashboard-Einladung (Sicherheit, 13.10.2026).** Die frühere Regel „erster Nutzer wird Admin“ war über die öffentliche Sign-up-API ausnutzbar (auch wieder, wenn alle Konten gelöscht sind) und hatte eine Race-Condition. Jetzt: Registrierung immer mit Code oder Dashboard-Einladung; Admin wird nur ein dashboard-eingeladener Nutzer, solange es keinen Admin gibt; Advisory-Lock serialisiert Sign-ups. Ersetzt D6 (Teil „erster Nutzer“).
