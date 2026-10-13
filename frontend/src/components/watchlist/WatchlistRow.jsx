import { Trash2 } from 'lucide-react';
import { memo } from 'react';
import { useUpdateItem } from '../../hooks/useWatchlist.js';
import { RATINGS, STATUS_LABEL } from '../../lib/labels.js';
import TitleRow from '../TitleRow.jsx';

// A watchlist entry with its own optimistic mutations: editing one row never blocks another.
function WatchlistRow({ item, onRemove }) {
  const update = useUpdateItem(item);
  const save = (changes) => update.mutate({ changes });
  return (
    <TitleRow item={item} busy={update.isPending}>
      <div className="row-actions">
        <select aria-label={`Status von ${item.title}`} value={item.status} onChange={(e) => save({ status: e.target.value })}>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label={`Meine Bewertung für ${item.title}`}
          value={item.my_rating ?? ''}
          onChange={(e) => save({ my_rating: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Bewerten</option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>
              {r} / 10
            </option>
          ))}
        </select>
        <button className="btn-ghost btn-compact btn-icon" aria-label="Entfernen" title="Entfernen" onClick={() => onRemove(item)}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </TitleRow>
  );
}

export default memo(WatchlistRow);
