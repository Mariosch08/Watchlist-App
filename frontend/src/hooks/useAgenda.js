import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { buildAgenda } from '../../../supabase/functions/_shared/agenda.ts';
import { sanitizePlan } from '../../../supabase/functions/_shared/rotation.ts';
import { useUser } from '../auth/AuthContext.jsx';
import { fetchConcertLog, fetchConcerts, fetchMusicFeed } from '../lib/api/music.js';
import { fetchCatchups } from '../lib/api/series.js';
import { fetchRotationPlan } from '../lib/api/streaming.js';
import { queryKeys } from '../lib/queryClient.js';
import { useSeriesOverview } from './useSeries.js';
import { useWatchlist } from './useWatchlist.js';

// The same agenda as the calendar subscription (see _shared/agenda.ts), from the app's cached data.
export function useAgenda(days = 30) {
  const user = useUser();
  const series = useSeriesOverview();
  const watchlist = useWatchlist();
  const concerts = useQuery({ queryKey: queryKeys.music(user.id, 'concerts'), queryFn: fetchConcerts });
  const going = useQuery({ queryKey: queryKeys.music(user.id, 'going'), queryFn: fetchConcertLog });
  const feed = useQuery({ queryKey: queryKeys.music(user.id, 'feed'), queryFn: fetchMusicFeed });
  const rotation = useQuery({ queryKey: ['rotation', user.id], queryFn: fetchRotationPlan });
  const catchups = useQuery({ queryKey: ['catchups', user.id], queryFn: fetchCatchups });
  const core = [series, watchlist];
  const today = new Date().toISOString().slice(0, 10);
  const items = useMemo(() => {
    if (!series.data || !watchlist.data) return null;
    const done = new Set(watchlist.data.filter((w) => w.status === 'completed').map((w) => `${w.media_type}:${w.tmdb_id}`));
    return buildAgenda(
      {
        series: series.data,
        watchlist: watchlist.data,
        concerts: concerts.data ?? [],
        going: going.data ?? [],
        albums: (feed.data ?? []).filter((f) => f.release_date > today && f.source !== 'score_bridge'),
        rotation: sanitizePlan(rotation.data?.months),
        done,
        dismissedCatchUps: new Set((catchups.data ?? []).filter((c) => c.dismissed).map((c) => `${c.tmdb_id}:${c.season_number}`)),
      },
      { today, days },
    );
  }, [series.data, watchlist.data, concerts.data, going.data, feed.data, rotation.data, catchups.data, today, days]);
  return { items, error: core.find((q) => q.isError)?.error ?? null, catchups };
}
