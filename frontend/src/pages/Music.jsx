import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import AlbumRow from '../components/music/AlbumRow.jsx';
import MusicProfile from '../components/music/MusicProfile.jsx';
import MusicSources from '../components/music/MusicSources.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { CardSkeleton, TitleRowSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useMusicRefresh } from '../hooks/useMusic.js';
import { sendFeedback } from '../lib/api/discovery.js';
import {
  fetchArtists,
  fetchConcertBuddies,
  fetchConcertLog,
  fetchConcerts,
  fetchMusicFeed,
  fetchSpotifyConnection,
  logConcert,
  unlogConcert,
} from '../lib/api/music.js';
import { fetchSettings } from '../lib/api/settings.js';
import { errorMessage } from '../lib/errors.js';
import { queryKeys } from '../lib/queryClient.js';
import { spotifyClientId } from '../lib/spotify.js';

const dayMonth = (iso) => {
  const d = new Date(`${iso}T12:00:00`);
  return { day: d.toLocaleDateString('de-CH', { day: 'numeric' }), month: d.toLocaleDateString('de-CH', { month: 'short' }), weekday: d.toLocaleDateString('de-CH', { weekday: 'short' }) };
};

function ConcertForm({ onSave, busy }) {
  const [form, setForm] = useState({ artist: '', local_date: '', city: '' });
  const submit = (e) => {
    e.preventDefault();
    if (!form.artist.trim() || !form.local_date) return;
    onSave({ artist: form.artist.trim().slice(0, 200), local_date: form.local_date, city: form.city.trim().slice(0, 100) || null });
    setForm({ artist: '', local_date: '', city: '' });
  };
  return (
    <details className="disclosure">
      <summary>Konzert eintragen</summary>
      <form className="inline-form" onSubmit={submit}>
        <label>
          Artist
          <input value={form.artist} maxLength={200} required onChange={(e) => setForm({ ...form, artist: e.target.value })} />
        </label>
        <label>
          Datum
          <input type="date" value={form.local_date} min="1950-01-01" required onChange={(e) => setForm({ ...form, local_date: e.target.value })} />
        </label>
        <label>
          Ort
          <input value={form.city} maxLength={100} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </label>
        <button type="submit" disabled={busy}>
          Eintragen
        </button>
      </form>
    </details>
  );
}

