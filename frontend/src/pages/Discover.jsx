import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import FeedRow from '../components/discover/FeedRow.jsx';
import TonightPicker from '../components/discover/TonightPicker.jsx';
import WeekAhead from '../components/discover/WeekAhead.jsx';
import { Messages } from '../components/Form.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { feedToTitle, fetchFeed, fetchGenres, fetchTaste, refreshFeed, sendFeedback } from '../lib/api/discovery.js';
import { fetchSettings } from '../lib/api/settings.js';
import { addTitle } from '../lib/api/watchlist.js';
import { errorMessage } from '../lib/errors.js';
import { titleKey } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';
import { deriveWeights, effectiveWeights } from '../../../supabase/functions/_shared/scoring.ts';

const FEED_KEY = (id) => ['feed', id];

export default function DiscoverPage() {
  useDocumentTitle('Für dich');
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const feed = useQuery({ queryKey: FEED_KEY(user.id), queryFn: fetchFeed });
  const watchlist = useWatchlist();
  const taste = useQuery({ queryKey: ['taste', user.id], queryFn: fetchTaste });
  const genres = useQuery({ queryKey: ['genres'], queryFn: fetchGenres, staleTime: 24 * 60 * 60_000 });
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const [type, setType] = useState('all');
  const [onlyNew, setOnlyNew] = useState(false);
  const [genre, setGenre] = useState('');
  const [pending, setPending] = useState(null);

  const inList = useMemo(() => new Set((watchlist.data ?? []).map(titleKey)), [watchlist.data]);
  const weights = useMemo(() => {
    const items = watchlist.data ?? [];
    return {
      movie: effectiveWeights(deriveWeights(items, 'movie'), taste.data?.genre_weights_movie ?? {}),
      tv: effectiveWeights(deriveWeights(items, 'tv'), taste.data?.genre_weights_tv ?? {}),
    };
  }, [watchlist.data, taste.data]);
  const genreName = useMemo(() => {
    const m = new Map();
    for (const g of [...(genres.data?.movie ?? []), ...(genres.data?.tv ?? [])]) m.set(g.id, g.name);
    return m;
  }, [genres.data]);

  const entries = (feed.data ?? []).filter(
    (f) => (type === 'all' || f.type === type) && (!onlyNew || f.data?.fresh) && (!genre || (f.data?.genre_ids ?? []).includes(Number(genre))),
  );
  const feedGenres = [...new Set((feed.data ?? []).flatMap((f) => f.data?.genre_ids ?? []))].filter((g) => genreName.has(g));

  const refresh = useMutation({
    mutationFn: refreshFeed,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: FEED_KEY(user.id) });
      toast.success(res?.suggestions ? `${res.suggestions} Vorschläge berechnet.` : 'Keine neuen Vorschläge gefunden.');
    },
    onError: (err) => (err?.code === 'RATE_LIMITED' ? toast.info('Die Vorschläge wurden gerade erst berechnet. Versuch es in ein paar Minuten nochmals.') : toast.error(errorMessage(err))),
  });

  const feedback = async (entry, action) => {
    setPending(entry.id);
    try {
      await sendFeedback(entry.id, action);
      queryClient.setQueryData(FEED_KEY(user.id), (list) =>
        action === 'dislike' ? list?.filter((f) => f.id !== entry.id) : list?.map((f) => (f.id === entry.id ? { ...f, status: 'liked' } : f)),
      );
      queryClient.invalidateQueries({ queryKey: ['taste', user.id] });
      if (action === 'dislike') toast.info(`„${entry.title}“ wird nicht mehr vorgeschlagen. Ähnliches kommt seltener.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const add = async (entry) => {
    setPending(entry.id);
    try {
      const { item } = await addTitle(feedToTitle(entry));
      await sendFeedback(entry.id, 'add');
      queryClient.setQueryData(queryKeys.watchlist(user.id), (list) => (list && item ? [item, ...list.filter((x) => titleKey(x) !== titleKey(item))] : list));
      toast.success(`„${entry.title}“ gemerkt.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const noProviders = settings.data && !(settings.data.streaming_providers ?? []).length;
  const updated = feed.data?.length ? new Date(Math.max(...feed.data.map((f) => Date.parse(f.created_at)))).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : null;

  return (
    <>
      <div className="page-head">
        <PageTitle area="discover" id="discover-title">
          Für dich
        </PageTitle>
        {updated && <span className="caption">Stand {updated}</span>}
      </div>
      <TonightPicker weights={weights} />
      <WeekAhead />
      <section className="card" aria-labelledby="feed-title">
        <div className="card-head">
          <h2 id="feed-title">
            Vorschläge
          </h2>
          <button className="btn-compact" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw size={16} aria-hidden="true" />
            {refresh.isPending ? 'Wird berechnet …' : 'Neu berechnen'}
          </button>
        </div>
        {noProviders && (
          <p className="caption">
            Tipp: Wähle unter <Link to="/profile">Profil → Streaming-Dienste</Link> deine Abos, dann bevorzugen die Vorschläge Titel, die du ohne Aufpreis schauen
            kannst.
          </p>
        )}
        <div className="toolbar">
          <div className="segmented" role="group" aria-label="Typ">
            {[['all', 'Alle'], ['movie', 'Filme'], ['tv', 'Serien']].map(([id, label]) => (
              <button key={id} type="button" className="segment" aria-pressed={type === id} onClick={() => setType(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="toolbar-filters">
            <select aria-label="Genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">Alle Genres</option>
              {feedGenres.map((g) => (
                <option key={g} value={g}>
                  {genreName.get(g)}
                </option>
              ))}
            </select>
            <label className="check-row">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
              Nur Neuerscheinungen
            </label>
          </div>
        </div>
        {feed.isError ? (
          <Messages error={errorMessage(feed.error)} />
        ) : !feed.data ? (
          <TitleRowSkeleton rows={4} />
        ) : feed.data.length === 0 ? (
          <div className="empty stack">
            <p>Noch keine Vorschläge. Je mehr du bewertest oder importierst, desto besser passen sie.</p>
            <div className="actions">
              <button className="btn-compact" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
                Jetzt berechnen
              </button>
              <Link to="/import">IMDb-Bewertungen importieren</Link>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <p className="empty">Keine Vorschläge passen zu diesen Filtern.</p>
        ) : (
          <ul className="poster-grid poster-grid--fill">
            {entries.map((f) => (
              <FeedRow key={f.id} entry={f} inList={inList.has(titleKey(feedToTitle(f)))} pending={pending === f.id} onFeedback={feedback} onAdd={add} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
