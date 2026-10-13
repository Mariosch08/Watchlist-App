import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { KIND_LABEL } from '../../../../supabase/functions/_shared/agenda.ts';
import { useUser } from '../../auth/AuthContext.jsx';
import { useAgenda } from '../../hooks/useAgenda.js';
import { fetchMusicFeed } from '../../lib/api/music.js';
import { queryKeys } from '../../lib/queryClient.js';

const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric' });

// One glance across everything: the week ahead (same agenda as the calendar) and new music.
export default function WeekAhead() {
  const user = useUser();
  const { items } = useAgenda(7);
  const music = useQuery({ queryKey: queryKeys.music(user.id, 'feed'), queryFn: fetchMusicFeed });
  const today = new Date().toISOString().slice(0, 10);
  const albums = (music.data ?? []).filter((f) => f.source !== 'score_bridge' && (!f.release_date || f.release_date <= today)).slice(0, 3);
  if (!items?.length && !albums.length) return null;
  return (
    <div className="grid-2">
      {items?.length > 0 && (
        <section className="card" aria-labelledby="week-title">
          <div className="card-head">
            <h2 id="week-title">Diese Woche</h2>
            <Link className="head-link" to="/calendar">
              Kalender
            </Link>
          </div>
          <ul className="week-list">
            {items.slice(0, 6).map((i) => (
              <li key={i.uid}>
                <span className="caption">{weekday(i.date)}</span>
                <span>
                  <span className="badge">{KIND_LABEL[i.kind]}</span> {i.path ? <Link to={i.path}>{i.title}</Link> : i.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {albums.length > 0 && (
        <section className="card" aria-labelledby="ears-title">
          <div className="card-head">
            <h2 id="ears-title">Neu für deine Ohren</h2>
            <Link className="head-link" to="/music">
              Musik
            </Link>
          </div>
          <ul className="week-list">
            {albums.map((a) => (
              <li key={a.id}>
                <span className="caption">{a.data?.kind ?? 'Album'}</span>
                <span>
                  <Link to="/music">{a.title}</Link> <span className="muted">· {a.data?.artist ?? a.subtitle}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
