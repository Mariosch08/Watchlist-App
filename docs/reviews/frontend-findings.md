# Frontend-Review: Befunde (Zwischenstand)

> Automatisch gesichert aus der laufenden Analyse (12.10.2026). Befunde von sechs Prüfern, zusammengeführt; „Geprüft“ = von einem zweiten Prüfer im Code bestätigt. Grundlage für Phase 3b.

## F01 – One page-wide busy/error lock: every edit waits for the server, freezes the whole page, and the select jumps back to the old value

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, scale, resilience, structure
- **Dateien:** frontend/src/components/Form.jsx:5-23; frontend/src/pages/Watchlist.jsx:14; frontend/src/pages/Watchlist.jsx:16-18; frontend/src/pages/Watchlist.jsx:25; frontend/src/pages/Watchlist.jsx:27-37; frontend/src/pages/Watchlist.jsx:53; frontend/src/pages/Watchlist.jsx:68; frontend/src/pages/Watchlist.jsx:79; frontend/src/pages/Watchlist.jsx:93; frontend/src/components/WatchlistActions.jsx:7; frontend/src/components/WatchlistActions.jsx:17; frontend/src/components/WatchlistActions.jsx:27; frontend/src/pages/ImportExport.jsx:11; frontend/src/pages/ImportExport.jsx:17-26; frontend/src/pages/ImportExport.jsx:66; frontend/src/components/NotFoundResolver.jsx:9; frontend/src/pages/Profile.jsx:90; frontend/src/pages/Profile.jsx:140-145
- **Problem:** WatchlistPage has a single useSubmit() (Watchlist.jsx:14). It runs the initial load (16-18), search (25), add (28), status/rating update (32) and remove (34). Its one boolean `busy` (not a counter) disables the 'Suchen' button (53), every '+' (68), and both selects plus 'Entfernen' in every row (WatchlistActions.jsx:7/17/27). Its one `error` string renders once, between the search card and the list (79). Every run() clears the previous error (Form.jsx:12). Mutations are pessimistic: `update` calls replace() only after the server answers (32). The selects are controlled by `item.status`/`item.my_rating` and onChange does not touch local state, so React restores the old value right after the change event, then disables everything. ImportCard uses the same pattern: the parent's `run`/`busy` goes to every NotFoundResolver, and `run` is nested inside itself (ImportExport.jsx:17-24). Invites does the same (Profile.jsx:90, 140-145). Nothing orders concurrent edits to one row, so removing the lock without per-row ordering would let an older response overwrite a newer change.
- **Auswirkung:** Picking 'Gesehen' makes the dropdown jump back to 'Geplant', greys out every control on the page (about 3,000 with 1,000 rows) for the round trip, and only then shows 'Gesehen'. Rating 20 freshly imported films means 20 freezes in a row, with no sign of which row is saving. While a TMDb search runs (up to 4 attempts with backoff), the list cannot be edited. If a save fails while you are scrolled to row 300, the select silently returns to the old value, the error is printed far above out of view, and your next click wipes it, so you believe the change was saved. In the import resolver, searching one title disables every other row and the import button. Copying an invite link disables 'Widerrufen' on all codes.
- **Vorschlag:** Track mutation state per item, not per page. Add TanStack Query v5 and use useMutation per action (add/update/remove). In onMutate: cancelQueries(['watchlist']), snapshot the list, and apply the change with setQueryData. In onError: roll back and show a toast that names the title and offers 'Erneut versuchen' (DESIGN.md §Toasts: errors stay until dismissed). In onSuccess: replace the row with the server row. Use `scope: { id: titleKey(item) }` so quick edits on one row run in order. Disable nothing globally; show at most a small pending marker (aria-busy) on the row being saved. Give search its own state with its message under the search form. Keep useSubmit only for real forms (login, profile, password). Apply the same per-row state to NotFoundResolver and Invites.
- **Hinweis Prüfer:** TanStack Query v5 is justified here. Phase 3b explicitly plans a cached data layer, and later phases (detail cache, episodes, feed, shared lists with votes) all need one. Five corrections to the proposal:

1. **Rollback.** Do not roll back by restoring a whole-list snapshot. If row A fails while row B also has a pending optimistic edit, restoring the snapshot taken before A also reverts B. In onMutate, save only that row's previous field values. In onError, write back only those fields with setQueryData(['watchlist'], list => list.map(x => key(x)===k ? {...x, ...prev} : x)).
2. **No refetch per edit.** Do not invalidate ['watchlist'] after each mutation, because that re-downloads every row on every click. In onSuccess, patch the single row with the server row (the triggers set rated_at/watched_at). Also set staleTime high or refetchOnWindowFocus:false for this key, or guard focus refetches with isMutating, so a background refetch cannot overwrite pending optimistic rows.
3. **Ordering.** scope: { id: titleKey(item) } is correct. In v5, onMutate still runs immediately and only mutationFn waits, so the UI updates at once and same-row writes reach the server in order. Do not disable controls. Show a small aria-busy pending marker on the row via useMutationState. Wrap the row in React.memo with stable callbacks, so one edit re-renders one row instead of the whole list.
4. **Errors.** Errors go to a toast: "Bewertung für <Titel> nicht gespeichert" with "Erneut versuchen". It stays until dismissed (DESIGN.md:179). A Toast component has to be built; none exists yet.
5. **Remove.** The plan wants "Entfernen mit Rückgängig", so do a deferred delete: hide the row now, show an undo toast for 5 s, then send the DELETE (also send it on pagehide or unmount). Undo cancels the timer. This beats delete-then-reinsert, which would change added_at and the list order.

Other places:
- **Search:** give it its own query keyed by the submitted term (not the live input). The "Keine Treffer für" message at Watchlist.jsx:57 currently shows the live input text, not the term that was searched.
- **NotFoundResolver:** keep search and busy state per row. Only the row being resolved disables its own buttons.
- **Invites:** copyLink should not go through run. Give the clicked button its own short "Kopiert" feedback.
- **Forms:** keep useSubmit only for real forms (login, profile, password, invite creation).

If the owner prefers no new dependency, a roughly 40-line useWatchlist hook can do the same: a per-row pending Set, a per-row promise chain for ordering, and a field-level rollback. Given the roadmap, though, TanStack Query is the better long-term choice and not overkill.

## F02 – Watchlist and IMDb-CSV export are silently cut off at PostgREST's 1,000-row limit

- **Schwere:** high · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, scale, resilience, structure
- **Dateien:** frontend/src/lib/watchlist.js:5-7; frontend/src/pages/Watchlist.jsx:20; frontend/src/pages/Watchlist.jsx:83; frontend/src/pages/Watchlist.jsx:90-96; supabase/config.toml:1-9; supabase/functions/imdb/index.ts:14; supabase/functions/imdb/index.ts:191-195; supabase/functions/imdb/index.ts:205-210
- **Problem:** loadWatchlist() runs `select()` (all columns) ordered by added_at desc, with no .range() and no count. Hosted Supabase caps every PostgREST response at 'Max rows' (default 1,000), and config.toml does not change that. The response has no error and no truncation flag. The IMDb import accepts up to 20,000 rows (MAX_ROWS, index.ts:14), and ratings exports of more than 1,000 titles are common. The rest of the page assumes `items` is the whole list: the caption is `items.length` (83) and `inList` (20) is built from the truncated array. exportCsv runs the same unpaged query through PostgREST, sorted ascending by added_at (191-195), so it keeps the oldest 1,000 and drops the newest. It still reports `${exported} Titel exportiert` as if the export were complete.
- **Auswirkung:** After importing 1,800 ratings, the list shows exactly '1000 Titel' and the 800 oldest entries are missing without notice, including titles added by hand before the import. Searching for one of them shows '+' instead of the check mark (see F12 for what happens when you click it). The 'IMDb-CSV herunterladen' backup or Letterboxd/Trakt export silently leaves out the most recently added titles. That is data loss you only notice when you need the backup. Planned statistics, diary and calendar built on this list would be wrong in the same way.
- **Vorschlag:** Short term: in loadWatchlist() and exportCsv(), loop `.range(from, from+999)` until a short page comes back (or build the CSV in an RPC that returns one value, like export_my_data). Get the total from `select('*', { count: 'exact', head: true })` instead of items.length. For the 'already in list' check on search results, query exactly those ids: `.select('media_type,tmdb_id,status,my_rating').in('tmdb_id', ids)`. Target design (together with F08/F09): useInfiniteQuery with server-side filter and sort, a virtualized list, and an index on watchlist (user_id, added_at desc). Add a regression test with more than 1,000 rows.
- **Hinweis Prüfer:** The short-term fix is correct, but the target design is more than this app needs. I recommend this:

1. Add one paging helper and use it in both places. It must have a stable tie-breaker, because paging on `ORDER BY added_at` alone can repeat or skip rows when timestamps are equal.
   ```js
   async function fetchAll(build, size = 1000) {
     const out = [];
     for (let from = 0; ; from += size) {
       const page = unwrap(await build().range(from, from + size - 1));
       out.push(...page);
       if (page.length < size) return out;
     }
   }
   loadWatchlist = () => fetchAll(() => supabase.from('watchlist')
     .select('media_type,tmdb_id,title,original_title,poster_path,release_date,vote_average,status,my_rating,source,added_at')
     .order('added_at', { ascending: false }).order('media_type').order('tmdb_id'));
   ```
   Put the same loop (in TypeScript) in exportCsv, using `.order('added_at').order('media_type').order('tmdb_id')`. Then `items.length` and `inList` are correct again, and you need neither a separate count query nor the `.in('tmdb_id', ids)` lookup.

2. If you want a one-click stopgap, raise "Max Rows" in the Supabase dashboard API settings to about 20,000. Note this in PROGRESS.md, because it is not versioned in the repo. Do not rely on it alone.

3. Skip useInfiniteQuery, virtualization and the new (user_id, added_at desc) index for now. With 2,000 to 5,000 rows, lazy-loaded posters (TitleRow.jsx:12 already uses loading="lazy") and the existing PK prefix on user_id are enough. Revisit this only when server-side filtering or sorting (F08/F09) actually lands.

4. Add a unit test for fetchAll with a mocked builder that returns 1000 + 1000 + 1 rows, and check that the result has exactly 2,001 rows.

Related but separate: exportCsv (198-204) makes one TMDb external_ids call per manually added title, in sequence. Once paging works, a large number of manual entries could hit the edge function's time limit. Batch these calls or limit how many run.

## F03 – 'Entfernen' deletes at once with no confirmation or undo, loses rating and watch date, and blocks re-import

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, structure
- **Dateien:** frontend/src/components/WatchlistActions.jsx:27-29; frontend/src/pages/Watchlist.jsx:33-37; frontend/src/lib/watchlist.js:39-41; supabase/migrations/20261012130000_data_model.sql:54-85; supabase/migrations/20261012000000_init.sql:170; supabase/migrations/20261012130000_data_model.sql:366
- **Problem:** The 'Entfernen' ghost button sits right next to the rating select (on mobile, on the same wrapped line). One click sends DELETE: no confirmation, no toast, no undo, no client-side snapshot. The after-delete trigger writes a watchlist_tombstones row (D15), so later IMDb imports deliberately skip the title. status, my_rating, rated_at, watched_at, imdb_id and runtime are gone. Adding it again manually creates a fresh 'Geplant' row with no rating. The focused button is unmounted, so keyboard focus falls back to the top of the page. Undo is possible with the current grants: INSERT on watchlist covers all columns (init.sql:170) and DELETE on tombstones is granted (data_model.sql:366). DESIGN.md defines toasts with one optional action.
- **Auswirkung:** A mis-tap on the phone while reaching for the rating dropdown permanently deletes a film you rated 9/10, including its watched date. Re-importing the IMDb CSV does not bring it back because of the tombstone, and the app never tells you that.
- **Vorschlag:** Remove the row optimistically from the cache and show a toast '„Dune“ entfernt · Rückgängig' for about 6 s. Either send the DELETE only when the toast expires (flush pending deletes on pagehide), or delete at once and on undo re-insert the full snapshot from the mutation context, then delete its tombstone, restoring the row at its old position. After removal, focus the next row (or the list heading). Move 'Entfernen' out of the always-visible row into a per-row '…' menu or the upcoming detail page. Unit-test the delayed commit and undo logic.
- **Hinweis Prüfer:** Delete right away and offer undo. Do not delay the commit: a pending DELETE flushed on pagehide is unreliable on mobile because supabase-js fetch has no keepalive, and it adds state you don't need.

1. In remove(i), keep the full row object as a snapshot. Delete it, drop it from state, and show a toast for 5s (DESIGN.md:179): '„{title}“ entfernt' with the action 'Rückgängig'. This needs a small Toast component, since none exists yet.
2. Undo:
   - Insert the snapshot unchanged with supabase.from('watchlist').insert(snapshot). Include added_at, source, status, my_rating, rated_at, watched_at, imdb_id and runtime, but leave out user_id and updated_at.
   - Then delete the tombstone explicitly with .from('watchlist_tombstones').delete().match({media_type, tmdb_id}). This step is required when source='imdb', because the trigger only lifts it for 'manual'.
   - Put the returned row back in the list, sorted by added_at desc, so it lands in its old position.
