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

**D31 – Zeitgesteuerte Jobs über GitHub Actions statt pg_cron** (Phase 5): Kein Vault-Setup in Supabase nötig, ein Secret (`CRON_SECRET`) genügt, und der tägliche Aufruf verhindert das Pausieren des Gratis-Projekts. GitHub-Cron läuft in UTC (05:15 = 07:15 Sommerzeit). Achtung: GitHub deaktiviert geplante Workflows nach 60 Tagen ohne Repo-Aktivität – dann in Actions wieder einschalten.

**D32 – Serienfortschritt aus Episodenzahlen statt Episodenlisten:** „Ausgestrahlt“, „bis hier“ und „Als Nächstes“ werden aus `seasons[].episode_count` + `last_episode_to_air` berechnet; Episodenlisten (Titel, Beschreibung) lädt nur eine geöffnete Staffel. Spart viele TMDb-Aufrufe.

**D33 – Geschmacksprofil = abgeleitet + Anpassungen** (Phase 6): Die Genre-Gewichte werden bei jedem Lauf frisch aus den Bewertungen berechnet; `taste_profile.genre_weights_*` speichert nur die Verschiebungen durch 👍/👎 und die Regler. So bleiben neue Bewertungen immer wirksam, und Feedback geht nicht verloren.

**D34 – Streaming-Bonus über TMDb-Discover statt pro Titel abzufragen:** Für „auf meinen Abos“ wird `/discover` mit `with_watch_providers` (CH, Flatrate/Gratis/Werbung) als eigene Quelle abgefragt. Das kostet zwei Aufrufe pro Nutzer statt einen pro Kandidat.

**D35 – Scoring-Code einmal für Server und Browser:** `supabase/functions/_shared/scoring.ts` hat keine Deno-Abhängigkeiten und wird vom Frontend direkt importiert (Genre-Regler, Abend-Picker).

**D36 – Abo-Optimierer rechnet im Browser** (Phase 7): Die Function `availability` liefert nur die Flatrate-Anbieter pro Titel (24 h im `tmdb_cache`, höchstens 300 offene Titel, die zuletzt hinzugefügten zuerst). Zählen, „Lohnt sich“, „Kaum genutzt“ (< 3 Titel) und die beste Zweier-Kombination (greedy) macht `_shared/availability.ts` – derselbe Code wie im Cron, im Browser direkt importiert.

**D37 – Kein „bald weg“:** TMDb (Daten von JustWatch) liefert, wo ein Titel läuft, aber nicht, bis wann. Eine andere Quelle wäre kostenpflichtig oder Scraping. Deshalb nur Verfügbarkeits-Alarme in die andere Richtung („jetzt auf deinen Diensten“).

**D38 – Verfügbarkeits-Alarm einmalig:** Ein Alarm meldet sich einmal (`notified_at`), Benachrichtigung mit `dedupe_key`, damit ein doppelter Cron-Lauf nichts doppelt meldet. Ohne gewählte Dienste zählt jeder Flatrate-Anbieter.

**D39 – Musik-Quelle Nr. 1 ist Last.fm, Spotify nur optional** (Phase 8): Last.fm braucht nur den öffentlichen Benutzernamen (kein Login, kein Token) und funktioniert für alle Freunde. Spotify-Apps im Entwicklungsmodus sind auf eingetragene Nutzer beschränkt; genutzt werden nur `/me/top/artists`, `/me/following` und `/artists/{id}/albums` (keine eingeschränkten Endpunkte wie `/recommendations`).

**D40 – Neuerscheinungen über eine MusicBrainz-Suche pro 25 Artists:** Eine Lucene-Abfrage `arid:… OR …` mit Datumsbereich statt einer Anfrage pro Artist – so bleibt das Limit von 1 Anfrage/s (eigener User-Agent) auch mit mehreren Nutzern im Cron einhaltbar. Cover von der Cover Art Archive (direkter Bildlink, kein API-Aufruf); Live-Alben, Compilations und Remixe werden ausgefiltert.

**D41 – Spotify-Token verschlüsselt, Schlüssel per HKDF:** Refresh-Tokens werden in der Function mit AES-GCM (zufälliger IV) verschlüsselt. Der Schlüssel kommt aus `TOKEN_ENCRYPTION_KEY` oder, falls nicht gesetzt, per HKDF aus dem Service-Role-Key – ein Secret weniger für Mario. Lässt sich ein Token nicht mehr entschlüsseln (Schlüssel gewechselt) oder hat Spotify den Zugriff entzogen, wird die Verbindung gelöscht und der Nutzer verbindet sich neu. Die Spalte ist für Clients per Spalten-Grant gesperrt.

