import { RATINGS, STATUS_LABEL } from '../lib/labels.js';

// Status, personal rating and remove for one watchlist entry.
export default function WatchlistActions({ item, busy, onUpdate, onRemove }) {
  return (
    <div className="row-actions">
      <select aria-label="Status" value={item.status} disabled={busy} onChange={(e) => onUpdate({ status: e.target.value })}>
        {Object.entries(STATUS_LABEL).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Meine Bewertung"
        value={item.my_rating ?? ''}
        disabled={busy}
        onChange={(e) => onUpdate({ my_rating: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Bewerten</option>
        {RATINGS.map((r) => (
          <option key={r} value={r}>
            {r} / 10
          </option>
        ))}
      </select>
      <button className="link danger" disabled={busy} onClick={onRemove}>
        Entfernen
      </button>
    </div>
  );
}
