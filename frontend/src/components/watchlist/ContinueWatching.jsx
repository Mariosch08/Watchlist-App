import { Link } from 'react-router-dom';
import { useSeriesOverview } from '../../hooks/useSeries.js';
import { useUpdateItem } from '../../hooks/useWatchlist.js';
import { formatDate, POSTER_LARGE_BASE } from '../../lib/labels.js';
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
        <h2 id="continue-title">Weiterschauen</h2>
        <Link to="/calendar" className="head-link">
          Kalender
        </Link>
      </div>
      <ul className="rail">
        {rows.map((r) => {
          const forgotten = isForgotten(r);
          const next = r.next_up_season ? episodeCode(r.next_up_season, r.next_up_episode) : null;
          const upcoming = r.next_episode_to_air;
          const progress = r.number_of_episodes ? Math.min(1, r.watched_count / r.number_of_episodes) : 0;
          return (
            <li key={r.tmdb_id} className="rail-item">
              <Link className="poster-card" to={`/title/tv/${r.tmdb_id}`}>
                {r.poster_path ? <img className="poster-large" src={POSTER_LARGE_BASE + r.poster_path} alt="" loading="lazy" /> : <span className="poster-large poster-fallback" aria-hidden="true">{r.title}</span>}
                <span className="rail-progress" aria-hidden="true">
                  <span style={{ '--progress': progress }} />
                </span>
                <span className="poster-card-title">{r.title}</span>
                <span className="poster-card-meta">
                  {next ? `Weiter mit ${next}` : 'Alles gesehen'}
                  {upcoming?.air_date && !next ? ` · neu am ${formatDate(upcoming.air_date)}` : ''}
                </span>
              </Link>
              {forgotten && (
                <>
                  <span className="caption">Seit {daysSince(r.last_watched_at ?? r.started_at)} Tagen pausiert?</span>
                  <ForgottenActions row={r} />
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
