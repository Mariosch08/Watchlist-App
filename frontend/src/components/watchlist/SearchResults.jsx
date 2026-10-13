import { Check, Plus, Search } from 'lucide-react';
import { memo } from 'react';
import { useAddTitle } from '../../hooks/useWatchlist.js';
import { errorMessage } from '../../lib/errors.js';
import { STATUS_LABEL, titleKey } from '../../lib/labels.js';
import TitleRow from '../TitleRow.jsx';

const PREVIEW = 5;

const ResultRow = memo(function ResultRow({ result, existing }) {
  const add = useAddTitle();
  if (existing) {
    return <TitleRow item={result} extraMeta={<span className="badge">In deiner Liste · {STATUS_LABEL[existing.status]}</span>} />;
  }
  const pendingStatus = add.isPending ? add.variables?.status : null;
  return (
    <TitleRow item={result} busy={add.isPending}>
      <div className="row-actions">
        <button className="btn-compact" disabled={add.isPending} onClick={() => add.mutate({ result, status: 'planned' })}>
          <Plus size={16} aria-hidden="true" />
          {pendingStatus === 'planned' ? 'Wird gemerkt …' : 'Merken'}
        </button>
        <button className="btn-ghost btn-compact" disabled={add.isPending} onClick={() => add.mutate({ result, status: 'completed' })}>
          <Check size={16} aria-hidden="true" />
          {pendingStatus === 'completed' ? 'Wird gespeichert …' : 'Schon gesehen'}
        </button>
      </div>
    </TitleRow>
  );
});

// TMDb results for the current search text. Titles already in the list show their status.
export default function SearchResults({ search, byKey, expanded, onExpand }) {
  const { results, isFetching, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage, query, settled } = search;
  const shown = expanded ? results : results.slice(0, PREVIEW);
  let status;
  if (isError) status = `Suche fehlgeschlagen. ${errorMessage(error)}`;
  else if (!settled && results.length === 0) status = 'Suche auf TMDb …';
  else if (settled && results.length === 0) status = `Keine Treffer auf TMDb für „${query}“.`;
  else status = `${results.length}${hasNextPage ? '+' : ''} Treffer auf TMDb${isFetching ? ' · wird aktualisiert …' : ''}`;

  return (
    <section className="card" aria-labelledby="tmdb-results-title">
      <div className="card-head">
        <h2 id="tmdb-results-title">
          <Search size={18} aria-hidden="true" />
          Neu hinzufügen
        </h2>
        <span className="caption" aria-live="polite">
          {status}
        </span>
      </div>
      {isError && (
        <div className="actions">
          <button className="btn-compact" onClick={() => refetch()}>
            Erneut suchen
          </button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="list" aria-busy={isFetching || undefined}>
          {shown.map((r) => (
            <ResultRow key={titleKey(r)} result={r} existing={byKey.get(titleKey(r))} />
          ))}
        </ul>
      )}
      {(results.length > PREVIEW && !expanded) || (expanded && hasNextPage) ? (
        <div className="actions">
          <button
            className="btn-compact"
            disabled={isFetchingNextPage}
            onClick={() => (expanded ? fetchNextPage() : onExpand())}
          >
            {isFetchingNextPage ? 'Lädt …' : 'Mehr Treffer anzeigen'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