**D42 – Konzerte über Ticketmaster Discovery (gratis, 5000 Anfragen/Tag):** Nur Events, bei denen der Artist als Act geführt wird (die Stichwortsuche ist unscharf). Ticketcorner (grösster CH-Anbieter) hat keine offene API – die Abdeckung ist deshalb unvollständig.

**D43 – Fremde Profile nur über RPCs** (Phase 9): `profiles` bleibt nur für einen selbst lesbar (enthält die E-Mail). Namen von Freunden und Listen-Mitgliedern kommen aus Security-Definer-Funktionen (`friends_overview`, `list_people`, `friends_on_title`, `friend_activity`), die nie E-Mails liefern und selbst prüfen, ob eine Freundschaft oder Mitgliedschaft besteht.

**D44 – Freundschaftsanfragen über eine Funktion:** Suche per Benutzername oder exakter E-Mail, keine Teilsuche (kein Durchstöbern der Nutzer). Eine Ablehnung sieht die anfragende Person weiterhin als „wartet“. Fragen beide gegenseitig an, sind sie sofort befreundet. Höchstens 20 offene Anfragen.

**D45 – Bewertungen teilen ist gegenseitig:** Den Geschmacks-Match (1 − mittlere Abweichung / 9, ab 3 gemeinsamen Bewertungen) gibt es nur, wenn beide `share_ratings_with_friends` an haben. Aktivität ist standardmässig privat (`share_activity` = aus).

**D46 – Listen-Mitglieder nur aus dem Freundeskreis des Owners**; die bisherige Policy erlaubte beliebige Nutzer-IDs. Stimmen und Verfügbarkeit laufen über kleine Security-Invoker-Funktionen (`cast_vote`, `set_availability`), weil ein PostgREST-Upsert auch die Schlüsselspalten aktualisieren will, für die es (absichtlich) kein Update-Recht gibt.

**D47 – Filmabend ohne eigene Titel-Abstimmung:** Der Titel kommt aus den Stimmen der Liste (bester ohne Gegenstimme); die Terminumfrage ist eine eigene kleine Tabelle. Die Kalenderdatei entsteht im Browser mit demselben ICS-Code wie das Kalender-Abo (jetzt auch mit Uhrzeit).

**D48 – Sammlungen sind Listen ohne Mitglieder** (Phase 10): Eine „Sammlung“ („Weihnachten“, „Mit den Eltern“) ist technisch eine gemeinsame Liste, in die niemand eingeladen wurde. Das spart doppelte Tabellen, Rechte und Oberflächen, und eine Sammlung lässt sich jederzeit mit Freunden teilen.

**D49 – Ein Import-Weg für alle Quellen:** IMDb, Letterboxd und Trakt laufen durch denselben Import-Job (Batches, Wiederaufnahme, „nicht gefunden“ manuell zuordnen). Jede Zeile hat eine `ref` (IMDb-ID, `lb:…`, `trakt:…`); gesucht wird über TMDb-ID (Trakt), IMDb-ID (`/find`) oder Titel + Jahr (Letterboxd, `/search`, Toleranz ±1 Jahr). Treffer werden für immer, Fehlschläge 7 Tage gecacht.

**D50 – Tagebuch getrennt von der Watchlist:** Ein Titel steht einmal in der Watchlist, kann aber beliebig oft im Tagebuch stehen. Ein Eintrag „Gesehen am …“ setzt Filme auf „Gesehen“ (mit diesem Datum); Serien behalten ihren Fortschritt. Letterboxd-Einträge tragen `import_ref`, damit ein erneuter Import nichts doppelt anlegt – von Hand erfasste Einträge werden nie dedupliziert.

**D51 – Diagramme selbst gebaut** (Phase 11): Drei kleine SVG-Komponenten (Monate, Bewertungen, Balkenliste) statt einer Chart-Bibliothek – weniger als 3 kB statt 50–200 kB, passen zu den Design-Tokens und haben je eine Tabelle/Liste als Textalternative.

**D52 – „TMDb Top 100“ statt IMDb Top 250, keine Oscar-Liste:** Für die IMDb-Top-250 und Oscar-Gewinner gibt es keine freie, offizielle Quelle (Scraping von IMDb ist ausgeschlossen, eine eingebaute Liste würde veralten). Die TMDb-Bestenliste kommt über die API (7 Tage gecacht). Weitere Herausforderungen nutzen nur eigene Daten.