3. After removal, move focus to the next row's first select, or to the 'Meine Watchlist' heading if the list is empty.
4. Optionally make the button a little harder to hit by mistake: an icon with an aria-label, or more space before it. A '…' menu or moving it to the detail page can wait until the detail page exists. Don't add window.confirm on top of undo.
5. Optional and cheap: have the import report tombstoned skips separately ('X Titel übersprungen, weil du sie entfernt hast').
6. Unit-test the snapshot and undo function in lib/watchlist.js: insert payload and tombstone delete, mocked like the existing tests.

## F04 – The import loop belongs to the ImportCard component: leaving /import orphans it, progress freezes, and 'Import fortsetzen' starts a second loop on the same job

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, scale, resilience, auth-routing, structure
- **Dateien:** frontend/src/pages/ImportExport.jsx:13-26; frontend/src/pages/ImportExport.jsx:46; frontend/src/pages/ImportExport.jsx:55-59; frontend/src/pages/ImportExport.jsx:66; frontend/src/lib/imdb.js:12; frontend/src/lib/imdb.js:31-45; frontend/src/components/ImportProgress.jsx:13; supabase/functions/imdb/index.ts:124-158
- **Problem:** runImport() is an async while-loop started from a component callback. It has no AbortSignal, no unmount check and no app-level registry; its progress callback is the setJob of the ImportCard that started it. If you leave /import, the loop keeps calling `continue` (even after sign-out, where it retries 401s). When you return, a new ImportCard reads latestImportJob() once and gets status 'processing' with busy=false. It shows a progress snapshot that never updates (no polling, no Realtime) plus 'Import fortsetzen' (55-59). Clicking that starts a second runImport. On the server, advance() reads job.processed and writes processed/imported/updated/skipped/not_found from its own snapshot, with no lock or compare-and-set (index.ts:124-153). Both loops therefore process the same 40 rows, the last writer sets the counters, and not_found gets duplicate entries, which leads to duplicate React keys at ImportExport.jsx:66. Related problems: ImportProgress says 'Import läuft' for every status except 'done', even when nothing runs, e.g. after a reload or a closed tab (13). latestImportJob never selects the `error` column that the server writes (imdb.js:12). The retry loop also retries 4xx like 'Job not found' and waits 1.5+3+4.5 s with no hint. While a new file uploads, the button still reads 'Datei importieren' and the old job's stats stay visible (46). There is no beforeunload warning although closing the tab stops the import. Nothing tells the watchlist that new rows arrived.
- **Auswirkung:** You start a 1,500-title import (about 38 batches, several minutes) and switch to 'Watchlist' to see titles arrive, but the list stays as it was. Back on 'Import', the bar is frozen at e.g. '320 von 1500' with 'Import läuft' and an 'Import fortsetzen' button. Clicking it doubles the TMDb lookups, and the final 'Neu / Aktualisiert / Übersprungen' counts are wrong (titles just imported by the other loop show up as 'Übersprungen'). The 'Nicht automatisch gefunden' list shows some titles twice. After a reload, 'Import läuft' suggests the server is still working, so you wait for nothing. No other page shows that an import is running.
- **Vorschlag:** Move the runner out of the component into a module-level singleton or context, e.g. lib/importRunner.js with Map<jobId, {promise, abort}>, where ensureRunning(job) returns the existing run. Expose progress via useSyncExternalStore or queryClient.setQueryData(['importJob', id]). When ImportCard mounts and finds a 'processing' job, attach to the running loop if there is one, otherwise auto-resume or label it 'Pausiert'. Derive the label from (status, running): Läuft / Pausiert / Abgeschlossen / Fehlgeschlagen. Show a small 'Import läuft 340/1500' chip in Layout that links to /import. Add beforeunload while running. Retry only network errors and 5xx, stop at once on 4xx, show 'Verbindung unterbrochen – neuer Versuch …' during backoff, and select and show job.error. Abort on sign-out. Invalidate ['watchlist'] after each batch (throttled) and on completion. On the server, make advance() compare-and-set (`.eq('processed', job.processed)`; if 0 rows were updated, return the current job without counting) or use a short lease, and dedupe not_found by imdb_id. Inject invoke and sleep into runImport so the retry logic can be tested.
- **Hinweis Prüfer:** Scale the fix down. Do these four things (about 60 lines in total):
1) Add frontend/src/lib/importRunner.js as a module singleton: `let active = null; const listeners = new Set();`. `ensureRunning(job)` returns `active.promise` if `active?.id === job.id`. Otherwise it starts runImport, with onProgress setting `active.job` and notifying listeners, and clears `active` in a finally block. Also export `subscribe(fn)` and `getActive()`. In ImportCard, subscribe with useSyncExternalStore (or useEffect). On mount, if the latest job is 'processing', call ensureRunning(job). Calling it again simply attaches to the loop that is already running. This auto-resume replaces the manual "Import fortsetzen" button and makes a double loop from the same tab impossible. Clear `active` on SIGNED_OUT (one line in AuthContext, or check the session in the loop).
2) Derive the label from (status, running): running → "Läuft", processing && !running → "Unterbrochen" (only possible after an error, since mount auto-resumes), 'failed' → "Fehlgeschlagen", 'done' → "Abgeschlossen". While startImport runs, show "Wird hochgeladen …" and hide the old job.
3) Server: make the update in advance() compare-and-set: add `.eq('processed', job.processed)` and use `.maybeSingle()`. If no row comes back, return a fresh loadJob without counting. That is one line plus a fallback, and it also covers two tabs or devices. A lease or dedupe of not_found is not needed.
4) In runImport, stop retrying when `err.status` is below 500. Pass the status through from functionError, e.g. as `err.status = res.status`.
Optional and cheap: add a beforeunload handler while `active` is set. Skip the Layout chip, the throttled watchlist invalidation and the react-query integration for now. The watchlist reloads on mount anyway. These only make sense if a shared data layer (react-query) comes in as part of the planned frontend rework; then the runner can write its progress into that cache.

## F05 – A failed first load is a dead end (endless skeleton, no retry), and adding a title afterwards blanks the whole app because there is no error boundary

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, resilience, auth-routing, structure
- **Dateien:** frontend/src/pages/Watchlist.jsx:11; frontend/src/pages/Watchlist.jsx:16-18; frontend/src/pages/Watchlist.jsx:20; frontend/src/pages/Watchlist.jsx:27-31; frontend/src/pages/Watchlist.jsx:79; frontend/src/pages/Watchlist.jsx:85-88; frontend/src/components/Form.jsx:12; frontend/src/main.jsx:8-16; frontend/src/App.jsx:27-41
- **Problem:** `items` starts as null and only loadWatchlist() sets it. If that request fails (offline, or a Supabase Free project paused after 7 days, DECISIONS D3), items stays null for good, and `items === null` renders <TitleRowSkeleton/> with aria-busy forever (85-86). The only error is the shared <Messages> above the list, with no retry, and the next run() clears it (Form.jsx:12). Search still works, and inList treats null as empty, so every result shows '+'. add() then runs `setItems((list) => [item, ...list.filter(...)])` with list === null (30). The updater throws a TypeError during React's render phase, outside run()'s try/catch. There is no ErrorBoundary, componentDidCatch or errorElement anywhere (main.jsx, App.jsx), so React 18 unmounts the whole root, header included. The same applies to any future render error, for example an unusual TMDb detail payload, or a lazy chunk that fails to load after a GitHub Pages redeploy. The empty-state text (88) mentions importing but offers no link, contrary to DESIGN.md's 'one sentence, one action'.
- **Auswirkung:** On a flaky mobile connection you see 'Keine Verbindung zum Server.' over grey rows that never resolve, and the message disappears as soon as you do anything. You search (which works) and tap '+': the title is saved, but the screen turns completely white with no navigation and no message, and only a manual reload recovers. Screen readers keep announcing 'Wird geladen'.
- **Vorschlag:** Model loading, error and data explicitly for every list (useQuery gives isError/refetch/retry): render an inline error card with 'Erneut laden' where the list would be, and never let a mutation error clear the load error. Guard every cache updater (`list ?? []`) or block '+' until the list has loaded. Add a root error boundary inside Layout (the nav stays visible) with a German fallback ('Etwas ist schiefgelaufen' + 'Neu laden' / 'Zur Watchlist'), as a root errorElement once on createBrowserRouter, plus per-route boundaries for the detail page. For 'Failed to fetch dynamically imported module', reload once automatically with a sessionStorage guard. Give the empty state a Link to /import.
- **Hinweis Prüfer:** Keep the fix small and don't migrate routers for this.

1. Watchlist.jsx: give the initial load its own state (`loadError`, or a status of loading/error/ready), separate from the shared `useSubmit` error. If loading fails, show an inline notice where the list goes, e.g. "Watchlist konnte nicht geladen werden." with an "Erneut laden" button that calls the same load function. Optionally also reload automatically on `window` 'online'. If the project adopts a query cache app-wide (isError/refetch), use that; don't add TanStack Query just for this.

2. Don't use `list ?? []` as the main guard. After a failed load the list would then show only the one new title, as if that were the whole watchlist. Two better options:
   - Disable '+' while `items === null`. The result list can then show that the watchlist hasn't loaded.
   - In `add`, write `setItems((list) => list && [item, ...list.filter(...)])`, and reload the list when it was null.

3. Add one small class ErrorBoundary in components/Layout.jsx around `<Outlet/>`, reset by `location.key`, so the nav stays usable. Fallback text: "Etwas ist schiefgelaufen." with buttons "Neu laden" (`location.reload()`) and "Zur Watchlist". The app uses <BrowserRouter>/<Routes>, where `errorElement` does nothing, so a class boundary is the right fit. Moving to createBrowserRouter is not needed for this. Per-route boundaries can come later with the detail page.

4. Leave out the chunk-load auto-reload with a sessionStorage guard until routes are actually lazy-loaded. At that point the same boundary can reload once on "Failed to fetch dynamically imported module".

5. Line 88: put a `<Link to="/import">` on "importiere deine IMDb-Daten".

