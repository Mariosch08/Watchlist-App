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
            {row.rating && <span className="badge-mine">Ich {row.rating}/10</span>}
            <a href={`https://www.imdb.com/title/${row.imdb_id}/`} target="_blank" rel="noreferrer">
              {row.imdb_id}
            </a>
          </div>
        </div>
        {results === null && (
          <button className="link" disabled={busy || !row.title} onClick={search}>
            Zuordnen
          </button>
        )}
      </div>
      {results && (
        <ul className="plain">
          {results.length === 0 && <li className="muted">Keine Treffer.</li>}
          {results.slice(0, 5).map((r, index) => (
            <TitleRow key={titleKey(r)} item={r} index={index}>
              <button disabled={busy} onClick={() => onResolve(r)}>
                Das ist es
              </button>
            </TitleRow>
          ))}
        </ul>
      )}
    </li>
  );
}
