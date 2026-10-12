import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useRemoveItem } from '../../hooks/useWatchlist.js';
import { titleKey } from '../../lib/labels.js';
import { SEGMENTS } from '../../lib/watchlistView.js';
import WatchlistRow from './WatchlistRow.jsx';

const STEP = 60;

function EmptyState({ total, view, onReset }) {
  if (total === 0) {
    return (
      <div className="empty">
        <p>Noch keine Titel. Suche oben nach einem Film oder einer Serie.</p>
        <p>
          Du hast schon Bewertungen auf IMDb? <Link to="/import">IMDb-Daten importieren</Link>
        </p>
      </div>
    );
  }
  const segment = SEGMENTS.find((s) => s.id === view.segment)?.label;
  const filtered = view.q.trim() || view.type !== 'all';
  return (
    <div className="empty">
      <p>{filtered ? `Keine Titel in „${segment}“ passen zu deinen Filtern.` : `In „${segment}“ ist noch nichts.`}</p>
      {filtered && (
        <button type="button" className="btn-compact" onClick={onReset}>
          Filter zurücksetzen
        </button>
      )}
    </div>
  );
}

// Renders the filtered list in steps so hundreds of titles stay fast.
export default function WatchlistList({ items, total, view, onResetFilters, headingRef }) {
  const [limit, setLimit] = useState(STEP);
  const remove = useRemoveItem();
  const viewKey = `${view.segment}|${view.type}|${view.sort}|${view.q}`;
  useEffect(() => setLimit(STEP), [viewKey]);

  const onRemove = useCallback(
    (item) => {
      remove.mutate(item);
      headingRef?.current?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [remove.mutate, headingRef],
  );

  if (items.length === 0) return <EmptyState total={total} view={view} onReset={onResetFilters} />;
  const shown = items.slice(0, limit);
  return (
    <>
      <ul className="list">
        {shown.map((item) => (
          <WatchlistRow key={titleKey(item)} item={item} onRemove={onRemove} />
        ))}
      </ul>
      {items.length > limit && (
        <div className="actions">
          <button type="button" onClick={() => setLimit((l) => l + STEP)}>
            Weitere {Math.min(STEP, items.length - limit)} anzeigen
          </button>
          <span className="caption">
            {limit} von {items.length}
          </span>
        </div>
      )}
    </>
  );
}