## F06 – No shared data cache: every navigation refetches everything behind a skeleton, the list goes stale, and future pages cannot share state

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, scale, resilience, auth-routing, structure
- **Dateien:** frontend/src/main.jsx:9-11; frontend/src/pages/Watchlist.jsx:11-18; frontend/src/pages/Watchlist.jsx:85-86; frontend/src/pages/ImportExport.jsx:13-15; frontend/src/pages/Profile.jsx:91-95; frontend/src/pages/Profile.jsx:189-193; frontend/src/auth/AuthContext.jsx:9-11; PROGRESS.md:8
- **Problem:** Every page keeps server data in local useState and fetches it in a mount-only useEffect with no cleanup, ignore flag or AbortController. The route component owns the state, so it is discarded on every route change; `items` restarts as null and the skeleton shows on each visit. In dev, StrictMode runs each effect twice, so every page fires two identical requests and the boolean busy turns false while the second is still running. Nothing refetches on window focus, visibility change or reconnect, and nothing invalidates the list after an import. Nothing outside WatchlistPage can read or update the list, so the planned /title/:type/:id page (PROGRESS.md:8), the feed's add button, series tracking and shared lists would each need their own fetch and would show different states. Cold start is fully sequential: bundle, then getSession, then RequireAuth renders the page, and only then does the data request start. PROGRESS.md Phase 3b already lists 'Datenschicht mit Cache und optimistischen Updates' and it is not built.
- **Auswirkung:** Watchlist → Profil → Watchlist (later Watchlist → title detail → back) always flashes a skeleton and downloads the whole list again, hundreds of KB on mobile data. If you rate something on your phone, the laptop tab keeps showing the old rating until you reload. Titles imported while you are on the Watchlist page do not appear. Once the detail page exists, changing a status there will not show up in the list.
- **Vorschlag:** Introduce TanStack Query v5 as the single client cache: QueryClientProvider in main.jsx, hooks in lib/queries/*, keys scoped by user id (['watchlist', userId, filters], ['importJob','latest'], ['profile', userId], ['invites'], ['search', q, page], ['title', type, id]). Use staleTime of about 30-60 s and keep refetchOnWindowFocus/refetchOnReconnect on. Call queryClient.clear() on SIGNED_OUT. Invalidate ['watchlist'] after imports and mutations. Prefetch the watchlist as soon as the session is known. Seed the detail page's header from the cached list row (initialData). Deduplication also removes the StrictMode double requests and the setState-after-unmount class of bugs. Consider a Supabase Realtime subscription on watchlist later; shared lists and voting need it anyway.
- **Hinweis Prüfer:** TanStack Query v5 is the right choice for this roadmap. It is about 13 KB gzipped, and the detail page, feed, shared lists and voting all need shared, deduplicated server state. A hand-rolled context store would end up rebuilding it. Adjust the proposal as follows:

1) One list query: ['watchlist', userId]. Do not put filters in the key. Fetch the whole per-user list once and do filtering, sorting and grouping on the client with `select` or useMemo, with filters kept in URL search params. Otherwise every filter click refetches.
   - In loadWatchlist, page through results with .range() until a short page comes back, or raise max_rows. This removes the silent 1000-row cap.
   - Select explicit columns and drop user_id.
2) Mutations (status, rating, add, remove): use setQueryData with the row the server returns, or apply an optimistic patch and roll back on error. Do NOT invalidate and refetch the whole list after every rating change.
   - Give each row its own pending state instead of the single shared `busy` from useSubmit (components/Form.jsx:6-22).
3) Set staleTime to about 60 s to 5 min. Keep refetchOnWindowFocus and refetchOnReconnect on, because they cover the phone/laptop case. Skip Realtime until shared lists or voting exist.
4) Auth:
   - Call queryClient.clear() on SIGNED_OUT, and also when the user id changes.
   - Account deletion already ends in signOut (Profile.jsx:162), so clear() covers it.
5) Detail page:
   - Use ['title', type, id] for the TMDb details and pass the cached list row as `placeholderData`, not `initialData`. initialData would be treated as complete, fresh detail data and would skip the details fetch. The list row has no overview, providers or trailer.
   - Read the user's status and rating from the watchlist cache through a selector instead of copying them into the title query.
6) Import:
   - Move the runImport loop out of the component, either into a module-level runner or a useMutation whose progress goes into the cache under ['importJob', userId], updated with setQueryData on each batch.
   - Navigating away must not orphan the loop, and coming back must show live progress.
   - Hide "Import fortsetzen" while a loop is active.
   - Invalidate ['watchlist', userId] after each batch or when the import finishes.
   - Server side, add a compare-and-set in imdb `advance`: update ... where processed = job.processed, and retry or return the current state on a conflict. This prevents duplicate batches.
7) With cached data rendering immediately, restore scroll on back navigation. Either switch to createBrowserRouter with <ScrollRestoration/>, or save and restore scrollY per list.
8) Prefetching on session start and the StrictMode arguments are optional or irrelevant. Do not prioritise them.

## F07 – Search, filters and scroll position are not in the URL: Back, reload and navigation lose them, and nothing can be bookmarked or shared

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** auth-routing, interaction, data-flow, scale
- **Dateien:** frontend/src/pages/Watchlist.jsx:12-13; frontend/src/pages/Watchlist.jsx:23-26; frontend/src/main.jsx:11; PROGRESS.md:84
- **Problem:** `query` and `results` are plain useState (Watchlist.jsx:12-13); useSearchParams is used only in Register.jsx. There is no filter or sort state anywhere yet (see F08). The app uses <BrowserRouter> (main.jsx:11), not a data router, so <ScrollRestoration> is not available, and there is no manual scroll handling: the window keeps its scroll offset across route changes, and returning to the list remounts it at the top behind a skeleton.
- **Auswirkung:** Searching 'Dune', opening Import or Profil and coming back, pressing Back, or reloading clears the search. A search or filtered view cannot be bookmarked or sent to a friend. Once detail pages exist, clicking row 150 opens the detail page scrolled far down (the offset carries over), and Back drops you at the top of a list that is loading again, with search and filter gone.
- **Vorschlag:** Keep search and list view in the URL (`/?q=dune&status=watching&type=tv&sort=added`) with a small useUrlState(key, default) hook on useSearchParams. Use replace while typing (debounced) and push for a submitted search, so Back steps through searches. Switch to createBrowserRouter (react-router 6 supports it) and add <ScrollRestoration getKey={(l) => l.pathname + l.search} />, so a new page opens at the top and Back restores the list position. Render the list from the cache (F06) so the restored offset applies.
- **Hinweis Prüfer:** The direction is right, but parts of the proposal should change:

1. Use the URL for list-view state: `status`, `type`, `sort`, and a local text filter on the user's own list. Use a small useUrlState(key, default) hook on useSearchParams. Always write with `{ replace: true }`. Leave out default values so the URL stays `/` normally.

2. The TMDb add-search: putting `?q=` in the URL with replace is fine, so reload and coming back from another page restore it. Do not push a new history entry for each submitted search. Back stepping through old TMDb searches is noise in a personal app, and sharing that URL has no value.

3. Fix the login redirect along with this. In App.jsx:18 pass `from: location.pathname + location.search`. Login.jsx:18 can stay as it is.

4. Scroll: switching to createBrowserRouter is cheap. Wrap the existing <Routes> tree with createRoutesFromElements, and AuthProvider can stay outside RouterProvider. Then add <ScrollRestoration /> to Layout.

5. Keep the default getKey (location.key) rather than pathname+search. With the default, Back restores the position, but clicking the "Watchlist" nav link opens at the top, which is what users expect. Keying on pathname would also jump them back into the middle of the list on that click.

6. This only works if "/" renders synchronously from cached items when you return (F06). Otherwise the skeleton makes the restore clamp to the top.

7. Do this in Phase 3b together with filters (F08) and before Phase 4 detail pages. That is not urgent for today's single-page list.

## F08 – A list of hundreds of titles has no filter, sort, grouping or in-list search; watched and to-watch titles are mixed

- **Schwere:** high · **Geprüft:** bestätigt · **Bereiche:** interaction, scale
- **Dateien:** frontend/src/lib/watchlist.js:5-7; frontend/src/lib/watchlist.js:13-22; frontend/src/pages/Watchlist.jsx:41-57; frontend/src/pages/Watchlist.jsx:80-97; frontend/src/components/TitleRow.jsx:5-33; frontend/src/styles/components.css:556-564; supabase/functions/_shared/imdb.ts:120
- **Problem:** The list always shows every entry in one flat <ul> ordered by added_at desc (watchlist.js:6). There is no filter by status or type, no sort (title, year, TMDb score, my rating, runtime), no text filter over your own entries, no grouping ('Am Schauen' first) and no paging. The only search field queries TMDb. An IMDb ratings import inserts every rated title as 'Gesehen' (imdb.ts:120), all at once, so the few 'Geplant' titles are buried. On mobile, .row-actions wrap to a full line (components.css:556-564), so each row is about two lines tall. Manually added titles store no runtime (watchlist.js:14-22), so a filter like 'under 2 h' cannot work for them.
- **Auswirkung:** After an import you scroll through hundreds of rows to find something you still want to watch; 'what next?' or 'what am I watching right now?' cannot be answered on this page. Finding 'Severance' in your own list, or checking how you rated 'Dune', needs the browser's find-in-page. The heading says 'Watchlist', but most rows are films you have already seen. The planned 'Was schauen wir heute?' picker and the statistics depend on exactly these views.
- **Vorschlag:** Add a list toolbar: segments with counts ('Als Nächstes' = Am Schauen then Geplant, 'Gesehen', 'Pausiert/Abgebrochen', 'Alle'), a Film/Serie filter, a sort menu (Hinzugefügt, Titel, Jahr, TMDb-Bewertung, Meine Bewertung, Laufzeit) and an 'In meiner Liste filtern' field. Filter client-side over the cached list with useDeferredValue first; once paged (F02), push filters to PostgREST (`.eq('status')`, `.ilike('title')`, `.order()`) backed by indexes on (user_id, status) and (user_id, added_at desc). Keep filter and sort in the URL (F07). Store runtime and genres when a title is added (Phase 4 details) so the picker can filter on them.
- **Hinweis Prüfer:** The core proposal (segments with counts, a Film/Serie filter, a sort menu, a text filter over your own list, state kept in the URL) is right. The server side is overkill for a few users with hundreds to a few thousand rows each:
1) Keep the whole list on the client and filter and sort it in memory with useMemo. Do not push filters to PostgREST, do not page on the server, and do not add new indexes. The primary key (user_id, media_type, tmdb_id) already covers user_id, and a seq/index scan of a few thousand rows costs nothing. Fix the 1000-row cap instead: fetch in chunks with .range() until a chunk comes back short, or raise max_rows. Also select only the columns the list needs.
2) Default view: "Als Nächstes" (Am Schauen first, then Geplant, newest added first), with counts on every segment: Als Nächstes / Gesehen / Pausiert+Abgebrochen / Alle. Add a small Film/Serie toggle. Sort options: Hinzugefügt, Titel (localeCompare 'de'), Jahr, Meine Bewertung, TMDb. Skip Laufzeit until runtime is filled in for every title, or put titles without a runtime last.
3) Text filter: normalize case and diacritics (NFD, strip accents) and match title and original_title. With a few hundred rows a plain filter is fast enough; useDeferredValue is optional.
4) The real cost at scale is rendering, not filtering: 1000 rows each with 2 selects of 5 and 11 options. Show the first ~50 results with a "Mehr anzeigen" button (or an IntersectionObserver). Do not add a virtualization library. Optionally make the rows more compact on mobile, for example a status chip instead of a full-width actions line.
5) Use useSearchParams for segment, type, sort and q, so the view survives reloads and the back button.
6) Fill in runtime and genres lazily in Phase 4: when the detail page or the import already calls TMDb, or with a one-off backfill. Do not add an extra TMDb call to every add from the search results.

## F09 – Typing in the search box re-renders the entire watchlist; all rows render at once with no memoization or virtualization

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, scale
- **Dateien:** frontend/src/pages/Watchlist.jsx:12; frontend/src/pages/Watchlist.jsx:20; frontend/src/pages/Watchlist.jsx:44-50; frontend/src/pages/Watchlist.jsx:90-96; frontend/src/components/TitleRow.jsx:5; frontend/src/components/WatchlistActions.jsx:4-26; frontend/src/components/Form.jsx:5-23
- **Problem:** WatchlistPage owns the search `query` (set on every keystroke, line 49) as well as `items`, `results` and the shared busy/error. Every state change re-runs the whole component: it rebuilds the `inList` Set over all items (20) and recreates every TitleRow and WatchlistActions with fresh inline onUpdate/onRemove closures (93). Neither component is memoized. Each row has two selects with 16 <option>s. One reviewer rendered 2,000 rows with the real components (production build): about 63,000 elements, 3.7 MB of markup and 185-345 ms per render on a desktop machine. With today's 1,000-row cap that is roughly half, and phones are several times slower; once paging is fixed (F02), all rows would render. Each run() also flips busy on and off, which adds two more full re-renders and a disabled toggle on every control.
- **Auswirkung:** With 500-1,000 titles, typing 'Severance' into 'Titel suchen' lags visibly, especially on phones, because each character re-diffs the whole list. The first paint after loading builds tens of thousands of DOM nodes, so scrolling and memory suffer. Every rating change re-renders the list twice.
- **Vorschlag:** Move search into its own <SearchPanel> with local query/results state so typing never touches the list. Wrap TitleRow and WatchlistActions in React.memo and pass stable handlers (`onUpdate(key, changes)` via useCallback, or ids with mutations looked up inside the row). Compute inList with useMemo. Virtualize the list (@tanstack/react-virtual or react-virtuoso) or page it at 50-100 rows with 'Mehr anzeigen'. As a cheap first step, add `content-visibility: auto; contain-intrinsic-size: auto 72px` to .title-row.
- **Hinweis Prüfer:** Fix in this order. Steps 1-3 cover most of the gain. Virtualization is overkill for now.

1. Move search into a `<SearchPanel inList={inList} onAdd={add} />` that holds its own `query`, `results` and `searchedTerm` state. Typing then never renders the list, which removes the keystroke lag on its own (0 list renders per character). Use `searchedTerm` in the no-hits message at :57.

2. React.memo by itself does NOT help, because the global `busy` prop changes for every row on each `run()`, and `useSubmit().run` (Form.jsx:9) is a new function on every render, so a `useCallback` that depends on it is never stable. Instead:
   - Replace the global busy flag for list actions with per-row pending state, e.g. `const [pending, setPending] = useState(() => new Set())`, and pass `pending={pending.has(key)}`. This also stops a single save from disabling every control in the list, which is also a UX bug.
   - Build stable handlers with `useCallback` plus functional `setItems`, keyed by item: `onUpdate(item, changes)` and `onRemove(item)`.
   - Then wrap TitleRow and WatchlistActions in `React.memo`. After this, a rating change re-renders only one row.
   - Optionally update the list optimistically and roll back if the save fails.

3. Cap rendering instead of virtualizing. Render the first 100 rows and add a "Mehr anzeigen" button that adds 100 more; this also fits the planned status/filter views, where client-side filtering shrinks the list. Rows wrap to variable height on mobile (components.css:556), which makes virtualization fiddly and adds a dependency for little benefit at 1-2k rows. Reconsider only if lists regularly exceed ~3k.

4. `content-visibility: auto; contain-intrinsic-size: auto 72px` on `.title-row` is a fine small addition for layout and paint, but it does not reduce React's work or the number of DOM nodes, so it does nothing for the typing or busy-toggle cost. Do not treat it as the first fix.

5. `useMemo` for `inList` is optional; it costs well under 1 ms.

## F10 – 'Abmelden' signs you out on every device and does nothing visible when offline

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** auth-routing, resilience
- **Dateien:** frontend/src/components/Layout.jsx:21; frontend/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:1155-1186; frontend/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:1474-1481
- **Problem:** Layout.jsx:21 calls `supabase.auth.signOut()` with no arguments and ignores the returned promise. In the installed auth-js 2.65.0 (bundled with supabase-js 2.45.4), the default scope is 'global' (GoTrueClient.js:1155), which revokes every refresh token of the user. Other devices keep their access token until it expires (about 1 h); their next refresh then fails, and auth-js removes the session and emits SIGNED_OUT (1474-1481). If the logout request fails with a network error (not 401/403/404), _signOut returns {error} before _removeSession() (1170-1177). The session stays in localStorage, and because the result is ignored the UI shows nothing.
- **Auswirkung:** Logging out on the phone kicks you out on the laptop up to an hour later, seemingly at random and possibly mid-import, onto a login page that gives no reason; anything you were typing is lost. On a friend's device with a weak connection, tapping 'Abmelden' does nothing visible, and the person walks away thinking they are logged out while the session is still active.
- **Vorschlag:** Add one signOut() in AuthContext that uses scope 'local' by default, awaits the result and disables the button while it runs. On error, show 'Abmelden fehlgeschlagen – keine Verbindung' and offer 'Trotzdem auf diesem Gerät abmelden' (remove localStorage[supabase.auth.storageKey] and reload). Offer a separate, clearly named 'Auf allen Geräten abmelden' (scope 'global') in Profil. When a SIGNED_OUT arrives that the user did not start, show 'Deine Sitzung ist abgelaufen, bitte melde dich erneut an' on /login (see F22).
- **Hinweis Prüfer:** Keep it small and fix it in Layout.jsx, or in one shared helper. The proposal goes too far for this app.

1. Use `scope: 'local'`, await the call, and disable the button while it runs:
```js
const [busy, setBusy] = useState(false);
const logout = async () => {
  setBusy(true);
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) { // offline: server revoke failed, still drop this device's session
    try { localStorage.removeItem(supabase.auth.storageKey); } catch {}
    window.location.assign(import.meta.env.BASE_URL + 'login');
  }
};
```
Falling back silently to a local wipe is fine here. A leftover server-side refresh token for a private app is acceptable, and it beats a dialog with "Trotzdem auf diesem Gerät abmelden".

2. Do not change ResetPassword.jsx:20. A global logout after a password change is intended.

3. A separate "Auf allen Geräten abmelden" button in Profil is optional. Add it only if the owner wants it.

4. The "Sitzung abgelaufen" notice on /login belongs to F22. With scope 'local', an unexpected SIGNED_OUT becomes rare: it only happens after a password reset elsewhere or when the refresh token really expires. So that notice is a low priority, not part of this fix.

## F11 – Expired or already-used confirmation links end in a silent dead end, with no way to resend the mail

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** auth-routing, interaction
- **Dateien:** frontend/src/auth/AuthContext.jsx:9-18; frontend/src/App.jsx:18; frontend/src/pages/Register.jsx:20-44; frontend/src/pages/Login.jsx:35; frontend/src/lib/errors.js:4; supabase/migrations/20261012000000_init.sql:87-93; frontend/node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:166-178
- **Problem:** Sign-up sets emailRedirectTo: appUrl() (Register.jsx:27). If the link is expired or was already consumed (mail scanners often open links first), Supabase redirects to `/#error=access_denied&error_code=otp_expired&error_description=…`. auth-js drops any session and returns the error (GoTrueClient.js:166-178). AuthContext ignores the error from getSession(), RequireAuth's <Navigate to="/login"> drops the hash (App.jsx:18), and no code reads it. There is no supabase.auth.resend() anywhere in src: not on the Register done screen and not next to the login error 'Bitte bestätige zuerst deine E-Mail-Adresse' (errors.js:4). Registering again also fails, because the trigger already used up the single-use invite code on the first attempt (init.sql:87-93), so check_invite (Register.jsx:20) now returns false.
- **Auswirkung:** A friend clicks the confirmation mail a day later (or it landed in spam) and arrives on an empty login page with no explanation. Logging in says to use the link in the mail, which no longer works. Trying the invite link again says 'Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.' The only way out is asking Mario for a new code or fixing it in the Supabase dashboard, so friends drop out at sign-up.
- **Vorschlag:** In AuthContext, capture the URL auth error before routing removes it (parse window.location.hash once at startup, or use the error from getSession()) and expose it as authError; show a German notice on /login ('Der Bestätigungslink ist abgelaufen oder wurde bereits verwendet.'). Add 'Bestätigungsmail erneut senden' with a cooldown, using supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } }), on the Register done screen, in that notice, and next to the email_not_confirmed error. Consider flowType 'pkce' or OTP-code confirmation so prefetching scanners cannot use up the link.
- **Hinweis Prüfer:** A smaller fix is enough. No PKCE, no OTP codes, no custom cooldown timer.

1. Capture the URL error once, before the router navigates away:
   - Either parse it at module load in lib/supabase.js: `const h = new URLSearchParams(window.location.hash.slice(1)); export const authUrlError = h.get('error_code') || h.get('error') ? { code: h.get('error_code'), description: h.get('error_description') } : null;`
   - Or in AuthContext call `supabase.auth.initialize().then(({ error }) => ...)`. Do not use getSession() for this.
   - Expose it through AuthContext (or read it directly in Login.jsx).
   - Login.jsx then shows: "Der Bestätigungslink ist abgelaufen oder wurde schon verwendet. Versuch dich anzumelden – falls deine Adresse noch nicht bestätigt ist, kannst du unten eine neue Mail anfordern."
   - Add `otp_expired: 'Der Link ist abgelaufen oder wurde bereits verwendet.'` to AUTH_CODES in errors.js.

2. In Login.jsx, catch the code inside run() before useSubmit flattens it: `const { error } = await supabase.auth.signInWithPassword(...); if (error?.code === 'email_not_confirmed') setNeedsConfirm(true); unwrap({ error });`
   - When needsConfirm is set, show a "Bestätigungsmail erneut senden" button that calls `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: appUrl() } })`.
   - After it sends, set the info message and disable the button.
   - The server already rate-limits mails, and errors.js:8 already maps over_email_send_rate_limit, so no client-side cooldown timer is needed.

3. Optional: the same resend button on the Register done screen (Register.jsx:34-44), using form.email.

4. Optional: in Register.jsx, if check_invite fails, still try signUp for an email that may already be pending. Or simply point the error text to "Bestätigungsmail erneut senden" on the login page.

## F12 – A stale local list fabricates partial rows on add and shows raw technical errors on update

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, resilience, structure
- **Dateien:** frontend/src/lib/watchlist.js:13-31; frontend/src/lib/watchlist.js:33-37; frontend/src/pages/Watchlist.jsx:20; frontend/src/pages/Watchlist.jsx:27-32; frontend/src/components/WatchlistActions.jsx:7; frontend/src/components/WatchlistActions.jsx:16; frontend/src/lib/errors.js:13-29
- **Problem:** addToWatchlist upserts with ignoreDuplicates and .maybeSingle(). If the title already exists in the database, no row comes back, and the function returns the client-built `row` (`saved ?? row`, line 30), which has no status, my_rating, added_at or source. The page prepends that stub to the list; `value={item.status}` is undefined, so the select shows its first option 'Geplant' and the rating 'Nicht bewertet'. This happens whenever the local list is stale: titles beyond the 1,000-row cap (F02), rows inserted by a running import after the list loaded, or rows added on another device. updateWatchlistItem uses .single(); if the row was deleted elsewhere, PostgREST returns PGRST116, errorMessage() has no mapping for it, and the raw English message is shown while the stale row stays in the list.
- **Auswirkung:** You search 'Dune', which you rated 9/10 long ago but which is not in the loaded list, and tap '+'. It appears at the top as 'Geplant / Nicht bewertet' and the count goes up by one; after a reload it is back in its old place with 9/10. Changing the status of a title you removed on your phone shows 'Cannot coerce the result to a single JSON object', and the row stays.
- **Vorschlag:** When the upsert returns null, fetch the existing row (`select().match({media_type, tmdb_id}).single()`) and merge that into the cache; never insert a fabricated row. Map PGRST116 to 'Dieser Titel ist nicht mehr in deiner Watchlist' and drop the row from the cache (or invalidate ['watchlist']). Refetch on focus (F06) so stale lists are rare. Add a unit test for the 'already exists' branch.
- **Hinweis Prüfer:** The direction is right; here is a simpler version.

(1) addToWatchlist: when the upsert returns null, read the existing row with `supabase.from('watchlist').select().match({ media_type, tmdb_id }).single()` and return `{ item, existed: true }`. Do not switch to a merge upsert. The UPDATE grant covers only status, my_rating, rated_at and watched_at (data_model.sql:365), so a merge that writes title or poster would fail with 42501. In the page, when `existed` is true, replace the row in place or move it to the top, and show an info message: 'War bereits in deiner Watchlist'. Never return a client-built row.

(2) updateWatchlistItem: use `.maybeSingle()` instead of `.single()` and return null when no row matches. The page then removes the row and shows 'Dieser Titel ist nicht mehr in deiner Watchlist.' This avoids special handling for the error code. As a fallback, also map `err.code === 'PGRST116'` in errorMessage and add a case to the existing frontend/test/errors.test.js.

(3) The real cure for stale lists is in F02 and F06: paginate or lift the 1,000-row cap, refetch on focus or visibility change, and refetch when an import finishes. A mocked unit test for the 'already exists' branch is optional for an app this small.

## F13 – Status, rating and watch date follow different rules in the UI and the import, and contradict each other

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction
- **Dateien:** frontend/src/components/WatchlistActions.jsx:7; frontend/src/components/WatchlistActions.jsx:18; supabase/functions/_shared/imdb.ts:118-125; supabase/functions/_shared/imdb.ts:138; supabase/migrations/20261012130000_data_model.sql:20-41
- **Problem:** The import's mergeImportRow sets status 'completed' whenever a rating is present (new row) or newer (existing row) (imdb.ts:120, 138). A rating set in the UI sends only {my_rating}; the watchlist_before_write trigger sets rated_at and, only when status='completed', watched_at, but never changes status. The rule therefore lives only in the import path. The trigger sets watched_at = now() the first time status becomes 'completed' and never clears it, so switching back to 'Geplant' keeps the title counted as watched. The import does not use 'Date Rated' as the watch date, so every imported rated title gets watched_at = import date. There is no way to enter when something was watched. Marking 'Gesehen' does not offer to rate, and rating does not offer to mark as watched.
- **Auswirkung:** A film you rate 8/10 right after watching stays 'Geplant' with no watched date and will keep showing up as something to watch, while the same rating via IMDb import marks it 'Gesehen'. The planned statistics, diary, calendar and '52 Filme im Jahr' challenge would miss manually rated titles and show 400 films 'watched' on the day of the import.
- **Vorschlag:** Put one rule in the database trigger: when my_rating goes from null to a value on a planned/watching/paused title, set status 'completed'. Mirror it in a pure function (lib/watchlistRules.js applyChange(item, changes)) used by the optimistic update and tested with vitest, so the optimistic row matches the server's. Show an inline toast 'Als gesehen markiert · Rückgängig'. When the status becomes 'Gesehen', open a small rating + date popover (default today, 'früher', 'Datum unbekannt'). In the import, set watched_at from rated_at. Clear watched_at when status leaves 'completed', or better, add a watch_log table for rewatches and the diary.
- **Hinweis Prüfer:** Keep the fix small. The rule lives in the database only.
1) Import (imdb.ts): wherever status is set to 'completed', also set watched_at to the rating date: watched_at: row.rated_at ?? null on insert (line 120), and values.watched_at = row.rated_at ?? existing date on the update path (line 138). The trigger already falls back to now() when this is null.
2) Trigger: add `if tg_op = 'UPDATE' and old.my_rating is null and new.my_rating is not null and old.status = 'planned' and new.status = 'planned' then new.status := 'completed'; end if;` and place it before the watched_at block. Only 'planned' qualifies, not watching or paused, so a series rated mid-season stays open. No client-side copy (lib/watchlistRules.js) is needed: updateWatchlistItem already returns the row the trigger produced, and Watchlist.jsx:32 replaces the item with it. Add that copy only if you later switch to optimistic updates.
3) Do not clear watched_at when the status changes. Treat it as the last watch date and have stats/diary count only rows with status = 'completed'. Build the watch_log table when the diary/rewatch feature is actually built, not now.
4) UI: when the status is 'Gesehen', show an optional small <input type="date"> "Gesehen am" next to the dropdowns; it writes watched_at, which the grant already allows. A short "Als gesehen markiert" hint is enough. The undo toast and the popover with today/earlier/unknown are optional extras.
5) Optional, later: for tv rows the import could map a rating to 'watching' rather than 'completed'.
6) One-time backfill for data already imported: update watchlist set watched_at = rated_at where source = 'imdb' and status = 'completed' and rated_at is not null.

## F14 – Search logic: empty message shows the unsubmitted input, whitespace queries produce a server error, old results linger, and responses are not tied to their query

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, scale, resilience, structure, auth-routing
- **Dateien:** frontend/src/pages/Watchlist.jsx:12-13; frontend/src/pages/Watchlist.jsx:23-26; frontend/src/pages/Watchlist.jsx:44-57; frontend/src/lib/watchlist.js:9-11; frontend/src/lib/errors.js:37-41; frontend/src/lib/errors.js:54; supabase/functions/_shared/tmdb.ts:109-110
- **Problem:** `query` (live input) and `results` are separate states. 'Keine Treffer für „{query}“' (57) interpolates the live input, not the term that was searched. A query of only spaces passes `required`, is sent as '' after trim, and the function answers 400 'Invalid query'; FUNCTION_STATUS has no 400 entry, so the UI shows 'Server-Fehler (Status 400: Invalid query)'. While a new search runs, or after it fails, the previous results stay visible with active '+' buttons; there is no clear button. The 'Suchen' button keeps its label and no result skeleton appears (Login/Register do show a busy label). `setResults(await searchTitles(query))` carries no request identity: today only the page-wide lock (F01) prevents overlapping searches, so removing it and adding debounce (both planned in Phase 3b) would let a slow older response overwrite a newer one.
- **Auswirkung:** After 'Sieben' finds nothing, typing 'Se7' makes the page claim 'Keine Treffer für „Se7“' before you pressed Enter. A stray space plus Enter shows a technical server error. After a failed search, the old results look like answers to the new query. On a slow connection nothing shows that a search is running.
- **Vorschlag:** Implement search as useQuery({ queryKey: ['search', debouncedQ, page], enabled: debouncedQ.trim().length >= 2, placeholderData: keepPreviousData }) with a 300 ms debounce and the AbortSignal passed to fetch; keying by query makes out-of-order responses harmless. Render messages from the submitted query (from the key / ?q=), show 'Suche läuft …' and a dimmed or skeleton state, clear results on error, add a clear (×) button and Esc. Validate trim() on the client and add a 400 mapping in errors.js. Unit-test the hook with fake timers.
- **Hinweis Prüfer:** A small fix is enough now. The heavier rewrite fits Phase 3b, but only if Phase 3b brings in a query library anyway.

1. Keep the submitted term and its results in one state: `const [search, setSearch] = useState(null)` holding `{ q, results }`. On submit: `const q = query.trim(); if (q.length < 2) return setError('Bitte mindestens 2 Zeichen eingeben.');` then `setSearch({ q, results: null })` and run the search. On success call `setSearch({ q, results })`. On failure call `setSearch(null)`. Render 'Keine Treffer für „{search.q}“' from that state, so the message always names what was actually searched.
2. While the search runs (`search.results === null`), show `{searching ? 'Suche …' : 'Suchen'}` on the button and reuse TitleRowSkeleton under the form. Clear `search` when the input is emptied (the native × or backspace), or add an explicit × and handle Esc.
3. In errors.js, add `400: 'Ungültige Eingabe.'` to FUNCTION_STATUS.
4. Phase 3b (debounce, no page-wide lock):
   - Tie each response to its request. Either keep a counter ref (`const id = ++seq.current; const r = await searchTitles(q); if (id === seq.current) setSearch({ q, results: r })`), or, only if TanStack Query is adopted for the whole data layer anyway, use `useQuery({ queryKey: ['search', q], enabled: q.length >= 2, placeholderData: keepPreviousData })`. Keying by query already makes out-of-order responses harmless.
   - Do not plan on AbortSignal: functions-js 2.4.1 cannot pass one without upgrading supabase-js.
   - Use a 300 ms debounce with at least 2 characters. Each search makes two TMDb calls on the server, so do not search on every keystroke.
   - Mirror the term into `?q=` as part of the planned URL state.
   - Separate the search's busy state from the watchlist actions (see F01).
   - A small fake-timer test of the debounce and the stale-response guard is enough.

## F15 – Search-and-add flow is click-heavy and limited: first page only, no type filter, add always means 'Geplant', no caching

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** interaction, scale, data-flow
- **Dateien:** frontend/src/pages/Watchlist.jsx:57-77; frontend/src/lib/watchlist.js:9-22; supabase/functions/_shared/tmdb.ts:108-119; supabase/functions/tmdb/index.ts:12; supabase/functions/_shared/auth.ts:12
- **Problem:** searchTitles never sends `page` and ignores the total_pages the function returns (tmdb.ts:111, 118), so at most ~20 films + ~20 series ever appear and there is no 'Mehr laden'. There is no Film/Serie or year filter. Result rows only have '+', which always creates 'Geplant'. A result already in the list shows only a check mark, not its status or rating. Logging a film you just watched takes '+', finding the row in the list below, then the status select, then the rating select: three separate saves, each locking the page (F01). Results stay expanded above the list until you clear the field by hand. Each search does auth.getUser over the network (auth.ts:12) plus two TMDb calls; tmdb_cache is not used for search, and the client keeps no query→results cache, so repeating a search (or the resolver searching the same title) repeats the whole chain.
- **Auswirkung:** Adding the 1984 'Dune' as watched with 7/10 takes about 4 steps and 3 waits. Older or ambiguous titles beyond the first 40 mixed results cannot be found at all. After adding a few titles, a block of 40 results stays above your list on mobile. Every search takes the slow cold path.
- **Vorschlag:** Pass page and show 'Mehr Ergebnisse' while page < total_pages; add Film/Serie chips. Give each result two actions, '+ Merken' and '✓ Gesehen' (opens a rating/date popover, see F13), and show the current status badge for titles already in the list (via the in-list query from F02). Collapse results after adding or on Esc. Cache searches client-side (TanStack Query staleTime) and server-side in tmdb_cache with a short TTL (`search:<lang>:<query>:<page>`). Verify the JWT locally (JWKS) instead of calling auth.getUser on every request.
- **Hinweis Prüfer:** Keep the UX part and drop most of the infrastructure part. That is overkill for a few users.

1. Two actions per result: "+ Merken" and "Gesehen". Change the signature to `addToWatchlist(result, { status })` and have "Gesehen" insert with status 'completed'. Rating can stay on the list row or go in a small inline select. Do not build a popover until F13 needs one.
2. Turn `inList` into a Map(titleKey → item) built from `items` (already loaded). For titles already in the list, render the status badge, or just reuse <WatchlistActions> inline. This needs no extra query (F02 is not required here).
3. Make the results block close properly: `onChange` sets results to null when the value is empty, Esc and a "Schliessen" button also close it, and the "no results" message stores the query that was actually searched. Do NOT auto-collapse after "+", because adding several titles from one search (sequels, a franchise) is common. Show a short "hinzugefügt" status instead.
4. Paging and filters:
   - Pass `page`.
   - Show "Mehr Ergebnisse" while page < total_pages and append the results.
   - Add Film/Serie chips that filter the media_type client-side (no server change needed).
   - Cheaper and more useful than paging: parse a trailing 4-digit year ("Dune 1984") in handleTmdbRequest and send `primary_release_year` to /search/movie and `first_air_date_year` to /search/tv.
   - Let NotFoundResolver pass `row.year` too.
5. Caching: a module-level `Map` in searchTitles keyed by `query|page` is enough. Do not add TanStack Query just for this; only consider it if it gets adopted app-wide for other reasons. Skip server-side search caching in tmdb_cache, since the hit rate is close to zero with a few users and a DB round trip costs about as much as TMDb. Also skip JWKS local verification for now: supabase-js 2.45 has no getClaims, and getUser is a small cost here. Revisit both only if latency actually becomes a problem.

## F16 – Error texts are chosen by HTTP status: friends see admin instructions like 'TMDb lehnt den Schlüssel ab' for outages, and offline errors appear in English

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** interaction, resilience
- **Dateien:** frontend/src/lib/errors.js:27; frontend/src/lib/errors.js:37-54; supabase/functions/_shared/tmdb.ts:38-39; supabase/functions/imdb/index.ts:91; supabase/functions/imdb/index.ts:137; supabase/functions/imdb/index.ts:165; supabase/functions/imdb/index.ts:170; frontend/test/errors.test.js:33-35; frontend/node_modules/@supabase/functions-js/dist/module/types.js:8-10
- **Problem:** functionError() maps every 502 to 'TMDb lehnt den Schlüssel ab – Secret TMDB_API_KEY in Supabase prüfen.' and every 404 to 'Server-Funktion nicht gefunden (Deploy prüfen).', then appends the raw English server detail and status. But tmdbGet returns 502 for any TMDb failure after retries, including 429 rate limits and outages (tmdb.ts:38-39), and the import returns 502 for 'Batch failed, please continue' (index.ts:137). 404 is also used for 'Job not found', 'Title not in not-found list' and 'TMDb title not found' (91, 165, 170). Offline, functions.invoke throws FunctionsFetchError whose context is a TypeError, not a Response; functionError passes it through and the UI shows 'Failed to send a request to the Edge Function', because the offline regex (errors.js:27) only matches 'Failed to fetch|NetworkError'. That regex also misses Safari's 'Load failed'. PGRST116 is unmapped. errors.test.js asserts the misleading 502 text.
- **Auswirkung:** A friend whose import hits a short TMDb hiccup reads 'TMDb lehnt den Schlüssel ab – Secret TMDB_API_KEY in Supabase prüfen. (Status 502: Batch failed, please continue)': alarming, wrong, and with no next step such as 'Import fortsetzen'. Offline search on an iPhone shows English text. Resolving a title another tab already resolved shows 'Server-Funktion nicht gefunden (Deploy prüfen)'. DESIGN.md requires plain-language what/what-to-do messages.
- **Vorschlag:** Have the edge functions return a machine-readable `code` (TMDB_KEY_MISSING, TMDB_KEY_INVALID, TMDB_UNAVAILABLE, BATCH_FAILED, JOB_NOT_FOUND, ALREADY_RESOLVED, NOT_IMDB_CSV, TOO_MANY_ROWS, INVALID_QUERY) and translate codes, not statuses, into German messages with a next step ('TMDb ist gerade nicht erreichbar – in einer Minute „Import fortsetzen“'). Treat FunctionsFetchError, 'Load failed', 'Failed to fetch' and 'NetworkError' as one 'Keine Verbindung – bitte erneut versuchen'. Map PGRST116. Show admin/deploy hints only to is_admin users and keep status and details in console.error. Update errors.test.js.
- **Hinweis Prüfer:** The direction is right. Gating hints by is_admin and adding a full code taxonomy across both functions is overkill for an owner and a few friends. A smaller version:

1. Offline errors in errors.js:
   - In functionError: `if (error?.name === 'FunctionsFetchError') return new Error('Keine Verbindung zum Server – bitte erneut versuchen.')`.
   - Extend the regex at line 27 to `/Failed to fetch|NetworkError|Load failed|Failed to send a request/i`.
   - Add `PGRST116: 'Dieser Eintrag existiert nicht mehr – Liste neu laden.'` to the code map.

2. Edge functions: give HttpError an optional third `code` argument and return `{ error, code }` from the error handlers (imdb/index.ts catch block and tmdb.ts:132). Only a few codes are needed:
   - tmdbGet: TMDB_KEY_INVALID when TMDb returns 401/403, otherwise TMDB_UNAVAILABLE.
   - BATCH_FAILED (imdb/index.ts:137)
   - JOB_NOT_FOUND
   - ALREADY_RESOLVED
   - NOT_FOUND
   - NOT_IMDB_CSV (already a de facto code)
   - TOO_MANY_ROWS
   - TMDB_KEY_MISSING
   Also catch fetch TypeErrors inside tmdbGet and turn them into TMDB_UNAVAILABLE. Today they become 500 'Internal error'.

3. functionError: read `code` and translate it to neutral German text with a next step, for example:
   - TMDB_UNAVAILABLE/BATCH_FAILED: 'TMDb ist gerade nicht erreichbar. In ein paar Minuten „Import fortsetzen“ bzw. erneut suchen.'
   - TMDB_KEY_*: 'Die Suche ist gerade nicht eingerichtet – bitte dem Admin Bescheid geben.'
   - ALREADY_RESOLVED: reload the job silently instead of showing an error.
   Keep the deploy hint only for a 404 without our JSON `error` field, which means the Supabase gateway answered, not our function. Fall back to a generic 'Etwas ist schiefgelaufen – bitte erneut versuchen.' Never append raw English details or status to the UI; console.error them instead.

4. Move the NOT_IMDB_CSV handling from imdb.js:25 into the same code map.

5. Update errors.test.js:
   - FunctionsFetchError gives the German offline text.
   - 'Load failed' is recognised.
   - The TMDB_UNAVAILABLE code gives the outage text, not the key text.
   - The 401 key case stays.

## F17 – Only the latest import job is ever shown: unresolved titles and interrupted imports from earlier files disappear

- **Schwere:** medium · **Geprüft:** bestätigt · **Bereiche:** interaction, resilience
- **Dateien:** frontend/src/lib/imdb.js:8-17; frontend/src/pages/ImportExport.jsx:13-15; frontend/src/pages/ImportExport.jsx:35-38; frontend/src/pages/ImportExport.jsx:60-70; supabase/functions/imdb/index.ts:96-117
- **Problem:** latestImportJob() uses .limit(1) and ImportCard renders only that job. The page's own instructions (35-38) tell users to import both 'Your ratings' and 'Your watchlist', which are two files and two jobs. Once the second import starts, the first job's not_found list can no longer be reached. Starting a new file while the previous job is still 'processing' (interrupted) silently creates a new job (index.ts:96-117); the old job's remaining rows are never imported. After an import there is no link to the imported titles, and 'Übersprungen' gives no reasons.
- **Auswirkung:** You import ratings and get 12 'Nicht automatisch gefunden' titles, import the watchlist next, and those 12 are gone from the UI for good. An import interrupted at 60% and followed by another file silently loses the remaining 40%.
- **Vorschlag:** Load all jobs with unresolved not_found rows (or the last 5-10 jobs) and show one combined 'Noch zuzuordnen (N)' section grouped by file. If a job is still 'processing' when a new file is chosen, ask 'Vorherigen Import fortsetzen oder verwerfen?' and mark an abandoned job 'failed' on the server. After completion, offer 'Importierte Titel ansehen' (filter source=imdb) and a list of skipped titles with reasons.
- **Hinweis Prüfer:** Keep it smaller than the proposal. No modal and no server-side "failed" marking are needed, because re-import is idempotent.
1) Load the last ~10 jobs instead of limit(1): `select(...).order('created_at',{ascending:false}).limit(10)`. Show the newest job as the progress card. Below it, add one section "Noch zuzuordnen (N)" that flattens not_found from all done jobs. Tag each row with its job id and file_path, and use the key `${job.id}:${row.imdb_id}`. Pass row.jobId to resolveNotFound, which already takes jobId. Then merge the returned job back into the list.
2) For every older job still in status 'processing', show a short line: "datei.csv: 240 von 400 importiert [Fortsetzen] [Verwerfen]". Fortsetzen = process(job). Verwerfen = `supabase.from('import_jobs').delete().eq('id', id)`. The client already has delete permission (data_model.sql:392 grants select, delete), so no Edge Function change is needed. Optionally disable the file picker while a job is running in this tab (busy already does that).
3) Fix the instruction text at line 35 to "„Your ratings“ und/oder „Your watchlist“ (zwei Dateien, nacheinander)".
4) Skip reasons: do not build a per-title list. Add one caption under the stats: "Übersprungen = bereits aktuell, von dir gelöscht, oder keine Filme/Serien (z. B. Episoden)". If you want detail, store parsed.skipped in the job (index.ts:114) and show its count by reason.
5) "Importierte Titel ansehen": for now, a plain link to /watchlist after status 'done' is enough. A source=imdb filter only makes sense once Watchlist.jsx gets filters, which the planned features need anyway.
Related, outside this finding: if the user leaves the page while an import is running and comes back, busy is false and status is 'processing', so "Import fortsetzen" appears even though the loop from the old mount is still running. Clicking it starts a second concurrent loop on the same job, and advance() has no lock (index.ts:124-158). Guard this with a module-level "running job id" in lib/imdb.js.

## F18 – Not-found resolver: fixed search term, button disappears after one search, no way to skip a row, and it shares the card's lock and error slot

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** data-flow, interaction, resilience, structure
- **Dateien:** frontend/src/components/NotFoundResolver.jsx:9; frontend/src/components/NotFoundResolver.jsx:23-27; frontend/src/components/NotFoundResolver.jsx:31-32; frontend/src/pages/ImportExport.jsx:26; frontend/src/pages/ImportExport.jsx:53; frontend/src/pages/ImportExport.jsx:66; supabase/functions/imdb/index.ts:161-185
- **Problem:** 'Zuordnen' always searches row.title, which cannot be edited, and the row's year is shown but not used. After the first search the button disappears (results !== null, line 23), and only the top 5 results are shown (32), so a zero-hit or wrong-hit search cannot be retried or rephrased. Rows without a title have a permanently disabled button with no explanation (24). There is no way to dismiss a row. Every resolver uses the parent's run/busy, so one row's search disables all rows and the import button, and errors render in the card-level Messages (ImportExport.jsx:53), possibly far above the row. On the server, resolve() rewrites the whole not_found array from its own snapshot (index.ts:161-185), so concurrent resolves can overwrite each other.
- **Auswirkung:** An IMDb title whose English name finds nothing on TMDb (a remake, a foreign original) shows 'Keine Treffer' and stays in 'Nicht automatisch gefunden' forever: you cannot type the German or original title and cannot dismiss it. With 30 unmatched titles, a failed search shows its error off-screen at the top and the row just looks unchanged.
- **Vorschlag:** Give each resolver row its own query and mutation state with inline errors. Add an editable search field prefilled with 'title year' (use the year to rank), keep 'Erneut suchen' available, show up to 10 results with the year highlighted. Add 'Ignorieren', backed by a new `dismiss` action in the imdb function that removes the row from not_found. Run resolve/dismiss mutations in one scope per job, or make the server update atomic.
- **Hinweis Prüfer:** Keep it small and do not add per-row mutation scopes:
1) NotFoundResolver keeps its own `query` state, prefilled with `row.title` only. Do not prefill 'title year': TMDb's text search matches the year as text and usually returns worse results or none. It also keeps `results`, `searching` and `error` state. Render a small form that is always visible (input plus a 'Suchen' button) so the user can retype a German or original title, or retry, at any time. Run the search with a local try/catch, show the error inline in the row, and do not use the parent's `run`. Searches are read-only and need no shared lock.
2) Rank the results on the client before slicing: boost entries whose release year is within one year of `row.year`, and whose media_type fits `row.title_type` (tvseries/tvminiseries means tv). Then show about 8. TitleRow already shows the year.
3) Add an 'Ignorieren' button, backed by a `dismiss` action in supabase/functions/imdb/index.ts: loadJob, filter not_found by imdb_id, update. That is a copy of resolve() without applyRow, about 10 lines. Route resolve and dismiss through the parent's existing `run`/`busy` as now. That keeps them one at a time, so the server read-modify-write needs no atomic RPC for a single-user flow.
4) Optionally show the resolver's own error inline for a failed resolve too: pass a per-row error callback, or catch in the row and rethrow nothing. The card-level Messages at ImportExport.jsx:53 can then stay for import errors only.
Skip the "disabled button without title" item; the editable field makes it moot anyway.

## F19 – IMDb import throughput: one sequential request per 40 rows, each rewriting the whole job payload and doing per-row DB round trips

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** scale
- **Dateien:** frontend/src/lib/imdb.js:31-45; supabase/functions/imdb/index.ts:88-92; supabase/functions/imdb/index.ts:124-158; supabase/functions/_shared/importJob.ts:31; supabase/functions/_shared/importJob.ts:62-75
- **Problem:** runImport calls `continue` in a strict loop with BATCH_SIZE 40 (importJob.ts:31): 50 requests for 2,000 rows and up to 500 for the allowed 20,000. Each call does an auth.getUser round trip, loads the job including the full `items` jsonb (index.ts:90), and writes `items: job.items` back unchanged (151); the growing not_found array is also rewritten and returned every time. For each matched row, applyRow runs getExisting, isTombstoned and insert/update one after another, so each batch makes roughly 80-120 sequential DB round trips. The whole import depends on the tab staying open.
- **Auswirkung:** A 2,000-title import takes several minutes of strict request ping-pong, and a 20,000-row file far longer. Closing the tab or the phone locking the screen pauses it (see F04).
- **Vorschlag:** Per batch, fetch existing rows and tombstones with one query each (`.in('tmdb_id', ids)`) and write with one bulk upsert, then raise BATCH_SIZE to about 100-200. Keep parsed rows in a separate table or slice instead of rewriting `items` on every batch, and stop returning the full not_found array on each continue. Claim batches atomically (see F04).
- **Hinweis Prüfer:** Keep it small:

(1) index.ts:151: only touch `items` when the job is done. Replace the line with `...(done ? { items: [] } : {})` so unchanged batches no longer rewrite the jsonb.

(2) In processBatch, prefetch the batch's data with two queries:
- `watchlist.select('media_type,tmdb_id,status,my_rating,rated_at,imdb_id,runtime').eq('user_id',uid).in('tmdb_id',ids)`
- the same pattern on watchlist_tombstones

Key both results by `${media_type}:${tmdb_id}` in memory. Filter on media_type, because tmdb_id alone collides between movie and tv.

(3) Send all 'insert' decisions as ONE upsert array with `ignoreDuplicates: true`. Every insert row has the same columns, and the per-row triggers still fire.

(4) Keep 'update' decisions as individual `.update()` calls, run in parallel through the existing mapLimited.

(5) Do NOT merge inserts and updates into a single bulk upsert as the proposal says. Update rows carry different column sets, and with a mixed array supabase-js/PostgREST would fill the missing columns with null or defaults, which overwrites existing data.

(6) Handle two IMDb ids in the same batch that resolve to the same TMDb title. Today that works because rows are processed one after another. With a prefetch, dedupe by key and keep the newest rating.

(7) Update ImportDeps and its tests to match (e.g. getExistingMany, getTombstonesMany, insertMany).

(8) Raise BATCH_SIZE to about 100 and LOOKUP_CONCURRENCY to 8-10. TMDb's rate limit allows this, and it stays far below the Edge Function time limit.

Skip the separate table for parsed rows and the change to stop returning not_found; both are overkill. Atomic batch claiming belongs to F04.

## F20 – IMDb-CSV export looks up missing IMDb ids one by one inside a single request, with no feedback, and can time out

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** scale, resilience
- **Dateien:** supabase/functions/imdb/index.ts:197-204; frontend/src/lib/watchlist.js:13-22; frontend/src/pages/ImportExport.jsx:77-97
- **Problem:** addToWatchlist never stores imdb_id (the row at watchlist.js:14-22 has no such field), so every title added through search lacks one. exportCsv then loops over all of them sequentially: for each title it awaits a TMDb /external_ids call (with up to 4 attempts and backoff) and then a separate DB update (index.ts:197-204), with no concurrency and no cap. The frontend only disables the button; the label does not change and nothing shows progress.
- **Auswirkung:** With a few hundred titles added by search, 'IMDb-CSV herunterladen' appears to do nothing for a minute or more. Past roughly 300-600 such titles the request can exceed the Edge Function time limit and end in 'Server-Fehler (Status 5xx)'. Because the ids found so far were saved, clicking again eventually works, which looks random.
- **Vorschlag:** Store imdb_id when a title is added (extend the tmdb title/search call with append_to_response=external_ids, or backfill via a trigger/background job). In the export, look up missing ids with bounded concurrency (mapLimited already exists in importJob.ts), write them back with one bulk upsert, and limit work per call with a continue pattern if many are missing. Show 'Export wird vorbereitet …' on the button. If a lookup fails, export the titles that have ids and report the rest as missing instead of failing the request. Combine with the paged read from F02.
- **Hinweis Prüfer:** Keep it small. A continue/job pattern, a background job and a trigger are all overkill here.
1) In exportCsv (index.ts:198-204), export mapLimited from _shared/importJob.ts and run the missing-id lookups with a concurrency of about 6.
2) Wrap each lookup in its own try/catch. A title that fails stays without an id and is counted in 'missing' instead of failing the request. Keep the per-row `update().match(...)`, because it is safe and simple.
3) Do not switch to a bulk upsert of only imdb_id. If a row was deleted in the meantime, the insert path would create a ghost row with title '' (the title column defaults to '').
4) In ExportCard (ImportExport.jsx:93), show 'Export wird vorbereitet …' while busy, for example `{busy ? 'Export wird vorbereitet …' : 'IMDb-CSV herunterladen'}`. Better still, give each button its own busy state so only the clicked one changes its label.
5) Optional root-cause fix that goes well with the planned detail page: when the detail page loads a title from TMDb, add append_to_response=external_ids and save imdb_id onto the watchlist row at that point. This backfills ids over time at no extra cost. Do not add an extra TMDb call to addToWatchlist just for this.

## F21 – Keyboard and screen-reader use: selects save on every arrow key, focus is lost after each action, and results are never announced

- **Schwere:** low · **Geprüft:** bestätigt · **Bereiche:** interaction, structure
- **Dateien:** frontend/src/components/WatchlistActions.jsx:7-27; frontend/src/pages/Watchlist.jsx:57-77; frontend/src/pages/Watchlist.jsx:68; frontend/src/pages/Watchlist.jsx:93; frontend/src/components/Form.jsx:26-42; frontend/src/components/ImportProgress.jsx:13; frontend/src/lib/labels.js:11
- **Problem:** Status and rating are native selects that save in onChange. On Windows/Linux Chrome and Firefox, arrow keys on a focused closed select change the value and fire change immediately, so moving from 'Geplant' to 'Gesehen' first saves 'Am Schauen', and moving from 'Nicht bewertet' to 8 first saves 10 (the list starts at 10, labels.js:11), each also setting rated_at. Each save sets busy, which disables the focused select; under the HTML focus-fixup rule focus falls to <body>, so the next arrow press does nothing. 'Entfernen' unmounts the focused button, and '+' becomes permanently disabled after adding. No code calls .focus(). Search results, 'Keine Treffer', the 'N Titel' count and import completion have no aria-live region, and Messages mounts its role=status element together with its text, which many screen readers do not announce. Each row has 3 tab stops (about 3,000 for 1,000 titles) with no skip link or '/' shortcut.
- **Auswirkung:** Keyboard users write wrong intermediate statuses and ratings, get stuck halfway, and after every change are thrown back to the top of the document and must tab through the nav and search form again to reach row 237. Screen-reader users get no feedback that a search returned 12 results or none, that a title was added, or that the import finished.
- **Vorschlag:** Do not disable the active control during a save (optimistic updates, F01). Replace the selects with a rating control and a status segmented control/listbox that commits on Enter or click, or commit select changes on blur. After '+', keep focus on a 'Hinzugefügt ✓' button that is not disabled; after removal, focus the next row via refs. Render a persistent aria-live='polite' region for '12 Treffer' / 'Keine Treffer für „X“' and import completion, and make Messages always render its live container and only swap text. Add '/' to focus search, a 'Zur Liste springen' skip link and arrow-key navigation within the list.
- **Hinweis Prüfer:** Skip the custom segmented control or listbox, the arrow-key list navigation and the '/' shortcut; they are too much for this app. Do this instead:

1. Root cause, shared with F01: replace the page-wide busy with per-item pending state or optimistic updates. Never disable the control the user is operating. Focus then stays put and nothing else needs to change.
2. Coalesce rapid edits in the update handler: keep the native select but debounce writes per item by about 400 ms, holding the latest {status, my_rating}. Arrowing from Geplant to Gesehen then sends a single UPDATE. Revert and show an error if the save fails.
3. Defensive data fix: in watchlist_before_write, clear watched_at when status moves away from 'completed' and watched_at was set in the last minute. Or simply do not stamp watched_at on intermediate values by relying on step 2. The planned diary and statistics depend on this column.
4. Keep '+' focusable after adding: use aria-disabled with a no-op instead of disabled, and the label 'Hinzugefügt'. After Entfernen, focus the next row's status select, or the list heading if it was the last row. About 10 lines with a ref map.
5. Add one persistent visually-hidden <p aria-live="polite"> in Layout (or a small announce() context). Use it for '12 Treffer' / 'Keine Treffer für „X“', '„Dune“ hinzugefügt', 'Entfernt' and 'Import abgeschlossen: N neu'. Change Messages to always render its role=status container and only swap the text.
6. A skip link is optional and cheap. Leave out the rest.

## F22 – Session lifecycle is scattered: three sign-out paths, no central cleanup, auth-event churn, and no feedback on unexpected sign-out or account deletion

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** auth-routing, resilience
- **Dateien:** frontend/src/components/Layout.jsx:21; frontend/src/pages/ResetPassword.jsx:19-21; frontend/src/pages/Profile.jsx:159-163; frontend/src/auth/AuthContext.jsx:7-20; frontend/src/main.jsx:10-11
- **Problem:** There are three sign-out paths with three behaviours: Layout (global scope, no navigation, result ignored), ResetPassword (global scope, navigate to /login), and account deletion in Profile (scope 'local', relies on RequireAuth). None clears app state, and AuthContext sits outside the Router (main.jsx:10-11) and exposes no signOut or cleanup hook. A SIGNED_OUT that the user did not start (token revoked elsewhere, F10) leads to /login with no reason. Account deletion lands on a blank login form with no 'Konto gelöscht' confirmation. AuthContext builds a new state object on every auth event, including TOKEN_REFRESHED and repeated SIGNED_IN on tab focus, so the whole tree re-renders with a new `user` object; any future effect keyed on `user` instead of `user.id` would refetch.
- **Auswirkung:** You get dropped on the login page mid-task with no explanation. After deleting your account you cannot tell whether it worked. Once the Phase 3b cache exists, user B logging in on the same device after user A would see A's watchlist, friends and votes unless the cache is cleared, and today there is no place where that happens.
- **Vorschlag:** Move AuthProvider inside the router (or emit navigation via a callback) and expose signOut({ reason }) that clears the query cache and the app's own localStorage keys, aborts the import runner (F04), and navigates to /login with state { notice } and no `from`. Detect non-user-initiated SIGNED_OUT and show 'Deine Sitzung ist abgelaufen'. Show 'Konto gelöscht' after deletion. In onAuthStateChange, keep the previous user object when session.user.id is unchanged. Key every cache entry by user.id.

## F23 – Login return-to keeps only the pathname, is lost via Register/Forgot links, is ignored by PublicOnly, and leaks to the next user after sign-out

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** auth-routing, interaction
- **Dateien:** frontend/src/App.jsx:18; frontend/src/App.jsx:21-25; frontend/src/pages/Login.jsx:18; frontend/src/pages/Login.jsx:40-42
- **Problem:** RequireAuth stores `state={{ from: location.pathname }}` (App.jsx:18), dropping search and hash. The state disappears when the user goes from Login to /register or /forgot-password and back, because those links do not forward it (Login.jsx:41). PublicOnly always redirects to '/' (App.jsx:24) and ignores `from` when the session appears another way (e.g. login in another tab). After an explicit sign-out on /import, RequireAuth sets `from` to that page, and Login.jsx:18 sends whoever logs in next there.
- **Auswirkung:** Today: user A logs out on /import, user B logs in on the same device and lands on Import instead of the watchlist. Once filters, search and shared links live in the URL (`/?status=watching&q=dune`, a friend's shared list, a voting link, the PWA share target `?title=&url=`), a logged-out friend opening the link ends up on the bare path or '/' after login, and the shared content is lost.
- **Vorschlag:** Store `from: location.pathname + location.search + location.hash` and accept only same-app relative paths. Forward state on the Login → Register / Forgot links. Use `location.state?.from ?? '/'` in PublicOnly. Do not set `from` after an explicit sign-out (F22). Add a test for RequireAuth → Login → back to the deep link.

## F24 – Password recovery: the in-memory recovery flag traps the user until a reload, a successful reset gives no confirmation, and there is only one password field

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** auth-routing, interaction, resilience
- **Dateien:** frontend/src/auth/AuthContext.jsx:7; frontend/src/auth/AuthContext.jsx:16; frontend/src/App.jsx:17; frontend/src/components/Layout.jsx:14-26; frontend/src/pages/ResetPassword.jsx:16-23; frontend/src/pages/ResetPassword.jsx:26-36; frontend/src/pages/ResetPassword.jsx:43; frontend/src/pages/Profile.jsx:75-78
- **Problem:** `recovery` exists only in React state and is cleared only on SIGNED_OUT. While it is true, Layout shows the full nav (user is set), but every protected route redirects straight back to /reset-password (App.jsx:17), and the page has no cancel. A reload forgets the flag, so the recovery session becomes a normal login without the password ever being changed. On success, ResetPassword calls signOut() with global scope and navigates to /login with no message (19-21); if that signOut fails after updateUser succeeded, recovery stays true and the user is bounced back to the form although the password was already changed. Register asks for the password twice, but ResetPassword (43) and 'Passwort ändern' (Profile.jsx:75-78) have one field and no show toggle. Visiting /reset-password while logged out (e.g. via Back) shows 'Link abgelaufen' though nothing expired (26-36). If Supabase falls back to the Site URL, INITIAL_SESSION arrives before PASSWORD_RECOVERY, so the watchlist can render and start loading before the redirect.
- **Auswirkung:** If you remember your password halfway through, clicking Watchlist, Import, Profil or the wordmark does nothing visible until you reload, after which you are fully logged in. After saving a new password you land on an empty login form, unsure whether it worked, and all your other devices are logged out. A typo in the single field locks you out until another reset mail, which Supabase rate-limits.
- **Vorschlag:** Keep the recovery marker in sessionStorage (in try/catch) so it survives a reload, or treat a recovery session as a normal login and drop the gate. Hide the main nav during recovery and add 'Abbrechen' (local sign-out). After updateUser succeeds, stay signed in, clear the flag and navigate to '/' with a 'Passwort geändert' toast; make signing out other devices an explicit checkbox. Add a repeat field or show-password toggle to the reset and change-password forms. Show 'Link abgelaufen' only when the URL actually carried an auth error (F11).

## F25 – Friends invited through the Supabase dashboard never set a password

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** auth-routing
- **Dateien:** docs/SETUP.md:61; supabase/migrations/20261012000000_init.sql:81-83; frontend/src/auth/AuthContext.jsx:16; frontend/src/lib/supabase.js:12
- **Problem:** SETUP.md:61 recommends 'Authentication → Users → Invite user' as the way to invite without mail setup, and the sign-up trigger accepts these users without a code (`invited_at is not null`, init.sql:81). The invite link redirects to the Site URL with `#access_token…&type=invite`. auth-js treats this as SIGNED_IN and AuthContext only special-cases PASSWORD_RECOVERY (16), so the user goes straight into the app. Nothing asks for or mentions setting a password.
- **Auswirkung:** The invited friend uses the app in the browser where they opened the mail. On their phone, another browser, or after that session ends, login fails with 'E-Mail oder Passwort ist falsch.' They never had a password, and nothing points them to 'Passwort vergessen'.
- **Vorschlag:** Detect `type=invite` in the URL hash at startup (same place as the auth-error parsing in F11) and route these users to a 'Passwort festlegen' screen that reuses the reset form before showing the watchlist. Alternatively, remove the dashboard-invite path from SETUP.md and rely on invite codes only.

## F26 – Profile page: one load error replaces the whole page, Invites shows a false empty state, and create/revoke/validation logic is fragile

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** resilience, data-flow, structure
- **Dateien:** frontend/src/pages/Profile.jsx:21; frontend/src/pages/Profile.jsx:36; frontend/src/pages/Profile.jsx:87-107; frontend/src/pages/Profile.jsx:127-128; frontend/src/pages/Profile.jsx:143; frontend/src/pages/Profile.jsx:191-195; supabase/migrations/20261012000000_init.sql:10-11
- **Problem:** If the profile query fails, `if (error) return <Messages error={error} />` (194) renders one bare error line in place of all cards, with no heading and no retry; password change and data export, which do not need the profile row, become unreachable. Invites starts as `[]` (88), so 'Noch keine Einladungen…' (127-128) shows while loading and next to a load error. create inserts and then reloads (99-100); if the reload fails, the code exists but the user sees only an error and may create a duplicate. 'Widerrufen' deletes immediately with no confirmation (143). The display name is trimmed before saving (21) while the input only has `required` (36), so '   ' passes the browser check, violates `char_length between 1 and 50` (init.sql:10-11) and returns a generic 'Ungültige Eingabe.'. A taken username returns the generic 'Dieser Wert ist bereits vergeben.' not attached to the field.
- **Auswirkung:** A network blip on /profile leaves one red line and no way to retry except reloading. As admin, Mario may believe he has no invites, create duplicates, or revoke a code a friend is about to use with one misclick.
- **Vorschlag:** Give each section its own load/error/retry, and render ChangePassword and DataSection even without the profile row. Initialise invites as null and show skeleton, error or empty state accordingly. Insert with `.insert(...).select().single()` and append the row instead of reloading. Confirm revoke (or offer undo). Validate trimmed display name and username pattern before submitting and show per-field messages (aria-invalid/aria-describedby, see F30); map 23505 on username to 'Dieser Benutzername ist bereits vergeben' on that field.

## F27 – Data access is inconsistent: pages and the layout query Supabase directly, and helpers live in the wrong modules

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** structure
- **Dateien:** frontend/src/pages/Profile.jsx:18-25; frontend/src/pages/Profile.jsx:67; frontend/src/pages/Profile.jsx:91-92; frontend/src/pages/Profile.jsx:99; frontend/src/pages/Profile.jsx:105; frontend/src/pages/Profile.jsx:161-162; frontend/src/pages/Profile.jsx:192; frontend/src/pages/Login.jsx:17; frontend/src/pages/Register.jsx:20-29; frontend/src/pages/ForgotPassword.jsx:14; frontend/src/pages/ResetPassword.jsx:19-20; frontend/src/components/Layout.jsx:21; frontend/src/lib/imdb.js:65-68; frontend/src/lib/watchlist.js:9-11; frontend/src/components/NotFoundResolver.jsx:3
- **Problem:** lib/watchlist.js says it 'keeps the page component free of queries', but Profile.jsx contains seven inline Supabase queries and RPCs (profiles, invites, delete_my_account). All four auth pages and Layout call supabase.auth directly (Layout's signOut without error handling). exportJson (whole-account RPC) lives in lib/imdb.js, so Profile imports from 'imdb'; TMDb search lives in lib/watchlist.js and is imported by the IMDb resolver. Email normalisation `.trim().toLowerCase()` is copied in Login, Register and ForgotPassword. The password minimum of 10 is hard-coded in Register:64, Profile:77, ResetPassword:43 and errors.js:6.
- **Auswirkung:** Nothing visible today, but every upcoming feature (friends, shared lists, feed, notifications) has no clear home and will copy the inline-query pattern. Pages cannot be tested without mocking the Supabase singleton, and a rule change (password length, email handling) needs edits in several places and is easy to get half-right.
- **Vorschlag:** Create one module per domain under lib/api/: auth.js (signIn, signUp, resetPassword, updatePassword, signOut, normalizeEmail, PASSWORD_MIN_LENGTH), profile.js, invites.js, account.js (exportJson, deleteAccount), tmdb.js (searchTitles, later getTitle and providers), watchlist.js, imports.js. Pages import only from lib/api and query hooks, never from lib/supabase. Optionally have modules take the client as a parameter (createWatchlistApi(client)) for easy test doubles.

## F28 – Frontend logic is practically untested, and the toolchain cannot test components or catch hook bugs

- **Schwere:** medium · **Geprüft:** noch nicht geprüft · **Bereiche:** structure
- **Dateien:** frontend/test/errors.test.js:1-41; frontend/vite.config.js:8; frontend/package.json:21-25; frontend/src/lib/imdb.js:31-45; frontend/src/auth/AuthContext.jsx:12-18; frontend/src/lib/watchlist.js:14-22; frontend/src/pages/Watchlist.jsx:16-18; frontend/src/pages/ImportExport.jsx:13-15; frontend/src/pages/Profile.jsx:93-95
- **Problem:** The only frontend test file covers errors.js. Vitest runs in the 'node' environment with no jsdom or @testing-library, so no component or hook can be tested. There is no ESLint, so mount effects with missing deps (`[]` while using run/load) go unnoticed. Testable logic is buried or hard-wired: runImport's retry/backoff calls the imported invokeFunction and real setTimeout; the recovery transition is an inline setState lambda in AuthContext; the TMDb-result-to-row mapping and vote rounding sit inside addToWatchlist; list add/replace/remove are inline closures in the page.
- **Auswirkung:** Regressions like the null-list crash (F05), the partial-row bug (F12) or the import double loop (F04) ship unnoticed, and the Phase 3b rewrite of the frontend logic would happen without a safety net. Mario can only check behaviour by clicking through the deployed app.
- **Vorschlag:** Add jsdom, @testing-library/react, @testing-library/user-event, and eslint with eslint-plugin-react-hooks, all run in CI next to npm test. Extract and test pure functions: authReducer(state, event), toWatchlistRow(result), watchlistReducer / applyChange (add/replace/remove/optimistic rollback, F13), runImport(job, onProgress, { invoke, sleep }), importLabel(job, running). Add a few RTL tests for the Watchlist page with a mocked lib/api: load error then retry, status change stays optimistic, remove then undo.

## F29 – No toast/feedback system although DESIGN.md defines one: action results have nowhere to go

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** structure
- **Dateien:** frontend/src/components/Form.jsx:26-42; frontend/src/pages/Watchlist.jsx:27-37; frontend/src/pages/Watchlist.jsx:79; frontend/src/pages/Profile.jsx:27; frontend/src/pages/Profile.jsx:111; frontend/src/pages/ResetPassword.jsx:19-21; frontend/src/pages/Profile.jsx:159-163
- **Problem:** DESIGN.md (line 179) specifies toasts: bottom-right, auto-dismiss after 5 s, errors stay until dismissed, one optional action. The code has only the inline Messages component. Successful add, status change and remove give no message. Info texts like 'Gespeichert.' and 'Einladungslink kopiert.' stay on screen until the next submit, even while the user keeps editing. Redirect flows (password reset, account deletion) have no way to carry a confirmation. Undo (F03), rollback errors (F01) and 'Als gesehen markiert' (F13) all need this channel.
- **Auswirkung:** After '+', the only sign is a small check icon while the new title appears far below. 'Gespeichert.' keeps showing after further profile edits, suggesting unsaved edits were saved. After resetting the password you cannot tell whether it worked.
- **Vorschlag:** Add a ToastProvider plus useToast() (portal with one aria-live='polite' region and one assertive region for errors, durations per DESIGN.md, optional action used for 'Rückgängig' and 'Erneut versuchen'). Use toasts for row actions (add, update, remove, copy link) and for redirect confirmations via navigate state { toast }. Keep inline Messages for form validation and submit errors, and clear inline info when the form changes. Build this first, since F01, F03 and F13 depend on it.

## F30 – DESIGN.md compliance gaps: buttons show no loading label, form errors are not tied to fields, and the import card emphasises the wrong action

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** structure
- **Dateien:** frontend/src/pages/Watchlist.jsx:53-55; frontend/src/pages/Profile.jsx:53-55; frontend/src/pages/Profile.jsx:81; frontend/src/pages/Profile.jsx:122-124; frontend/src/pages/ForgotPassword.jsx:28-30; frontend/src/pages/ResetPassword.jsx:46-48; frontend/src/pages/ImportExport.jsx:44-58; frontend/src/pages/ImportExport.jsx:92-97; frontend/src/pages/Register.jsx:16; frontend/src/styles/components.css:162
- **Problem:** DESIGN.md §4 says loading buttons keep their width and swap the label for spinner + short text; only Login and Register do this. Search, profile save, password change, create code, send link, save password and both export buttons just drop to 50% opacity. §10 requires form errors via aria-invalid and aria-describedby; the CSS supports `input[aria-invalid='true']` (components.css:162), but no JSX sets it, and the Register password mismatch (16) and the 23505 username error appear only as a generic notice. In ImportCard, when a job is interrupted, the accent primary is still 'Datei importieren' while 'Import fortsetzen', the action actually needed, is a secondary button below the stats.
- **Auswirkung:** On slow connections it is unclear whether 'Änderungen speichern' or 'IMDb-CSV herunterladen' is working, so users click again or leave. Screen-reader users do not hear which field is wrong. With an interrupted import, the visual emphasis invites starting a new import instead of resuming.
- **Vorschlag:** Create a <SubmitButton busy busyLabel> / <AsyncButton> primitive that keeps its width, shows a small spinner plus text and sets aria-busy, and use it everywhere. Create a <Field error help> component that wires aria-invalid and aria-describedby and maps known error codes (23505 on username, password mismatch) to the right field. In ImportCard, make 'Import fortsetzen' the btn-primary whenever a job is 'processing' and no runner is active (F04), and demote 'Datei importieren' to secondary.

## F31 – loadWatchlist and the mutations select every column, about twice what the list renders

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** scale
- **Dateien:** frontend/src/lib/watchlist.js:6; frontend/src/lib/watchlist.js:27; frontend/src/lib/watchlist.js:35; frontend/src/components/TitleRow.jsx:6-28; supabase/migrations/20261012000000_init.sql:30-42; supabase/migrations/20261012130000_data_model.sql:9-15
- **Problem:** `select()` with no arguments sends select=*, including user_id, source, imdb_id, rated_at, watched_at, runtime, updated_at and added_at. TitleRow and WatchlistActions only read media_type, tmdb_id, title, original_title, poster_path, release_date, vote_average, status and my_rating. The upsert and update paths also return *. As planned columns (series progress, providers) are added, the payload keeps growing.
- **Auswirkung:** Each list load, which today repeats on every visit (F06), transfers roughly twice the JSON it needs, which matters most on mobile data.
- **Vorschlag:** Define one LIST_COLUMNS constant ('media_type,tmdb_id,title,original_title,poster_path,release_date,vote_average,status,my_rating,added_at') and use it for the list load, .upsert().select(LIST_COLUMNS) and .update().select(LIST_COLUMNS). Fetch the full row only on the planned detail page.

## F32 – Every route ships in one eager bundle and fonts are not preloaded; small today, but planned features will make the login page heavy

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** scale, auth-routing
- **Dateien:** frontend/src/App.jsx:5-11; frontend/vite.config.js:5-9; frontend/src/styles/index.css:1-5; frontend/index.html:4-6
- **Problem:** App.jsx statically imports all 7 pages, so the build is a single ~300 KB (~92 KB gzip) entry chunk; react-dom is about 127 KB and supabase-js about 75 KB, including realtime/storage clients the app does not use, and the app's own code only about 20 KB. Lazy routes save little today, but the planned detail page (trailer embed, provider logos), statistics charts, calendar, music and PWA code would all load on the login and invite pages. index.css pulls in the full @fontsource CSS (29 @font-face rules); the 5 latin woff2 files actually used (~110 KB) are discovered only after React renders text and are never preloaded, so with font-display: swap the text visibly reflows on every cold load.
- **Auswirkung:** Today: a font-swap flicker on first load. As features land without route splitting, a friend opening the invite or reset link on mobile data waits longer for every page's code before seeing the form.
- **Vorschlag:** Lazy-load authenticated pages (`lazy: () => import(...)` in createBrowserRouter, or React.lazy + <Suspense fallback={<CardSkeleton/>}> inside Layout); keep Login/Register in one small auth chunk and prefetch the Watchlist chunk after login. Split vendor code via build.rollupOptions.output.manualChunks (react, supabase) so it stays cached across deploys. Import only latin font subsets and preload IBM Plex Sans 400 and Source Serif 4 600. Pair with the chunk-load-error reload from F05, since GitHub Pages replaces hashed assets on every deploy.

## F33 – Invite management is minimal: no note for whom a code is, no share sheet, no visible expired/used state

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** interaction
- **Dateien:** frontend/src/pages/Profile.jsx:96-112; frontend/src/pages/Profile.jsx:117-125; frontend/src/pages/Profile.jsx:131-147; supabase/migrations/20261012000000_init.sql:26-27; supabase/migrations/20261012000000_init.sql:169
- **Problem:** The invites table has `note` and `used_by` columns and clients may insert `note` (init.sql:169), but the form only asks for max uses and the list shows neither note nor used_by. After 'Code erstellen' the admin still has to find the new code and press 'Link kopieren' (navigator.clipboard only, no navigator.share). Expired and used-up codes look like active ones apart from the date and counter text. An empty 'Max. Nutzungen' field sends 0 and fails with the generic 'Ungültige Eingabe.'
- **Auswirkung:** Mario cannot tell which code went to which friend or who has signed up, and sending an invite from the phone takes extra steps instead of opening the share sheet.
- **Vorschlag:** Add an optional 'Für wen?' note field and show note and used_by per code. After creating a code, call navigator.share({ url }) directly, falling back to copy plus a toast. Label codes 'Abgelaufen' / 'Aufgebraucht' and sort active ones first. Clamp and validate max uses on the client.

## F34 – Unknown URLs silently redirect to the watchlist, with no not-found state

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** auth-routing
- **Dateien:** frontend/src/App.jsx:38; .github/workflows/deploy.yml:56
- **Problem:** `<Route path="*" element={<Navigate to="/" replace />}>` (App.jsx:38) turns every unknown path into '/', with replace, so even Back cannot show what was wrong. For logged-out users the original path is lost entirely (* → / → /login with from '/'). Deep links rely on the `cp dist/index.html dist/404.html` fallback (deploy.yml:56), which works in browsers, but GitHub Pages serves every deep link (including register?invite=… and the reset link) with HTTP status 404, which matters for link previews and the planned PWA/share target.
- **Auswirkung:** A mistyped or outdated link (e.g. `/title/movie/abc` once detail pages exist, or an old shared-list URL) silently shows your own watchlist, so you assume the app is broken or the friend sent the wrong link.
- **Vorschlag:** Replace the catch-all with a NotFound page inside Layout ('Seite nicht gefunden' plus links to Watchlist and Suche), without redirecting. Give parameterized routes like /title/:type/:id their own not-found/invalid-param state (loaders throw a 404 Response into errorElement). For the PWA, have the service worker serve the app shell for navigations and keep start_url and the share_target action under the base path.

## F35 – Document title and focus never change on navigation

- **Schwere:** low · **Geprüft:** noch nicht geprüft · **Bereiche:** auth-routing
- **Dateien:** frontend/index.html:6; frontend/src/components/Layout.jsx:28-30
- **Problem:** The title is fixed at 'Watchlist' (index.html:6) and no code sets document.title. On a route change, focus stays on the clicked nav link and nothing is announced.
- **Auswirkung:** Browser history, tab titles and the Back long-press menu all read 'Watchlist', so once detail pages exist you cannot tell entries apart, and shares and bookmarks of detail pages are all called 'Watchlist'. Screen-reader users get no cue that the page changed.
- **Vorschlag:** Add a useDocumentTitle('Dune – Watchlist') hook, or use route handle.title with the data router. After navigation (not on first load), move focus to the page <h1> or <main> with tabIndex=-1.

