import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { deleteDiaryEntry, diaryKeys, fetchDiary } from '../lib/api/diary.js';
import { describeEntry, diaryStats, groupByMonth } from '../lib/diary.js';
import { errorMessage } from '../lib/errors.js';
import { detailPath, POSTER_BASE } from '../lib/labels.js';

const MONTHS_SHOWN = 6;

export default function DiaryPage() {
  useDocumentTitle('Tagebuch');
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const diary = useQuery({ queryKey: diaryKeys.all(user.id), queryFn: fetchDiary });
  const [months, setMonths] = useState(MONTHS_SHOWN);
  const [confirm, setConfirm] = useState(null);
  const year = new Date().getFullYear();
  const groups = useMemo(() => groupByMonth(diary.data ?? []), [diary.data]);
  const stats = useMemo(() => diaryStats(diary.data ?? [], year), [diary.data, year]);
  const remove = useMutation({
    mutationFn: deleteDiaryEntry,
    onSuccess: (_, id) => {
      setConfirm(null);
      queryClient.setQueryData(diaryKeys.all(user.id), (list) => list?.filter((e) => e.id !== id));
      queryClient.invalidateQueries({ queryKey: diaryKeys.all(user.id), refetchType: 'none' });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <>
      <div className="page-head">
        <h1 id="diary-page-title" tabIndex={-1}>
          Tagebuch
        </h1>
        <Link className="button-link btn-ghost btn-compact" to="/stats">
          Statistik & Jahresrückblick
        </Link>
      </div>
      {diary.isError ? (
        <Messages error={errorMessage(diary.error)} />
      ) : !diary.data ? (
        <TitleRowSkeleton rows={4} />
      ) : diary.data.length === 0 ? (
        <section className="card">
          <p className="empty">
            Noch keine Einträge. Auf jeder Detailseite kannst du „Gesehen am …“ eintragen – mit Ort, Begleitung und Notiz. Oder{' '}
            <Link to="/import">importiere dein Letterboxd-Tagebuch</Link>.
          </p>
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="diary-year-title">
            <h2 id="diary-year-title">{year} bisher</h2>
            <dl className="stats">
              <div className="stat">
                <dt>Gesehen</dt>
                <dd>{stats.total}</dd>
              </div>
              <div className="stat">
                <dt>Im Kino</dt>
                <dd>{stats.cinema}</dd>
              </div>
              <div className="stat">
                <dt>Nochmal geschaut</dt>
                <dd>{stats.rewatches}</dd>
              </div>
              {stats.company && (
                <div className="stat">
                  <dt>Am häufigsten mit</dt>
                  <dd>{stats.company.name}</dd>
                </div>
              )}
            </dl>
          </section>
          {groups.slice(0, months).map((g) => (
            <section key={g.key} className="card" aria-labelledby={`month-${g.key}`}>
              <div className="card-head">
                <h2 id={`month-${g.key}`}>{g.label}</h2>
                <span className="caption">{g.entries.length === 1 ? '1 Eintrag' : `${g.entries.length} Einträge`}</span>
              </div>
              <ul className="list">
                {g.entries.map((e) => (
                  <li key={e.id} className="title-row diary-row">
                    <span className="date-badge" aria-hidden="true">
                      <span className="date-badge-day">{Number(e.watched_on.slice(8, 10))}</span>
                      <span className="date-badge-month">{new Date(`${e.watched_on}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'short' })}</span>
                    </span>
                    {e.poster_path ? <img className="poster" src={POSTER_BASE + e.poster_path} alt="" loading="lazy" /> : <span className="poster" aria-hidden="true" />}
                    <div className="title-main">
                      <Link className="title-name title-link" to={detailPath(e)}>
                        {e.title}
                      </Link>
                      <div className="meta">
                        <span className="visually-hidden">{new Date(`${e.watched_on}T12:00:00`).toLocaleDateString('de-CH', { dateStyle: 'full' })}</span>
                        {describeEntry(e) && <span>{describeEntry(e)}</span>}
                        {e.rating && <span>{e.rating}/10</span>}
                        {e.import_ref && <span>aus Letterboxd</span>}
                      </div>
                      {e.note && <p className="reason">{e.note}</p>}
                    </div>
                    {confirm === e.id ? (
                      <div className="row-actions">
                        <button className="btn-danger btn-compact" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}>
                          Löschen
                        </button>
                        <button className="btn-ghost btn-compact" onClick={() => setConfirm(null)}>
                          Abbrechen
                        </button>
                      </div>
                    ) : (
                      <button className="btn-ghost btn-compact btn-icon" aria-label={`Eintrag „${e.title}“ löschen`} title="Löschen" onClick={() => setConfirm(e.id)}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {groups.length > months && (
            <div className="actions">
              <button className="btn-ghost" onClick={() => setMonths(months + MONTHS_SHOWN)}>
                Ältere Monate anzeigen
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
