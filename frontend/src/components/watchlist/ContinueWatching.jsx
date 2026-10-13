import { Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSeriesOverview } from '../../hooks/useSeries.js';
import { useUpdateItem } from '../../hooks/useWatchlist.js';
import { formatDate, POSTER_BASE } from '../../lib/labels.js';
import { daysSince, episodeCode, isForgotten } from '../../lib/series.js';

function ForgottenActions({ row }) {
  const update = useUpdateItem({ media_type: 'tv', tmdb_id: row.tmdb_id, title: row.title });
  return (
    <div className="row-actions">
      <button className="btn-ghost btn-compact" disabled={update.isPending} onClick={() => update.mutate({ changes: { status: 'paused' } })}>
        Pausieren
      </button>
      <button className="btn-ghost btn-compact" disabled={update.isPending} onClick={() => update.mutate({ changes: { status: 'dropped' } })}>
        Abbrechen
      </button>
    </div>
  );
}

// "Weiterschauen": series in progress with the next episode, plus a nudge for forgotten ones.
export default function ContinueWatching() {
  const overview = useSeriesOverview();
  const rows = (overview.data ?? [])
    .filter((r) => r.watch_status === 'watching' && r.title)
    .sort((a, b) => (b.last_watched_at ?? b.started_at).localeCompare(a.last_watched_at ?? a.started_at))
    .slice(0, 6);
  if (rows.length === 0) return null;
  return (
    <section className="card" aria-labelledby="continue-title">
      <div className="card-head">
        <h2 id="continue-title">
          <Play size={18} aria-hidden="true" />
          Weiterschauen
        </h2>
        <Link to="/calendar" className="caption">
          Kalender
        </Link>
      </div>
      <ul className="list">
        {rows.map((r) => {
          const forgotten = isForgotten(r);
          const next = r.next_up_season ? episodeCode(r.next_up_season, r.next_up_episode) : null;
          const upcoming = r.next_episode_to_air;
          return (
            <li key={r.tmdb_id} className="title-row">
              {r.poster_path ? <img className="poster" src={POSTER_BASE + r.poster_path} alt="" loading="lazy" /> : <span className="poster" aria-hidden="true" />}
              <div className="title-main">
                <Link className="title-name title-link" to={`/title/tv/${r.tmdb_id}`}>
                  {r.title}
                </Link>
                <div className="meta">
                  {next ? <span>Als Nächstes {next}</span> : <span>Alles Erschienene gesehen</span>}
                  {upcoming?.air_date && <span>neue Folge am {formatDate(upcoming.air_date)}</span>}
                  {forgotten && <span className="badge">Seit {daysSince(r.last_watched_at ?? r.started_at)} Tagen nicht weitergeschaut</span>}
                </div>
              </div>
              {forgotten && <ForgottenActions row={r} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