// Concerts in Switzerland, which ones I go to, and friends who listen to the same artist.
function Concerts({ concerts }) {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const going = useQuery({ queryKey: queryKeys.music(user.id, 'going'), queryFn: fetchConcertLog });
  const buddies = useQuery({ queryKey: queryKeys.music(user.id, 'buddies'), queryFn: fetchConcertBuddies });
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.music(user.id, 'going') });
  const add = useMutation({ mutationFn: logConcert, onSuccess: refresh, onError: (err) => toast.error(errorMessage(err)) });
  const remove = useMutation({ mutationFn: unlogConcert, onSuccess: refresh, onError: (err) => toast.error(errorMessage(err)) });
  const mine = new Map((going.data ?? []).filter((g) => g.event_id).map((g) => [g.event_id, g]));
  const friendsAt = (eventId) => (buddies.data ?? []).filter((b) => b.event_id === eventId).map((b) => b.display_name);
  const today = new Date().toISOString().slice(0, 10);
  const own = (going.data ?? []).filter((g) => !g.event_id && g.local_date >= today);
  return (
    <>
      {concerts.length === 0 && own.length === 0 ? (
        <p className="empty">Keine Konzerte deiner Artists in der Schweiz gefunden. Neue Termine erscheinen hier und im Kalender-Abo.</p>
      ) : (
        <ul className="list">
          {concerts.map((c) => {
            const d = dayMonth(c.local_date);
            const entry = mine.get(c.event_id);
            const friends = friendsAt(c.event_id);
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
                    {entry && <span className="badge badge--accent">Du gehst hin</span>}
                  </div>
                  {friends.length > 0 && <span className="reason">Konzert-Buddy: {friends.join(', ')} hört {c.artist} auch oft</span>}
                  {c.name !== c.artist && <span className="reason">{c.name}</span>}
                </div>
                <div className="row-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-compact"
                    aria-pressed={Boolean(entry)}
                    disabled={add.isPending || remove.isPending}
                    onClick={() =>
                      entry ? remove.mutate(entry.id) : add.mutate({ event_id: c.event_id, artist: c.artist, local_date: c.local_date, venue: c.venue, city: c.city })
                    }
                  >
                    {entry ? 'Doch nicht' : 'Ich gehe hin'}
                  </button>
                  {c.url && (
                    <a className="button-link btn-compact" href={c.url} target="_blank" rel="noopener noreferrer">
                      Tickets
                    </a>
                  )}
                </div>
              </li>
            );
          })}
          {own.map((g) => {
            const d = dayMonth(g.local_date);
            return (
              <li key={g.id} className="title-row concert-row">
                <span className="date-badge" aria-hidden="true">
                  <span className="date-badge-day">{d.day}</span>
                  <span className="date-badge-month">{d.month}</span>
                </span>
                <div className="title-main">
                  <span className="title-name">{g.artist}</span>
                  <div className="meta">
                    {g.city && <span>{g.city}</span>}
                    <span className="badge badge--accent">Du gehst hin</span>
                  </div>
                </div>
                <button type="button" className="btn-ghost btn-compact" disabled={remove.isPending} onClick={() => remove.mutate(g.id)}>
                  Entfernen
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <ConcertForm busy={add.isPending} onSave={(entry) => add.mutate(entry)} />
      <p className="caption">Konzerte, bei denen du dabei bist, erscheinen im Kalender und im Rückblick.</p>
    </>
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

  const connected = Boolean(settings.data?.lastfm_username || settings.data?.statsfm_username || spotify.data);
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

  const today = new Date().toISOString().slice(0, 10);
  const releases = feed.data?.filter((f) => f.source !== 'score_bridge');
  const released = releases?.filter((f) => !f.release_date || f.release_date <= today);
  const upcoming = releases?.filter((f) => f.release_date > today).sort((a, b) => a.release_date.localeCompare(b.release_date)) ?? [];
  const filmMusic = feed.data?.filter((f) => f.source === 'score_bridge') ?? [];

  const updated = artists.data?.[0]?.updated_at ? new Date(artists.data[0].updated_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : null;

  if (settings.isError) return <Messages error={errorMessage(settings.error)} />;
  if (loading) return <CardSkeleton />;

  return (
    <>
      <div className="page-head">
        <PageTitle area="music" id="music-title">
          Musik
        </PageTitle>
        {connected && (
          <button className="btn-compact" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            <RefreshCw size={16} aria-hidden="true" />
            {refresh.isPending ? 'Wird gesucht …' : 'Neu suchen'}
          </button>
        )}
      </div>
      {!connected ? (
        <section className="card" aria-labelledby="connect-title">
          <h2 id="connect-title">
            Verbinde deine Musik
          </h2>
          <p className="muted">Mit deinem Last.fm- oder stats.fm-Namen findet die App jeden Tag neue Alben deiner Lieblings-Artists und ähnlicher Bands – und Konzerte in der Schweiz.</p>
          <MusicSources />
        </section>
      ) : (
        <>
          <section className="card" aria-labelledby="releases-title">
            <div className="card-head">
              <h2 id="releases-title">
                Neu erschienen für dich
              </h2>
              {updated && <span className="caption">Stand {updated}</span>}
            </div>
            {feed.isError ? (
              <Messages error={errorMessage(feed.error)} />
            ) : !released ? (
              <TitleRowSkeleton rows={3} />
            ) : released.length === 0 ? (
              <p className="empty">
                {artists.data?.length ? 'In den letzten 30 Tagen ist von deinen Artists nichts Neues erschienen.' : 'Noch nichts berechnet. „Neu suchen“ holt deine Hördaten.'}
              </p>
            ) : (
              <ul className="list">
                {released.map((f) => (
                  <AlbumRow key={f.id} entry={f} pending={pending === f.id} onFeedback={feedback} />
                ))}
              </ul>
            )}
          </section>
          {filmMusic.length > 0 && (
            <section className="card" aria-labelledby="film-music-title">
              <h2 id="film-music-title">Aus deinen Lieblingsfilmen</h2>
              <p className="muted">Die Musik hinter Filmen und Serien, die du mit 9 oder 10 bewertet hast.</p>
              <ul className="list">
                {filmMusic.map((f) => (
                  <AlbumRow key={f.id} entry={f} pending={pending === f.id} onFeedback={feedback} />
                ))}
              </ul>
            </section>
          )}
          {upcoming.length > 0 && (
            <section className="card" aria-labelledby="upcoming-title">
              <h2 id="upcoming-title">Demnächst</h2>
              <ul className="list">
                {upcoming.map((f) => (
                  <AlbumRow key={f.id} entry={f} pending={pending === f.id} onFeedback={feedback} />
                ))}
              </ul>
            </section>
          )}
          <section className="card" aria-labelledby="concerts-title">
            <h2 id="concerts-title">
              Konzerte in der Schweiz
            </h2>
            {concerts.isError ? <Messages error={errorMessage(concerts.error)} /> : concerts.data ? <Concerts concerts={concerts.data} /> : <TitleRowSkeleton rows={2} />}
          </section>
          {artists.data?.length > 0 && <MusicProfile artists={artists.data} />}
        </>
      )}
    </>
  );
}
