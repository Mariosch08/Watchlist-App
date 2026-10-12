import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import AlbumRow from '../components/music/AlbumRow.jsx';
import MusicSources from '../components/music/MusicSources.jsx';
import { CardSkeleton, TitleRowSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useMusicRefresh } from '../hooks/useMusic.js';
import { sendFeedback } from '../lib/api/discovery.js';
import { fetchArtists, fetchConcerts, fetchMusicFeed, fetchSpotifyConnection } from '../lib/api/music.js';
import { fetchSettings } from '../lib/api/settings.js';
import { errorMessage } from '../lib/errors.js';
import { queryKeys } from '../lib/queryClient.js';
import { spotifyClientId } from '../lib/spotify.js';

const dayMonth = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return { day: d.toLocaleDateString('de-CH', { day: 'numeric' }), month: d.toLocaleDateString('de-CH', { month: 'short' }), weekday: d.toLocaleDateString('de-CH', { weekday: 'short' }) };
};

function Concerts({ concerts }) {
  if (!concerts.length) {
    return <p className="empty">Keine Konzerte deiner Artists in der Schweiz gefunden. Neue Termine erscheinen hier und im Kalender-Abo.</p>;
  }
  return (
    <ul className="list">
      {concerts.map((c) => {
        const d = dayMonth(c.local_date);
        return (
          <li key={c.event_id} className="title-row concert-row">
            <span className="date-badge" aria-hidden="true">
              <span className="date-badge-day">{d.day}</span>
              <span className="date-badge-month">{d.month}</span>
            </span>
            <div className="title-main">
              <span className="title-name">{c.artist}</span>
              <div className="meta">
                <span>
                  <span className="visually-hidden">{new Date(`${c.local_date}T12:00:00`).toLocaleDateString('de-CH', { dateStyle: 'full' })}, </span>
                  {d.weekday}
                </span>
                {[c.venue, c.city].filter(Boolean).length > 0 && <span>{[c.venue, c.city].filter(Boolean).join(', ')}</span>}
              </div>
              {c.name !== c.artist && <span className="reason">{c.name}</span>}
            </div>
            {c.url && (
              <a className="button-link btn-compact" href={c.url} target="_blank" rel="noopener noreferrer">
                Tickets
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function MusicPage() {
  useDocumentTitle('Musik');
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const refresh = useMusicRefresh();
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const spotify = useQuery({ queryKey: queryKeys.music(user.id, 'spotify'), queryFn: fetchSpotifyConnection, enabled: Boolean(spotifyClientId) });
  const feed = useQuery({ queryKey: queryKeys.music(user.id, 'feed'), queryFn: fetchMusicFeed });
  const artists = useQuery({ queryKey: queryKeys.music(user.id, 'artists'), queryFn: fetchArtists });
  const concerts = useQuery({ queryKey: queryKeys.music(user.id, 'concerts'), queryFn: fetchConcerts });
  const [pending, setPending] = useState(null);

  const connected = Boolean(settings.data?.lastfm_username || spotify.data);
  const loading = !settings.data || (spotifyClientId && spotify.isPending);

  const feedback = async (entry, action) => {
    setPending(entry.id);
    try {
      await sendFeedback(entry.id, action);
      queryClient.setQueryData(queryKeys.music(user.id, 'feed'), (list) =>
        action === 'dislike' ? list?.filter((f) => f.id !== entry.id) : list?.map((f) => (f.id === entry.id ? { ...f, status: 'liked' } : f)),
      );
      if (action === 'dislike') toast.info(`„${entry.title}“ wird nicht mehr vorgeschlagen. Ähnliches kommt seltener.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  };

  const updated = artists.data?.[0]?.updated_at ? new Date(artists.data[0].updated_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : null;

  if (settings.isError) return <Messages error={errorMessage(settings.error)} />;
  if (loading) return <CardSkeleton />;

  return (
    <>
      <div className="page-head">
        <h1 id="music-title" tabIndex={-1}>
          Musik
        </h1>
        {connected && (
          <button className="btn-compact" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw size={16} aria-hidden="true" />
            {refresh.isPending ? 'Wird gesucht …' : 'Neu suchen'}
          </button>
        )}
      </div>
      {!connected ? (
        <section className="card" aria-labelledby="connect-title">
          <h2 id="connect-title">Verbinde deine Musik</h2>
          <p className="muted">Mit deinem Last.fm-Namen findet die App jeden Tag neue Alben deiner Lieblings-Artists und ähnlicher Bands – und Konzerte in der Schweiz.</p>
          <MusicSources />
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="releases-title">
            <div className="card-head">
              <h2 id="releases-title">Neu erschienen für dich</h2>
              {updated && <span className="caption">Stand {updated}</span>}
            </div>
            {feed.isError ? (
              <Messages error={errorMessage(feed.error)} />
            ) : !feed.data ? (
              <TitleRowSkeleton rows={3} />
            ) : feed.data.length === 0 ? (
              <p className="empty">
                {artists.data?.length ? 'In den letzten 30 Tagen ist von deinen Artists nichts Neues erschienen.' : 'Noch nichts berechnet. „Neu suchen“ holt deine Hördaten.'}
              </p>
            ) : (
              <ul className="list">
                {feed.data.map((f) => (
                  <AlbumRow key={f.id} entry={f} pending={pending === f.id} onFeedback={feedback} />
                ))}
              </ul>
            )}
          </section>
          <section className="card" aria-labelledby="concerts-title">
            <h2 id="concerts-title">Konzerte in der Schweiz</h2>
            {concerts.isError ? <Messages error={errorMessage(concerts.error)} /> : concerts.data ? <Concerts concerts={concerts.data} /> : <TitleRowSkeleton rows={2} />}
          </section>
          {artists.data?.length > 0 && (
            <section className="card" aria-labelledby="artists-title">
              <h2 id="artists-title">Deine Top-Artists</h2>
              <ol className="chip-list">
                {artists.data.slice(0, 20).map((a) => (
                  <li key={a.artist_key} className="chip">
                    {a.name}
                  </li>
                ))}
              </ol>
              <p className="caption">Aus {[...new Set(artists.data.flatMap((a) => a.sources))].map((s) => (s === 'lastfm' ? 'Last.fm' : 'Spotify')).join(' und ')}, letzte 6 Monate.</p>
            </section>
          )}
        </>
      )}
    </>
  );
}
