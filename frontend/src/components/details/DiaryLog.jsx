import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { NotebookPen } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../../auth/AuthContext.jsx';
import { addDiaryEntry, diaryKeys, fetchTitleDiary } from '../../lib/api/diary.js';
import { addTitle, updateItem } from '../../lib/api/watchlist.js';
import { describeEntry } from '../../lib/diary.js';
import { errorMessage } from '../../lib/errors.js';
import { formatDate, RATINGS } from '../../lib/labels.js';
import { queryKeys } from '../../lib/queryClient.js';
import { Messages } from '../Form.jsx';
import { useToast } from '../toast/ToastProvider.jsx';

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time

// "Gesehen am …": one diary entry per viewing; also keeps the watchlist in sync for movies.
export default function DiaryLog({ details, entry }) {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const history = useQuery({ queryKey: diaryKeys.title(user.id, details.media_type, details.tmdb_id), queryFn: () => fetchTitleDiary(details.media_type, details.tmdb_id) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const start = () => {
    setForm({ watched_on: today(), place: 'home', with_whom: '', rating: entry?.my_rating ? String(entry.my_rating) : '', note: '', rewatch: Boolean(history.data?.length) });
    setError('');
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const rating = form.rating ? Number(form.rating) : null;
      await addDiaryEntry({
        media_type: details.media_type,
        tmdb_id: details.tmdb_id,
        title: details.title,
        poster_path: details.poster_path ?? null,
        watched_on: form.watched_on,
        place: form.place || null,
        with_whom: form.with_whom.trim() || null,
        note: form.note.trim() || null,
        rating,
        rewatch: form.rewatch,
      });
      // Movies count as watched; series keep their own progress.
      const status = details.media_type === 'movie' ? 'completed' : 'watching';
      const watched = details.media_type === 'movie' ? { watched_at: `${form.watched_on}T20:00:00` } : {};
      if (!entry) {
        const { item } = await addTitle(details, { status });
        if (item) await updateItem(item, { ...watched, ...(rating ? { my_rating: rating } : {}) });
      } else {
        const changes = {};
        if (details.media_type === 'movie' && entry.status !== 'completed') Object.assign(changes, { status: 'completed' }, watched);
        if (rating && rating !== entry.my_rating) changes.my_rating = rating;
        if (Object.keys(changes).length) await updateItem(entry, changes);
      }
    },
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: diaryKeys.all(user.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist(user.id) });
      toast.success('Im Tagebuch eingetragen.');
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.watched_on || form.watched_on > today()) return setError('Das Datum darf nicht in der Zukunft liegen.');
    save.mutate();
  };

  return (
    <section className="card" aria-labelledby="diary-title">
      <div className="card-head">
        <h2 id="diary-title">
          <NotebookPen size={18} aria-hidden="true" />
          Tagebuch
        </h2>
        {!open && (
          <button className="btn-compact" onClick={start}>
            <NotebookPen size={16} aria-hidden="true" /> Gesehen am … eintragen
          </button>
        )}
      </div>
      {history.data?.length > 0 && (
        <ul className="diary-mini">
          {history.data.map((h) => (
            <li key={h.id}>
              <strong>{formatDate(h.watched_on)}</strong> {describeEntry(h) && <span className="meta-inline">{describeEntry(h)}</span>}
              {h.rating && <span className="meta-inline"> · {h.rating}/10</span>}
            </li>
          ))}
        </ul>
      )}
      {!open && !history.data?.length && (
        <p className="muted">
          Halte fest, wann, wo und mit wem du den Titel gesehen hast. Alles im <Link to="/diary">Tagebuch</Link>.
        </p>
      )}
      {open && (
        <form className="stack" onSubmit={submit} noValidate>
          <div className="form-grid">
            <label>
              Datum
              <input type="date" value={form.watched_on} max={today()} onChange={set('watched_on')} required />
            </label>
            <label>
              Wo
              <select value={form.place} onChange={set('place')}>
                <option value="home">Zuhause</option>
                <option value="cinema">Im Kino</option>
                <option value="other">Anderswo</option>
              </select>
            </label>
            <label>
              Mit wem (optional)
              <input value={form.with_whom} onChange={set('with_whom')} maxLength={200} placeholder="z. B. Anna und Ben" />
            </label>
            <label>
              Bewertung
              <select value={form.rating} onChange={set('rating')}>
                <option value="">Keine</option>
                {RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r} / 10
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Notiz (optional)
            <textarea value={form.note} onChange={set('note')} maxLength={2000} rows={3} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={form.rewatch} onChange={set('rewatch')} /> Schon einmal gesehen (Rewatch)
          </label>
          <Messages error={error} />
          <div className="actions">
            <button type="submit" className="btn-primary" disabled={save.isPending}>
              {save.isPending ? 'Wird gespeichert …' : 'Eintragen'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
