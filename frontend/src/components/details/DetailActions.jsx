import { Check, Plus } from 'lucide-react';
import { useAddTitle, useUpdateItem } from '../../hooks/useWatchlist.js';
import { RATINGS, STATUS_LABEL } from '../../lib/labels.js';

function EntryControls({ item }) {
  const update = useUpdateItem(item);
  const save = (changes) => update.mutate({ changes });
  return (
    <div className="detail-actions" aria-busy={update.isPending || undefined}>
      <label>
        Status
        <select value={item.status} onChange={(e) => save({ status: e.target.value })}>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Meine Bewertung
        <select value={item.my_rating ?? ''} onChange={(e) => save({ my_rating: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Nicht bewertet</option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>
              {r} / 10
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AddButtons({ details }) {
  const add = useAddTitle();
  const pending = add.isPending ? add.variables?.status : null;
  return (
    <div className="detail-actions">
      <button className="btn-primary" disabled={add.isPending} onClick={() => add.mutate({ result: details, status: 'planned' })}>
        <Plus size={16} aria-hidden="true" />
        {pending === 'planned' ? 'Wird gemerkt …' : 'Merken'}
      </button>
      <button disabled={add.isPending} onClick={() => add.mutate({ result: details, status: 'completed' })}>
        <Check size={16} aria-hidden="true" />
        {pending === 'completed' ? 'Wird gespeichert …' : 'Schon gesehen'}
      </button>
    </div>
  );
}

// Watchlist controls on the detail page: add the title, or change status and rating if it is already listed.
export default function DetailActions({ details, entry, loading }) {
  if (loading) return <span className="skeleton skeleton--line skeleton--short" aria-label="Wird geladen" />;
  return entry ? <EntryControls item={entry} /> : <AddButtons details={details} />;
}
