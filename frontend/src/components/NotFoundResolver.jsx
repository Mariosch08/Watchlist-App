import { useState } from 'react';
import { searchTitles } from '../lib/api/tmdb.js';
import { errorMessage } from '../lib/errors.js';
import { titleKey } from '../lib/labels.js';
import TitleRow from './TitleRow.jsx';

// Results whose year matches the IMDb year come first.
const rankByYear = (results, year) =>
  year ? [...results].sort((a, b) => Math.abs(Number(a.release_date?.slice(0, 4)) - year || 99) - Math.abs(Number(b.release_date?.slice(0, 4)) - year || 99)) : results;

// One IMDb title that could not be matched automatically: search TMDb, pick one or ignore it.
export default function NotFoundResolver({ row, onResolve, onDismiss, pending }) {
  const [query, setQuery] = useState(row.title ?? '');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const search = async (e) => {
    e.preventDefault();
    setSearching(true);
    setError('');
    try {
      const res = await searchTitles(query);
      setResults(rankByYear(res.results, row.year));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  };
  return (
    <li className="resolver" aria-busy={pending || undefined}>
      <div className="resolver-head">
        <div className="title-main">
          <span className="title-name">{row.title || row.imdb_id || row.ref}</span>
          <div className="meta">
            {row.year && <span>{row.year}</span>}
            {row.rating && <span className="badge badge--accent">Meine Bewertung {row.rating}/10</span>}
            {row.file && <span className="mono">{row.file}</span>}
            {row.imdb_id ? (
              <a className="mono" href={`https://www.imdb.com/title/${row.imdb_id}/`} target="_blank" rel="noreferrer">
                {row.imdb_id}
              </a>
            ) : row.ref?.startsWith('lb:boxd.it/') ? (
              <a className="mono" href={`https://${row.ref.slice(3)}`} target="_blank" rel="noreferrer">
                Letterboxd
              </a>
            ) : (
              row.source && <span>{row.source === 'trakt' ? 'Trakt' : 'Letterboxd'}</span>
            )}
          </div>
        </div>
        <button className="btn-ghost btn-compact" disabled={pending} onClick={onDismiss}>
          Ignorieren
        </button>
      </div>
      <form className="inline-form" onSubmit={search}>
        <input aria-label={`TMDb-Suche für ${row.title}`} value={query} onChange={(e) => setQuery(e.target.value)} minLength={2} required />
        <button className="btn-compact" disabled={searching}>
          {searching ? 'Sucht …' : 'Suchen'}
        </button>
      </form>
      {error && <p className="field-error">{error}</p>}
      {results && (
        <ul className="list">
          {results.length === 0 && <li className="empty">Keine Treffer für „{query}“. Versuche den Original- oder deutschen Titel.</li>}
          {results.slice(0, 8).map((r) => (
            <TitleRow key={titleKey(r)} item={r}>
              <button className="btn-compact" disabled={pending} onClick={() => onResolve(r)}>
                Übernehmen
              </button>
            </TitleRow>
          ))}
        </ul>
      )}
    </li>
  );
}
