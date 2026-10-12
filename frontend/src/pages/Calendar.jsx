import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Copy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useSeriesOverview } from '../hooks/useSeries.js';
import { useWatchlist } from '../hooks/useWatchlist.js';
import { calendarUrl, fetchSettings, regenerateCalendarToken, webcalUrl } from '../lib/api/settings.js';
import { errorMessage } from '../lib/errors.js';
import { episodeCode } from '../lib/series.js';
import { queryKeys } from '../lib/queryClient.js';

const DAYS = 30;
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });

export function upcomingEvents(series, watchlist, today = new Date()) {
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + DAYS * 86_400_000).toISOString().slice(0, 10);
  const events = [];
  for (const s of series ?? []) {
    const ep = s.next_episode_to_air;
    if (ep?.air_date && ep.air_date >= from && ep.air_date <= to && s.watch_status !== 'dropped') {
      events.push({ date: ep.air_date, key: `tv-${s.tmdb_id}`, to: `/title/tv/${s.tmdb_id}`, title: s.title ?? 'Serie', detail: `${episodeCode(ep.season_number, ep.episode_number)}${ep.name ? ` · ${ep.name}` : ''}` });
    }
  }
  for (const m of watchlist ?? []) {
    if (m.media_type === 'movie' && m.status === 'planned' && m.release_date >= from && m.release_date <= to) {
      events.push({ date: m.release_date, key: `movie-${m.tmdb_id}`, to: `/title/movie/${m.tmdb_id}`, title: m.title, detail: 'Filmstart' });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function Subscribe() {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const regenerate = useMutation({
    mutationFn: regenerateCalendarToken,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings(user.id) });
      toast.success('Neuer Kalender-Link erstellt. Der alte funktioniert nicht mehr.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const token = settings.data?.calendar_token;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(calendarUrl(token));
      toast.success('Kalender-Link kopiert.');
    } catch {
      toast.error('Kopieren nicht möglich.');
    }
  };
  return (
    <section className="card" aria-labelledby="subscribe-title">
      <h2 id="subscribe-title">Im eigenen Kalender abonnieren</h2>
      <p className="muted">
        Neue Folgen deiner Serien und Filmstarts aus deiner Watchlist erscheinen automatisch in Google Kalender, Apple Kalender oder Outlook. Der Link ist
        privat – teile ihn nicht.
      </p>
      {settings.isError && <Messages error={errorMessage(settings.error)} />}
      {token && (
        <div className="actions">
          <a className="button-link btn-primary" href={webcalUrl(token)}>
            <CalendarPlus size={16} aria-hidden="true" /> Kalender abonnieren
          </a>
          <button onClick={copy}>
            <Copy size={16} aria-hidden="true" /> Link kopieren
          </button>
          <button className="btn-ghost" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
            Neuen Link erstellen
          </button>
        </div>
      )}
      <p className="caption">Google Kalender: „Weitere Kalender“ → „Per URL“ → kopierten Link einfügen.</p>
    </section>
  );
}

export default function CalendarPage() {
  useDocumentTitle('Kalender');
  const series = useSeriesOverview();
  const watchlist = useWatchlist();
  const loading = !series.data || !watchlist.data;
  const events = loading ? [] : upcomingEvents(series.data, watchlist.data);
  const byDay = events.reduce((acc, e) => acc.set(e.date, [...(acc.get(e.date) ?? []), e]), new Map());
  return (
    <>
      <section className="card" aria-labelledby="calendar-title">
        <h1 id="calendar-title" tabIndex={-1}>
          Kalender
        </h1>
        <p className="muted">Die nächsten {DAYS} Tage: neue Folgen deiner Serien und Filmstarts aus deiner Watchlist.</p>
        {series.isError || watchlist.isError ? (
          <Messages error={errorMessage(series.error ?? watchlist.error)} />
        ) : loading ? (
          <CardSkeleton />
        ) : events.length === 0 ? (
          <p className="empty">
            In den nächsten {DAYS} Tagen erscheint nichts. Verfolge Serien, indem du auf ihrer Detailseite Folgen abhakst – zum Beispiel über die{' '}
            <Link to="/">Watchlist</Link>.
          </p>
        ) : (
          <div className="calendar">
            {[...byDay].map(([date, list]) => (
              <div key={date} className="calendar-day">
                <h3>{dayLabel(date)}</h3>
                <ul className="list">
                  {list.map((e) => (
                    <li key={e.key} className="title-row">
                      <div className="title-main">
                        <Link className="title-name title-link" to={e.to}>
                          {e.title}
                        </Link>
                        <span className="meta">{e.detail}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
      <Subscribe />
    </>
  );
}
