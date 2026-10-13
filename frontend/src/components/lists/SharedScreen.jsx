import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchNightScreen, listKeys } from '../../lib/api/lists.js';
import { fetchTitleDetails } from '../../lib/api/tmdb.js';
import { detailPath } from '../../lib/labels.js';
import { queryKeys } from '../../lib/queryClient.js';
import { screenLine, sharedScreen } from '../../lib/sharedScreen.js';

// Who is coming, what nobody of them has seen yet, and whose subscription plays it.
export default function SharedScreen({ nightId, ranked }) {
  const people = useQuery({ queryKey: listKeys.screen(nightId), queryFn: () => fetchNightScreen(nightId) });
  const seen = useMemo(() => new Set((people.data ?? []).flatMap((p) => p.seen ?? [])), [people.data]);
  const candidates = useMemo(() => ranked.filter((t) => !seen.has(`${t.media_type}:${t.tmdb_id}`)).slice(0, 5), [ranked, seen]);
  const details = useQueries({
    queries: candidates.map((t) => ({
      queryKey: queryKeys.details(t.media_type, String(t.tmdb_id)),
      queryFn: () => fetchTitleDetails(t.media_type, t.tmdb_id),
      staleTime: 60 * 60_000,
      enabled: Boolean(people.data),
    })),
  });
  const providers = new Map(candidates.map((t, i) => [`${t.media_type}:${t.tmdb_id}`, details[i]?.data?.providers?.flatrate]));
  if (!people.data?.length || !ranked.length) return null;
  const screen = sharedScreen({ people: people.data, ranked, providers });
  return (
    <div className="shared-screen">
      <h4>Gemeinsamer Bildschirm</h4>
      <p className="caption">
        {screen.attending ? 'Für alle, die zugesagt haben' : 'Für alle in der Liste'}: {screen.group.map((p) => (p.is_me ? 'du' : p.display_name)).join(', ')}.
      </p>
      {screen.entries.length === 0 ? (
        <p className="empty">Alles auf der Liste hat schon jemand aus der Runde gesehen.</p>
      ) : (
        <ul className="screen-list">
          {screen.entries.map((e) => (
            <li key={e.key}>
              <Link to={detailPath(e.item)}>{e.item.title}</Link> <span className="muted">– {screenLine(e)}</span>
            </li>
          ))}
        </ul>
      )}
      {screen.skipped.length > 0 && (
        <p className="caption">
          Schon gesehen: {screen.skipped.slice(0, 3).map((s) => `${s.item.title} (${s.by.join(', ')})`).join(' · ')}
          {screen.skipped.length > 3 ? ` und ${screen.skipped.length - 3} weitere` : ''}.
        </p>
      )}
      {screen.hidden.length > 0 && <p className="caption">{screen.hidden.join(', ')} teilt die eigenen Abos nicht – einstellbar im Profil unter „Mit Freunden teilen“.</p>}
    </div>
  );
}