**D53 – Statistik rechnet im Browser:** Watchlist und Tagebuch sind ohnehin geladen; jede Tagebuch-Sichtung zählt, gesehene Titel ohne Tagebuch-Eintrag zählen einmal am Datum „gesehen“. Kein zusätzlicher Server-Code, keine weiteren Daten verlassen das Konto. Der Jahresrückblick entsteht als SVG im Browser und wird erst beim Teilen zum PNG.

**D54 – Mails über die Brevo-API, angestossen von GitHub Actions** (Phase 12): Alle 30 Minuten sammelt `notify-email` neue Benachrichtigungen (`emailed_at` ist leer) und schickt pro Person eine Mail, höchstens 100 pro Lauf (Brevo-Gratis: 300/Tag). Der Wochenrückblick geht So 18:00 Zürcher Zeit raus (`digest_sent_at` verhindert Doppelte). Abmelden per Token im Link, ohne Login, auch als One-Click (`List-Unsubscribe-Post`). Sandbox über `X-Sib-Sandbox: drop`. Der Cron-Job hält Supabase nebenbei wach.

**D55 – Kein Web-Push:** Web-Push bräuchte VAPID-Schlüssel und die Verschlüsselung der Nachrichten (RFC 8291) in der Edge Function, und auf dem iPhone geht es nur für installierte Apps. Ohne echtes Gerät nicht verlässlich testbar. Die Mails decken denselben Zweck ab; Web-Push bleibt unter „Ideen“.

**D56 – Service Worker nur für die App-Shell:** Gecacht werden nur die eigene index.html (Netzwerk zuerst, offline aus dem Cache) und die gehashten Build-Dateien (Cache zuerst). Anfragen an Supabase und TMDb gehen nie über den Cache – keine veralteten oder fremden Daten auf geteilten Geräten.

**D57 – stats.fm über die öffentliche Profil-API** (Nachtrag): stats.fm hat keine OAuth-Freigabe für Drittanbieter, aber öffentliche Profile sind ohne Login lesbar (`api.stats.fm/api/v1/users/{name}/top/artists` und `/streams/stats`, Pfade wie im offiziellen SDK `@statsfm/statsfm.js`). Gespeichert wird nur der Profilname; was stats.fm privat schaltet, bleibt privat (Fehler „Profil ist privat“). stats.fm liefert Spotify-IDs, aber keine MusicBrainz-IDs – die werden über Last.fm `artist.getinfo` nachgeschlagen und dauerhaft gecacht, damit die Neuerscheinungs-Suche auch ohne Last.fm-Konto funktioniert (braucht nur den API-Schlüssel der App).

**D58 – Design „Reel“ ersetzt „Quiet Ink“** (Wunsch von Mario: Look eines einfachen, aber funktionalen Tools mit Symbolen, coolen Schriften und praktischem Layout für Handy und Desktop; die alte `DESIGN.md` war ausdrücklich nicht mehr bindend). Dunkel zuerst mit vollwertigem Hell-Set und Umschalter (System/Hell/Dunkel, in `localStorage`, vor dem ersten Paint gesetzt). Schriften Space Grotesk / Inter / JetBrains Mono, weiterhin selbst gehostet. Navigation: Seitenleiste mit Gruppen am Desktop, Icon-Leiste auf Tablets, unten eine Tab-Leiste mit „Mehr“-Sheet am Handy. Ein Symbol pro Bereich (`components/navigation.js`) für Navigation und Seitentitel. Der Link „Import / Export“ im Kopf der Watchlist entfällt, er steckt jetzt in der Navigation.

**D59 – Reel „clean“** (Rückmeldung zu Reel: „sieht toll aus – jetzt weniger Vibe-Code-Design-Sprache, mehr einfach schöne, cleane Darstellung“): Struktur von Reel bleibt, die Effekte gehen – neutrale Farben statt Violett, Tinte als Akzent, nur noch Inter, keine Symbole an Titeln und Überschriften (nur noch in der Navigation), keine Karten-Rahmen, Felder und Sekundärknöpfe als graue Flächen. Dazu mehr Bild: Watchlist als Poster-Raster mit umschaltbarer Liste, „Weiterschauen“ als Leiste, Vorschläge als Poster-Karten. Space Grotesk und JetBrains Mono sind entfernt (weniger zu laden). Fast alles über Tokens und zentrale Klassen umgesetzt, damit jede Seite gleichzeitig profitiert.

