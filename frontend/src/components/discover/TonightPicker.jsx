import { Shuffle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../../hooks/useWatchlist.js';
import { formatRuntime, STATUS_LABEL } from '../../lib/labels.js';
import { DURATIONS, MOODS, pickTonight } from '../../lib/tonight.js';
import TitleRow from '../TitleRow.jsx';

// "Was schauen wir heute?" – one suggestion from the own watchlist.
export default function TonightPicker({ weights }) {
  const watchlist = useWatchlist();
  const [options, setOptions] = useState({ kind: 'any', duration: 'any', mood: null });
  const [shown, setShown] = useState([]);
  const [pick, setPick] = useState(undefined);
  const set = (patch) => {
    setOptions((o) => ({ ...o, ...patch }));
    setShown([]);
    setPick(undefined);
  };
  const roll = () => {
    const maxMinutes = DURATIONS.find((d) => d.id === options.duration)?.minutes ?? null;
    const next = pickTonight(watchlist.data, { kind: options.kind, maxMinutes, mood: options.mood }, { shown, weights });
    setPick(next);
    if (next) setShown((s) => [...s, `${next.media_type}:${next.tmdb_id}`]);
  };
  return (
    <section className="card" aria-labelledby="tonight-title">
      <h2 id="tonight-title">Was schauen wir heute?</h2>
      <div className="tonight-options">
        <div className="segmented" role="group" aria-label="Typ">
          {[['any', 'Egal'], ['movie', 'Film'], ['tv', 'Serie']].map(([id, label]) => (
            <button key={id} type="button" className="segment" aria-pressed={options.kind === id} onClick={() => set({ kind: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="group" aria-label="Stimmung">
          {MOODS.map((m) => (
            <button key={m.id} type="button" className="segment" aria-pressed={options.mood === m.id} onClick={() => set({ mood: options.mood === m.id ? null : m.id })}>
              {m.label}
            </button>
          ))}
        </div>
        <select aria-label="Dauer" value={options.duration} onChange={(e) => set({ duration: e.target.value })}>
          {DURATIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id === 'any' ? 'Dauer egal' : d.label}
            </option>
          ))}
        </select>
      </div>
      <div className="actions">
        <button className="btn-primary" onClick={roll} disabled={!watchlist.data}>
          <Shuffle size={16} aria-hidden="true" />
          {pick === undefined ? 'Vorschlag machen' : 'Nochmal'}
        </button>
      </div>
      <div aria-live="polite">
        {pick === null && (
          <p className="empty">
            {shown.length ? 'Keine weiteren passenden Titel in deiner Watchlist.' : 'Nichts Passendes in deiner Watchlist. Lockere die Filter oder schau in die Vorschläge unten.'}
          </p>
        )}
        {pick && (
          <ul className="list tonight-pick">
            <TitleRow
              item={pick}
              extraMeta={
                <>
                  {pick.runtime && pick.media_type === 'movie' && <span>{formatRuntime(pick.runtime)}</span>}
                  {pick.media_type === 'tv' && <span className="badge">{STATUS_LABEL[pick.status]}</span>}
                </>
              }
            >
              <Link className="button-link" to={`/title/${pick.media_type}/${pick.tmdb_id}`}>
                Details & Streaming
              </Link>
            </TitleRow>
          </ul>
        )}
      </div>
    </section>
  );
}
