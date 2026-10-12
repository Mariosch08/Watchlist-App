import { Search, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Messages } from '../components/Form.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import SearchResults from '../components/watchlist/SearchResults.jsx';
import WatchlistList from '../components/watchlist/WatchlistList.jsx';
import WatchlistToolbar from '../components/watchlist/WatchlistToolbar.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useTitleSearch } from '../hooks/useTitleSearch.js';
import { useUrlView } from '../hooks/useUrlView.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { MIN_QUERY_LENGTH } from '../lib/api/tmdb.js';
import { errorMessage } from '../lib/errors.js';
import { titleKey } from '../lib/labels.js';
import { applyView } from '../lib/watchlistView.js';

export default function WatchlistPage() {
  useDocumentTitle('Meine Watchlist');
  const [view, setView] = useUrlView();
  const [expanded, setExpanded] = useState(false);
  const headingRef = useRef(null);
  const watchlist = useWatchlist();
  const search = useTitleSearch(view.q);

  const items = watchlist.data;
  const { visible, counts, total } = useMemo(() => applyView(items, view), [items, view]);
  const byKey = useMemo(() => new Map((items ?? []).map((i) => [titleKey(i), i])), [items]);
  const searching = view.q.trim().length >= MIN_QUERY_LENGTH;

  const setQuery = (q) => {
    setExpanded(false);
    setView({ q });
  };

  return (
    <>
      <div className="page-head">
        <h1 id="watchlist-title" ref={headingRef} tabIndex={-1}>
          Meine Watchlist
        </h1>
        {items && <span className="caption">{total === 1 ? '1 Titel' : `${total} Titel`}</span>}
      </div>

      <div className="search-field" role="search">
        <Search size={16} aria-hidden="true" className="search-icon" />
        <input
          type="search"
          aria-label="In der Watchlist suchen oder neuen Titel finden"
          placeholder="Titel suchen – in deiner Liste und auf TMDb"
          value={view.q}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
        {view.q && (
          <button type="button" className="btn-ghost btn-compact btn-icon" aria-label="Suche leeren" title="Suche leeren" onClick={() => setQuery('')}>
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {searching && <SearchResults search={search} byKey={byKey} expanded={expanded} onExpand={() => setExpanded(true)} />}

      <section className="card" aria-labelledby="watchlist-title">
        {watchlist.isError && !items ? (
          <div className="stack">
            <Messages error={`Die Watchlist konnte nicht geladen werden. ${errorMessage(watchlist.error)}`} />
            <div className="actions">
              <button onClick={() => watchlist.refetch()} disabled={watchlist.isFetching}>
                {watchlist.isFetching ? 'Lädt …' : 'Erneut laden'}
              </button>
            </div>
          </div>
        ) : !items ? (
          <TitleRowSkeleton rows={5} />
        ) : (
          <>
            <WatchlistToolbar view={view} counts={counts} onChange={setView} />
            {searching && visible.length > 0 && (
              <p className="caption">
                {visible.length} {visible.length === 1 ? 'Treffer' : 'Treffer'} in deiner Liste
              </p>
            )}
            <WatchlistList
              items={visible}
              total={total}
              view={view}
              headingRef={headingRef}
              onResetFilters={() => setView({ q: '', type: 'all' })}
            />
          </>
        )}
      </section>
    </>
  );
}
