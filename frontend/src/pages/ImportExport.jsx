import { useEffect, useState } from 'react';
import { Messages, useSubmit } from '../components/Form.jsx';
import ImportProgress from '../components/ImportProgress.jsx';
import NotFoundResolver from '../components/NotFoundResolver.jsx';
import { exportImdbCsv, exportJson, latestImportJob, resolveNotFound, runImport, startImport } from '../lib/imdb.js';

function ImportPanel() {
  const [job, setJob] = useState(null);
  const [file, setFile] = useState(null);
  const { busy, error, run } = useSubmit();

  useEffect(() => {
    run(async () => setJob(await latestImportJob()));
  }, []);

  const process = (started) =>
    run(async () => {
      setJob(started);
      setJob(await runImport(started, setJob));
    });
  const onSubmit = (e) => {
    e.preventDefault();
    if (file) run(async () => process(await startImport(file)));
  };
  const resolve = (row, match) => run(async () => setJob(await resolveNotFound(job.id, row.imdb_id, match)));

  return (
    <section className="panel reveal">
      <p className="eyebrow">IMDb → Watchlist</p>
      <h1>Importieren</h1>
      <ol className="steps">
        <li>
          Auf <a href="https://www.imdb.com" target="_blank" rel="noreferrer">imdb.com</a> anmelden und „Your ratings“ oder „Your watchlist“ öffnen.
        </li>
        <li>Oben rechts auf die drei Punkte bzw. „Export“ klicken. IMDb erstellt die Datei unter „Your exports“ – dort die CSV herunterladen.</li>
        <li>Die CSV hier auswählen. Bewertete Titel kommen als „Gesehen“ mit deiner Bewertung, Watchlist-Titel als „Geplant“.</li>
      </ol>
      <form className="row search-form" onSubmit={onSubmit}>
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="IMDb-CSV-Datei" />
        <button disabled={busy || !file}>Importieren</button>
      </form>
      <p className="muted">Mehrfach importieren ist sicher: Nichts wird doppelt angelegt, gelöschte Titel kommen nicht zurück, Bewertungen werden nur durch neuere ersetzt.</p>
      <Messages error={error} />
      {job && <ImportProgress job={job} />}
      {job?.status === 'processing' && !busy && (
        <button className="link" onClick={() => process(job)}>
          Abgebrochenen Import fortsetzen
        </button>
      )}
      {job?.not_found?.length > 0 && job.status === 'done' && (
        <>
          <h3>Nicht automatisch gefunden</h3>
          <p className="muted">Ordne diese Titel von Hand zu – sie werden dann mit deiner Bewertung übernommen.</p>
          <ul className="plain">
            {job.not_found.map((row) => (
              <NotFoundResolver key={row.imdb_id} row={row} busy={busy} run={run} onResolve={(match) => resolve(row, match)} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ExportPanel() {
  const { busy, error, info, run } = useSubmit();
  const imdb = () =>
    run(async ({ setInfo }) => {
      const res = await exportImdbCsv();
      setInfo(
        res.missing
          ? `${res.exported} Titel exportiert, ${res.missing} ohne IMDb-ID ausgelassen.`
          : `${res.exported} Titel exportiert.`,
      );
    });
  return (
    <section className="panel reveal">
      <p className="eyebrow">Watchlist → Datei</p>
      <h2>Exportieren</h2>
      <p className="muted">
        Die IMDb-CSV (Spalten <code>Const</code>, <code>Your Rating</code>, <code>Date Rated</code>) funktioniert mit gängigen Import-Tools,
        z. B. für Letterboxd oder Trakt. JSON enthält alle deine Daten.
      </p>
      <div className="row">
        <button disabled={busy} onClick={imdb}>
          IMDb-CSV herunterladen
        </button>
        <button className="link" disabled={busy} onClick={() => run(exportJson)}>
          Alles als JSON
        </button>
      </div>
      <Messages error={error} info={info} />
    </section>
  );
}

export default function ImportExportPage() {
  return (
    <>
      <ImportPanel />
      <ExportPanel />
    </>
  );
}
