import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '../../auth/AuthContext.jsx';
import { useWatchlist } from '../../hooks/useWatchlist.js';
import { fetchGenres, fetchTaste, updateTaste } from '../../lib/api/discovery.js';
import { errorMessage } from '../../lib/errors.js';
import { clamp, deriveWeights } from '../../../../supabase/functions/_shared/scoring.ts';
import { Messages } from '../Form.jsx';
import { useToast } from '../toast/ToastProvider.jsx';

const COLUMN = { movie: 'genre_weights_movie', tv: 'genre_weights_tv' };
const label = (w) => (w >= 0.6 ? 'Liebe ich' : w >= 0.2 ? 'Mag ich' : w <= -0.6 ? 'Gar nicht' : w <= -0.2 ? 'Eher nicht' : 'Neutral');

function Slider({ genre, value, derived, onCommit }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const timer = useRef(null);
  const change = (v) => {
    setLocal(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(v), 500);
  };
  return (
    <label className="taste-row">
      <span className="taste-name">{genre.name}</span>
      <input type="range" min={-1} max={1} step={0.1} value={local} onChange={(e) => change(Number(e.target.value))} aria-valuetext={label(local)} />
      <span className="caption taste-value">
        {label(local)}
        {Math.abs(derived) >= 0.05 && <span className="visually-hidden">, aus deinen Bewertungen {derived.toFixed(1)}</span>}
      </span>
    </label>
  );
}

// Genre sliders: the value combines what your ratings say with your own adjustments.
export default function TasteCard() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState('movie');
  const key = ['taste', user.id];
  const taste = useQuery({ queryKey: key, queryFn: fetchTaste });
  const genres = useQuery({ queryKey: ['genres'], queryFn: fetchGenres, staleTime: 24 * 60 * 60_000 });
  const watchlist = useWatchlist();
  const derived = useMemo(() => deriveWeights(watchlist.data ?? [], kind), [watchlist.data, kind]);
  const adjustments = taste.data?.[COLUMN[kind]] ?? {};
  const save = useMutation({
    mutationFn: (changes) => updateTaste(changes),
    onSuccess: (saved) => queryClient.setQueryData(key, saved),
    onError: (err) => toast.error(`Nicht gespeichert. ${errorMessage(err)}`),
  });
  const commit = (genreId, value) => {
    const d = derived[String(genreId)] ?? 0;
    const next = { ...adjustments, [String(genreId)]: Math.round(clamp(value - d, -2, 2) * 10) / 10 };
    save.mutate({ [COLUMN[kind]]: next });
  };
  const list = (genres.data?.[kind] ?? [])
    .map((g) => {
      const d = derived[String(g.id)] ?? 0;
      return { genre: g, derived: d, value: Math.round(clamp(d + Number(adjustments[String(g.id)] ?? 0)) * 10) / 10 };
    })
    .sort((a, b) => b.value - a.value || a.genre.name.localeCompare(b.genre.name));
  return (
    <section className="card" aria-labelledby="taste-title">
      <div className="card-head">
        <h2 id="taste-title">
          Mein Geschmack
        </h2>
        <div className="segmented" role="group" aria-label="Typ">
          {[['movie', 'Filme'], ['tv', 'Serien']].map(([id, text]) => (
            <button key={id} type="button" className="segment" aria-pressed={kind === id} onClick={() => setKind(id)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <p className="muted">Startwerte kommen aus deinen Bewertungen (8–10 erhöhen, 1–4 senken). 👍 und 👎 bei den Vorschlägen verschieben sie weiter.</p>
      {taste.isError || genres.isError ? (
        <Messages error={errorMessage(taste.error ?? genres.error)} />
      ) : !taste.data || !genres.data ? (
        <span className="skeleton skeleton--line skeleton--long" aria-label="Wird geladen" />
      ) : (
        <div className="taste-list">
          {list.map(({ genre, value, derived: d }) => (
            <Slider key={`${kind}-${genre.id}`} genre={genre} value={value} derived={d} onCommit={(v) => commit(genre.id, v)} />
          ))}
        </div>
      )}
    </section>
  );
}
