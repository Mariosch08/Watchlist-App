import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../auth/AuthContext.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { fetchProgress, fetchSeason, fetchSeriesOverview, markEpisodes, saveNextUp, startTracking, unmarkEpisodes } from '../lib/api/series.js';
import { addTitle, updateItem } from '../lib/api/watchlist.js';
import { errorMessage } from '../lib/errors.js';
import { titleKey } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';
import { episodeKey, nextUp, progressStats } from '../lib/series.js';

export function useSeriesOverview() {
  const user = useUser();
  return useQuery({ queryKey: queryKeys.seriesOverview(user?.id), queryFn: fetchSeriesOverview, enabled: Boolean(user) });
}

export function useSeriesProgress(tmdbId) {
  const user = useUser();
  return useQuery({
    queryKey: queryKeys.seriesProgress(user?.id, tmdbId),
    queryFn: () => fetchProgress(tmdbId),
    enabled: Boolean(user),
    select: (data) => ({ ...data, watched: new Set(data.episodes.map((e) => episodeKey(e.season_number, e.episode_number))) }),
  });
}

export function useSeason(tmdbId, seasonNumber, enabled) {
  return useQuery({
    queryKey: queryKeys.season(tmdbId, seasonNumber),
    queryFn: () => fetchSeason(tmdbId, seasonNumber),
    enabled,
    staleTime: 6 * 60 * 60_000,
  });
}

/**
 * Marks/unmarks episodes optimistically. Side effects that make the rest of the app consistent:
 * starts tracking, puts the series on the watchlist as "Am Schauen", stores "Als Nächstes",
 * and marks a finished, ended series as "Gesehen".
 */
export function useEpisodeMutation(details) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const progressKey = queryKeys.seriesProgress(user?.id, details.tmdb_id);
  const listKey = queryKeys.watchlist(user?.id);

  return useMutation({
    scope: { id: `series-${details.tmdb_id}` },
    mutationFn: async ({ episodes, watched }) => {
      await startTracking(details);
      if (watched) await markEpisodes(details.tmdb_id, episodes);
      else await unmarkEpisodes(details.tmdb_id, episodes);

      const data = queryClient.getQueryData(progressKey);
      const set = new Set((data?.episodes ?? []).map((e) => episodeKey(e.season_number, e.episode_number)));
      await saveNextUp(details.tmdb_id, nextUp(details.seasons ?? [], set, details.last_episode_to_air));

      // Keep the watchlist status in step with the progress.
      const list = queryClient.getQueryData(listKey) ?? [];
      const entry = list.find((x) => titleKey(x) === titleKey(details));
      const stats = progressStats(details.seasons ?? [], set, details.last_episode_to_air);
      const finished = stats.aired > 0 && stats.remaining === 0 && ['Ended', 'Canceled'].includes(details.tmdb_status);
      let saved = null;
      if (!entry && watched) saved = (await addTitle(details, { status: finished ? 'completed' : 'watching' })).item;
      else if (entry && watched && (entry.status === 'planned' || (finished && entry.status === 'watching'))) {
        saved = await updateItem(entry, { status: finished ? 'completed' : 'watching' });
      }
      return { saved, finished };
    },
    onMutate: async ({ episodes, watched }) => {
      await queryClient.cancelQueries({ queryKey: progressKey });
      const previous = queryClient.getQueryData(progressKey);
      const keys = new Set(episodes.map((e) => episodeKey(e.season_number, e.episode_number)));
      queryClient.setQueryData(progressKey, (data) => {
        const base = data ?? { tracking: true, episodes: [] };
        const rest = base.episodes.filter((e) => !keys.has(episodeKey(e.season_number, e.episode_number)));
        const added = watched ? episodes.map((e) => ({ ...e, watched_at: new Date().toISOString() })) : [];
        return { ...base, tracking: true, episodes: [...rest, ...added] };
      });
      return { previous };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(progressKey, context?.previous);
      toast.error(`Fortschritt konnte nicht gespeichert werden. ${errorMessage(err)}`);
    },
    onSuccess: ({ saved, finished }) => {
      if (saved) {
        queryClient.setQueryData(listKey, (list) => (list ? [saved, ...list.filter((x) => titleKey(x) !== titleKey(saved))] : list));
      }
      if (finished) toast.success(`„${details.title}“ fertig geschaut – als „Gesehen“ markiert.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.seriesOverview(user?.id) });
    },
  });
}