**D60 – Musik-Tracker mit Hörprofil statt Top-20** (Wunsch von Mario: mehr Daten, auch kleinere Artists, mehr Sinn hinter der Logik): Pro Quelle werden jetzt drei Zeiträume gelesen – Last.fm 1 Monat / 6 Monate / gesamt (100/200/300 Artists) plus Lieblingssongs, stats.fm Wochen / Monate / Lifetime (je bis 100), Spotify short / medium / long (je 50) plus bis 200 gefolgte Artists. Bis zu 300 Artists pro Person bleiben erhalten. Pro Artist:
- **Affinität** (0–1): Anteil am Hören je Zeitraum, logarithmisch zum Lieblings-Artist, damit auch der 150. Artist mit 3 Plays zählt; gewichtet 25 % letzte Wochen, 45 % letzte Monate, 30 % Jahre, dazu etwas für Lieblingssongs und Folgen.
- **Trend:** im Kommen, Dauerbrenner, Wiederentdecken oder gleichbleibend, aus dem Vergleich der Anteile jetzt gegenüber über die Jahre.
- **Grösse:** Last.fm-Hörer (logarithmisch: 2 Mio → gross, 20 000 → klein) und Spotify-Popularität.

Kleine Artists bekommen bei Neuerscheinungen bis zu 10 Punkte Vorrang, weil man ihre Releases sonst verpasst. Singles und angekündigte Releases (bis 60 Tage voraus) kommen nur von Favoriten und kleinen Artists, ähnliche Artists nur mit Alben/EPs. Ähnliche Artists stammen jetzt von 12 gemischten Seeds (Favoriten, Aufsteiger, kleine Artists) und zählen, wie vielen meiner Artists sie ähneln. MusicBrainz-Abfragen werden pro Lauf für alle Personen geteilt; `artist.getinfo` (IDs, Hörer, Genres) ist 30 Tage gecacht und wird auf mehrere Läufe verteilt (höchstens 150 pro Person und Lauf). Ein Lauf hört nach 100 s auf und der Cron ruft nach, bis alle dran waren (Edge-Function-Limit 150 s).

## Über alle Medien hinweg (Wunsch von Mario: sechs Ideen umsetzen und das Produkt vereinheitlichen)

**D61 – Score Bridge: Musik ↔ Filme.**
- *Richtung Film:* Meine stärksten 40 Artists werden mit TMDb-Personen abgeglichen. Eine Person zählt nur, wenn ihre Abteilung „Sound“ ist und der Name exakt dem Artist entspricht; das Ergebnis wird 60 Tage gecacht, für alle gemeinsam. Deren Filme und Serien (Job „Original Music Composer“/„Music“) kommen als Kandidaten mit +14 in „Für dich“, mit der Begründung „Soundtrack von X – 312 Plays bei dir“. Die Detailseite zeigt dazu ein Abzeichen und unter „Musik“ die Komponisten.
- *Richtung Musik:* Filme und Serien mit 9 oder 10 führen zu den Top-Alben ihrer Komponisten (Last.fm), der Soundtrack des Films zuerst. Sie stehen auf der Musikseite unter „Aus deinen Lieblingsfilmen“.
- *Cache:* Der TMDb-Details-Cache hat einen neuen Schlüssel (`details2:`), weil die Komponisten neu dazukommen.

**D62 – Abendstimmung aus den Scrobbles der letzten 6 Stunden.** Last.fm `user.getrecenttracks` (sonst stats.fm `streams/recent`) liefert die gehörten Artists. Ihre Tags kommen aus den gespeicherten Genres, dem Last.fm-Cache oder höchstens vier neuen Abfragen.
- *Regeln:* Eine feste Regeltabelle (`_shared/mood.ts`) ordnet die Tags sechs Stimmungen zu: ruhig, entspannt, beschwingt, Tempo, düster, gross. Jede Stimmung hat passende und zu meidende Genres sowie eine Höchstlänge. Der spezifischste Tag gewinnt, also „dream pop“ vor „pop“.
- *Schwellen:* Die Stimmung braucht mindestens 5 Plays und 40 % Anteil, sonst sagt die App nichts.
- *Wirkung auf den Vorschlag:* Passende Genres bringen in „Was schauen wir heute?“ bis zu +2,5, Konflikte −3. Die Höchstlänge gilt nur, wenn keine Dauer gewählt ist und noch etwas übrig bleibt.
- *Cache und Schalter:* Das Ergebnis ist 15 Minuten gecacht. „Aus“ schaltet die Stimmung mit einem Tipp ab (`user_settings.music_mood`).

