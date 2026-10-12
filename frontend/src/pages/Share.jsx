import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Messages } from '../components/Form.jsx';
import { CardSkeleton, TitleRowSkeleton } from '../components/Skeleton.jsx';
import TitleRow from '../components/TitleRow.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useTitleSearch } from '../hooks/useTitleSearch.js';
import { useAddTitle, useWatchlist } from '../hooks/useWatchlist.js';
import { findByImdbId } from '../lib/api/tmdb.js';
import { errorMessage } from '../lib/errors.js';
import { detailPath, titleKey } from '../lib/labels.js';
import { parseShared } from '../lib/share.js';

// Target of "Teilen → Watchlist" from other apps (installed PWA).
export default function SharePage() {
  useDocumentTitle('Geteilt');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const shared = useMemo(() => parseShared({ title: params.get('title') ?? '', text: params.get('text') ?? '', url: params.get('url') ?? '' }), [params]);
  const find = useQuery({ queryKey: ['find', shared.imdbId], queryFn: () => findByImdbId(shared.imdbId), enabled: shared.kind === 'imdb', retry: false });
  const [query, setQuery] = useState(shared.query ?? '');
  const search = useTitleSearch(query);
  const watchlist = useWatchlist();
  const add = useAddTitle();
  const inList = useMemo(() => new Map((watchlist.data ?? []).map((t) => [titleKey(t), t])), [watchlist.data]);

  useEffect(() => {
    if (shared.kind === 'tmdb') navigate(detailPath(shared), { replace: true });
  }, [shared, navigate]);
  useEffect(() => {
    if (find.data) navigate(detailPath(find.data), { replace: true });
  }, [find.data, navigate]);

  if (shared.kind === 'tmdb' || (shared.kind === 'imdb' && !find.isError)) return <CardSkeleton />;

  return (
    <section className="card" aria-labelledby="share-title">
      <h1 id="share-title" tabIndex={-1}>
        Zur Watchlist hinzufügen
      </h1>
      {find.isError && <Messages error={errorMessage(find.error)} />}
      {shared.kind === 'none' && !find.isError && <p className="muted">Im geteilten Inhalt habe ich keinen Titel erkannt. Such ihn hier:</p>}
      <div className="search-field" role="search">
        <Search size={16} aria-hidden="true" className="search-icon" />
        <input type="search" aria-label="Film oder Serie suchen" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      </div>
      {search.isError ? (
        <Messages error={errorMessage(search.error)} />
      ) : search.enabled && !search.results.length && !search.settled ? (
        <TitleRowSkeleton rows={3} />
      ) : (
        <ul className="list">
          {search.results.slice(0, 8).map((r) => {
            const existing = inList.get(titleKey(r));
            return (
              <TitleRow key={titleKey(r)} item={r} busy={add.isPending && add.variables?.result === r}>
                {existing ? (
                  <span className="badge">
                    <Check size={12} aria-hidden="true" /> In deiner Liste
                  </span>
                ) : (
                  <button className="btn-compact" disabled={add.isPending} onClick={() => add.mutate({ result: r, status: 'planned' })}>
                    <Plus size={16} aria-hidden="true" /> Merken
                  </button>
                )}
              </TitleRow>
            );
          })}
          {search.settled && search.enabled && search.results.length === 0 && <li className="empty">Nichts gefunden.</li>}
        </ul>
      )}
    </section>
  );
}
