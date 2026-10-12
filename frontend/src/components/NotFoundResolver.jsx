import { useState } from 'react';
import { titleKey } from '../lib/labels.js';
import { searchTitles } from '../lib/watchlist.js';
import TitleRow from './TitleRow.jsx';

// One IMDb title that could not be matched automatically: search TMDb and pick the right one.
export default function NotFoundResolver({ row, busy, onResolve, run }) {
  const [results, setResults] = useState(null);
  const search = () => run(async () => setResults(await searchTitles(row.title)));
  return (
    <li className="resolver">
      <div className="resolver-head">
        <div className="title-main">
          <span className="title-name">{row.title || row.imdb_id}</span>
          <div className="meta">
            {row.year && <span>{row.year}</span>}
            {row.rating && <span className="badge badge--accent">Meine Bewertung {row.rating}/10</span>}
            <a className="mono" href={`https://www.imdb.com/title/${row.imdb_id}/`} target="_blank" rel="noreferrer">
              {row.imdb_id}
            </a>
          </div>
        </div>
        {results === null && (
          <button className="btn-compact" disabled={busy || !row.title} onClick={search}>
            Zuordnen
          </button>
        )}
      </div>
      {results && (
        <ul className="list">
          {results.length === 0 && <li className="empty">Keine Treffer für „{row.title}“.</li>}
          {results.slice(0, 5).map((r) => (
            <TitleRow key={titleKey(r)} item={r}>
              <button className="btn-compact" disabled={busy} onClick={() => onResolve(r)}>
                Übernehmen
              </button>
            </TitleRow>
          ))}
        </ul>
      )}
    </li>
  );
}
