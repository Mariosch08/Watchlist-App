import { useQuery } from '@tanstack/react-query';
import { fetchTitleDetails } from '../lib/api/tmdb.js';
import { queryKeys } from '../lib/queryClient.js';

const DAY = 24 * 60 * 60_000;

// TMDb data of one title. The server caches it for 24 h, so the browser keeps it as long.
export function useTitleDetails(mediaType, tmdbId, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.details(mediaType, Number(tmdbId)),
    queryFn: () => fetchTitleDetails(mediaType, tmdbId),
    enabled,
    staleTime: DAY,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });
}