**D63 – Abo-Rotation statt Dauer-Abos.** Die App plant einen Dienst pro Monat für die nächsten 3 Monate (den laufenden nur, wenn noch mindestens 10 Tage übrig sind).
- *Grundlagen:* Verfügbarkeit in der Schweiz, Restlaufzeit (Filme: Laufzeit; Serien: offene Folgen × Folgenlänge) und mein Tempo (Minuten pro Woche aus Tagebuch, fertigen Filmen und abgehakten Folgen der letzten 12 Wochen, sonst 4 h geschätzt).
- *Auswahl:* Der Dienst mit den meisten schaubaren Minuten gewinnt, bei Gleichstand der günstigere. Gratis-Dienste brauchen kein Abo.
- *Vergleich und Preise:* Verglichen wird mit „meine jetzigen Abos weiterlaufen lassen“. Die Preise sind Richtwerte in CHF und lassen sich pro Dienst überschreiben (`user_settings.streaming_prices`).
- *Kalender:* Ein gespeicherter Plan (`rotation_plans`) erzeugt Termine: „Abo starten“ am 1., „bis 30.11. kündigen – noch 1 Titel offen“ drei Tage vor Monatsende, mit den noch offenen Titeln zum Zeitpunkt des Abrufs.

**D64 – Aufhol-Countdown vor dem Staffelstart.**
- *Wann:* Ist Folge 1 einer neuen Staffel angekündigt (höchstens 180 Tage voraus) und noch nicht alles Ausgestrahlte geschaut, rechnet die App einen Plan.
- *Rechnung:* Offene Folgen (aus den Folgen pro Staffel, `series_progress.season_episodes`) werden auf die Samstage bis zum Start verteilt, „1 Folge pro Woche“. Die Sessions erscheinen mit Folgen-Codes im Kalender.
- *Erinnerungen:* Der tägliche Serien-Check merkt sich pro Staffel den Startpunkt (`catchup_plans`). Liegt man mehr als eine Woche hinter dem Plan, kommt höchstens wöchentlich eine sanfte Erinnerung (Typ `catchup`). Ausblenden geht pro Plan.

**D65 – Eine Agenda für alles mit Datum.** `_shared/agenda.ts` erzeugt aus Folgen, Filmstarts, Konzerten (gefunden und „Ich gehe hin“), angekündigten Alben, Aufhol-Sessions und Abo-Erinnerungen eine einzige Liste. Kalenderseite, Kalender-Abo (ICS, 180 Tage), Wochenrückblick-Mail („Diese Woche bei dir“) und „Für dich“ („Diese Woche“) nutzen dieselbe Funktion und zeigen damit immer dasselbe.

**D66 – Life Reel im „Rückblick“ (vorher „Statistik“).**
- *Daten:* Pro Monat speichert die App das Hören (`music_months`). Mit stats.fm ist es die echte Hörzeit; mit Last.fm sind es die Plays, geschätzt mit 3,5 Minuten pro Play und markiert mit „ca.“. Dazu kommen der meistgehörte Artist und Song. Die letzten 12 Monate werden nach und nach aufgefüllt, je Lauf zwei ältere.
- *Konzerte:* Besuchte Konzerte stehen in `concert_log`, über „Ich gehe hin“ oder per Hand eingetragen.
- *Ansicht:* Die neue Ansicht „Zeitleiste“ zeigt pro Monat einen Satz („März: 2 Filme, 41 h Musik, Phoenix live in Zürich“), den Top-Titel, den Song in Dauerschleife und „An diesem Tag“ über alle Medien. Das Jahresbild heisst mit Musikdaten „Mein Jahr“ und enthält Stunden Musik, Konzerte und den meistgehörten Artist.

**D67 – Überschneidungen mit Freunden, nur mit Einwilligung.** Zwei neue Schalter, beide standardmässig aus: „Lieblings-Artists für Konzert-Buddys“ und „Streaming-Abos beim Filmabend“.
- *Konzert-Buddys:* Die App zeigt sie nur, wenn *beide* ihre Musik teilen und der Freund den Artist mit mindestens 0,25 Affinität hört. Es gibt eine Benachrichtigung pro Konzert und Freund. Dafür speichert `concerts` jetzt den `artist_key`.
- *Gemeinsamer Bildschirm:* Er nimmt beim Filmabend die Zugesagten (sonst alle in der Liste), lässt weg, was jemand von ihnen schon gesehen hat, und sagt, wessen Abo laufen kann („Läuft auf Laras MUBI“).
- *Datenschutz:* Abos und Gesehenes anderer verrät `night_screen()` nur bei Freundschaft und eingeschaltetem Teilen; bei reinen Listen-Mitgliedern bleibt beides leer. Alle Teilen-Schalter stehen im Profil unter „Mit Freunden teilen“.

