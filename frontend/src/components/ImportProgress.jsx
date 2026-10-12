// Progress bar and result counters of an import job.
export default function ImportProgress({ job }) {
  const fraction = job.total ? job.processed / job.total : 1;
  const stats = [
    ['Neu', job.imported],
    ['Aktualisiert', job.updated],
    ['Übersprungen', job.skipped],
    ['Nicht gefunden', job.not_found?.length ?? 0],
  ];
  return (
    <div className="stack">
      <div className="meta">
        <span>{job.status === 'done' ? 'Abgeschlossen' : 'Import läuft'}</span>
        <span>
          {job.processed} von {job.total}
        </span>
        {job.file_path && <span className="mono">{job.file_path}</span>}
      </div>
      <div
        className="progress"
        role="progressbar"
        aria-label="Importfortschritt"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div className="progress-fill" style={{ '--progress': fraction }} />
      </div>
      <dl className="stats">
        {stats.map(([label, value]) => (
          <div key={label} className="stat">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
