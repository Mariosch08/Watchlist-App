// Progress bar and result counters of an import job.
export default function ImportProgress({ job }) {
  const percent = job.total ? Math.round((job.processed / job.total) * 100) : 100;
  const stats = [
    ['Neu', job.imported],
    ['Aktualisiert', job.updated],
    ['Übersprungen', job.skipped],
    ['Nicht gefunden', job.not_found?.length ?? 0],
  ];
  return (
    <div className="import-progress">
      <div className="meta">
        <span>{job.status === 'done' ? 'Fertig' : 'Import läuft'}</span>
        <span>
          {job.processed} / {job.total}
        </span>
        {job.file_path && <span className="meta-original">{job.file_path}</span>}
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className="progress-fill" style={{ '--progress': `${percent}%` }} />
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
