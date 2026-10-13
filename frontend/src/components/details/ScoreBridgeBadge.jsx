import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listenedComposers, scoreReason } from '../../../../supabase/functions/_shared/bridge.ts';
import { useUser } from '../../auth/AuthContext.jsx';
import { fetchArtists } from '../../lib/api/music.js';
import { queryKeys } from '../../lib/queryClient.js';

// Score Bridge on the detail page: "Soundtrack von Jonny Greenwood – 312 Plays bei dir".
export default function ScoreBridgeBadge({ composers }) {
  const user = useUser();
  const artists = useQuery({ queryKey: queryKeys.music(user.id, 'artists'), queryFn: fetchArtists, enabled: Boolean(composers?.length), staleTime: 10 * 60_000 });
  const matches = listenedComposers(composers, artists.data);
  if (!matches.length) return null;
  return (
    <ul className="tags" aria-label="Musik, die du hörst">
      {matches.map((m) => (
        <li key={m.name}>
          <Link className="badge badge--accent" to="/music">
            {scoreReason(m)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
