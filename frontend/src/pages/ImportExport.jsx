import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import ImportProgress from '../components/ImportProgress.jsx';
import NotFoundResolver from '../components/NotFoundResolver.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useImportRunner } from '../hooks/useImportRunner.js';
import { exportJson } from '../lib/api/account.js';
import { continueImport, dismissNotFound, exportImdbCsv, fetchRecentJobs, resolveNotFound, startImport } from '../lib/api/imports.js';
import { errorMessage } from '../lib/errors.js';
import { ensureImportRunning, updateImportJob } from '../lib/importRunner.js';
import { queryKeys } from '../lib/queryClient.js';

function useImportJobs() {
  const user = useUser();
  const queryClient = useQueryClient();
  const key = queryKeys.importJobs(user.id);
  const jobs = useQuery({ queryKey: key, queryFn: () => fetchRecentJobs(10) });
  const replaceJob = (job) => {
    queryClient.setQueryData(key, (list) => [job, ...(list ?? []).filter((j) => j.id !== job.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    updateImportJob(job);
  };
  const run = (job) =>
    ensureImportRunning(job, {
      continueImport,
      onBatch: replaceJob,
    }).then((final) => {
      replaceJob(final);
      if (final.status === 'done') queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(user.id) });
      return final;
    });
  return { jobs, replaceJob, run };
}

function ImportCard() {
  const toast = useToast();
  const { jobs, replaceJob, run } = useImportJobs();
  const runner = useImportRunner();
  const [file, setFile] = useState(null);
  const latest = jobs.data?.[0];
  // Show the live job while it runs, otherwise the newest stored job.
  const current = runner.job && runner.job.id === latest?.id ? runner.job : latest;
  const running = runner.running && runner.job?.id === current?.id;

  // Resume an interrupted import automatically when the page is opened again.
  useEffect(() => {
    if (latest?.status === 'processing' && !runner.running) run(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, latest?.status]);

  const start = useMutation({
    mutationFn: () => startImport(file),
    onSuccess: (job) => {
      replaceJob(job);
      setFile(null);
      run(job).then((final) => final.status === 'done' && toast.success(`Import abgeschlossen: ${final.imported} neu, ${final.updated} aktualisiert.`));
    },
  });

  if (jobs.isPending) return <CardSkeleton />;
  const busy = start.isPending || running;

  return (
    <section className="card" aria-labelledby="import-title">
      <h1 id="import-title" tabIndex={-1}>
        IMDb importieren
      </h1>
      <ol className="steps">
        <li>
          Auf <a href="https://www.imdb.com" target="_blank" rel="noreferrer">imdb.com</a> anmelden und „Your ratings“ oder „Your watchlist“ öffnen.
        </li>
        <li>Auf „Export“ klicken. Die Datei erscheint unter „Your exports“ und lässt sich dort herunterladen.</li>
        <li>CSV hier auswählen. Bewertete Titel werden als „Gesehen“ übernommen, Watchlist-Titel als „Geplant“.</li>
      </ol>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (file) start.mutate();
        }}
      >
        <label>
          IMDb-CSV-Datei
          <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
        </label>
        <button className="btn-primary" disabled={busy || !file}>
          {start.isPending ? 'Wird hochgeladen …' : running ? 'Import läuft …' : 'Datei importieren'}
        </button>
      </form>
      <p className="caption">
        Mehrfaches Importieren ist sicher: Es entstehen keine Duplikate, gelöschte Titel kommen nicht zurück und Bewertungen werden nur durch neuere ersetzt. Du
        kannst die Seite während des Imports verlassen.
      </p>
      <Messages error={start.error ? errorMessage(start.error) : jobs.isError ? errorMessage(jobs.error) : runner.error && running === false ? errorMessage(runner.error) : ''} />
      {current && <ImportProgress job={current} running={running} retrying={runner.retrying} />}
      {current?.status === 'processing' && !running && (
        <div className="actions">
          <button onClick={() => run(current)}>Import fortsetzen</button>
        </div>
      )}
      {current?.status === 'done' && current.imported + current.updated > 0 && (
        <p className="links">
          <Link to="/?s=all">Importierte Titel in der Watchlist ansehen</Link>
        </p>
      )}
    </section>
  );
}

function UnresolvedCard() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const user = useUser();
  const { jobs, replaceJob } = useImportJobs();
  const [pending, setPending] = useState(null);
  const rows = (jobs.data ?? [])
    .filter((j) => j.status === 'done')
    .flatMap((j) => (j.not_found ?? []).map((r) => ({ ...r, jobId: j.id, file: j.file_path })));
  if (rows.length === 0) return null;

  const act = async (row, fn, success) => {
    setPending(`${row.jobId}:${row.imdb_id}`);
    try {
      replaceJob(await fn());
      toast.success(success);
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(user.id) });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="card" aria-labelledby="unresolved-title">
      <div className="card-head">
        <h2 id="unresolved-title">Noch zuzuordnen</h2>
        <span className="caption">{rows.length} Titel</span>
      </div>
      <p className="muted">Diese Titel wurden nicht automatisch gefunden. Ordne sie zu, deine Bewertung wird dabei übernommen.</p>
      <ul className="list">
        {rows.map((row) => (
          <NotFoundResolver
            key={`${row.jobId}:${row.imdb_id}`}
            row={row}
            pending={pending === `${row.jobId}:${row.imdb_id}`}
            onResolve={(match) => act(row, () => resolveNotFound(row.jobId, row.imdb_id, match), `„${match.title}“ übernommen.`)}
            onDismiss={() => act(row, () => dismissNotFound(row.jobId, row.imdb_id), `„${row.title}“ ignoriert.`)}
          />
        ))}
      </ul>
    </section>
  );
}

function ExportCard() {
  const imdb = useSubmit();
  const json = useSubmit();
  const toast = useToast();
  return (
    <section className="card" aria-labelledby="export-title">
      <h2 id="export-title">Exportieren</h2>
      <p className="muted">
        Die IMDb-CSV enthält die Spalten <code>Const</code>, <code>Your Rating</code> und <code>Date Rated</code> und funktioniert mit gängigen Import-Tools wie
        Letterboxd oder Trakt. Die JSON-Datei enthält alle deine Daten.
      </p>
      <div className="actions">
        <button
          className="btn-primary"
          disabled={imdb.busy}
          onClick={() =>
            imdb.run(async () => {
              const res = await exportImdbCsv();
              toast.success(res.missing ? `${res.exported} Titel exportiert, ${res.missing} ohne IMDb-ID ausgelassen.` : `${res.exported} Titel exportiert.`);
            })
          }
        >
          {imdb.busy ? 'Export wird vorbereitet …' : 'IMDb-CSV herunterladen'}
        </button>
        <button disabled={json.busy} onClick={() => json.run(exportJson)}>
          {json.busy ? 'Wird vorbereitet …' : 'JSON herunterladen'}
        </button>
      </div>
      <Messages error={imdb.error || json.error} />
    </section>
  );
}

export default function ImportExportPage() {
  useDocumentTitle('Import & Export');
  return (
    <>
      <ImportCard />
      <UnresolvedCard />
      <ExportCard />
    </>
  );
}
