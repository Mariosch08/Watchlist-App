import { useEffect, useState } from 'react';
import { Messages, useSubmit } from '../components/Form.jsx';
import ImportProgress from '../components/ImportProgress.jsx';
import NotFoundResolver from '../components/NotFoundResolver.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { exportImdbCsv, exportJson, latestImportJob, resolveNotFound, runImport, startImport } from '../lib/imdb.js';

function ImportCard() {
  const [job, setJob] = useState(undefined);
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

  if (job === undefined && !error) return <CardSkeleton />;

  return (
    <section className="card" aria-labelledby="import-title">
      <h1 id="import-title">IMDb importieren</h1>
      <ol className="steps">
        <li>
          Auf <a href="https://www.imdb.com" target="_blank" rel="noreferrer">imdb.com</a> anmelden und „Your ratings“ oder „Your watchlist“ öffnen.
        </li>
        <li>Auf „Export“ klicken. Die Datei erscheint unter „Your exports“ und lässt sich dort herunterladen.</li>
        <li>CSV hier auswählen. Bewertete Titel werden als „Gesehen“ übernommen, Watchlist-Titel als „Geplant“.</li>
      </ol>
      <form className="inline-form" onSubmit={onSubmit}>
        <label>
          IMDb-CSV-Datei
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="btn-primary" disabled={busy || !file}>
          {busy && job?.status === 'processing' ? 'Importiert …' : 'Datei importieren'}
        </button>
      </form>
      <p className="caption">
        Mehrfaches Importieren ist sicher: Es entstehen keine Duplikate, gelöschte Titel kommen nicht zurück und Bewertungen werden nur durch
        neuere ersetzt.
      </p>
      <Messages error={error} />
      {job && <ImportProgress job={job} />}
      {job?.status === 'processing' && !busy && (
        <div className="actions">
          <button onClick={() => process(job)}>Import fortsetzen</button>
        </div>
      )}
      {job?.status === 'done' && job.not_found?.length > 0 && (
        <div className="stack">
          <h3>Nicht automatisch gefunden</h3>
          <p className="muted">Ordne diese Titel von Hand zu. Deine Bewertung wird dabei übernommen.</p>
          <ul className="list">
            {job.not_found.map((row) => (
              <NotFoundResolver key={row.imdb_id} row={row} busy={busy} run={run} onResolve={(match) => resolve(row, match)} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ExportCard() {
  const { busy, error, info, run } = useSubmit();
  const imdb = () =>
    run(async ({ setInfo }) => {
      const res = await exportImdbCsv();
      setInfo(
        res.missing ? `${res.exported} Titel exportiert, ${res.missing} ohne IMDb-ID ausgelassen.` : `${res.exported} Titel exportiert.`,
      );
    });
  return (
    <section className="card" aria-labelledby="export-title">
      <h2 id="export-title">Exportieren</h2>
      <p className="muted">
        Die IMDb-CSV enthält die Spalten <code>Const</code>, <code>Your Rating</code> und <code>Date Rated</code> und funktioniert mit gängigen
        Import-Tools wie Letterboxd oder Trakt. Die JSON-Datei enthält alle deine Daten.
      </p>
      <div className="actions">
        <button className="btn-primary" disabled={busy} onClick={imdb}>
          IMDb-CSV herunterladen
        </button>
        <button disabled={busy} onClick={() => run(exportJson)}>
          JSON herunterladen
        </button>
      </div>
      <Messages error={error} info={info} />
    </section>
  );
}

export default function ImportExportPage() {
  return (
    <>
      <ImportCard />
      <ExportCard />
    </>
  );
}
