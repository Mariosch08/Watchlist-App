import { QueryClient } from '@tanstack/react-query';
import { isRetryable } from './errors.js';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 30 * 60_000,
        // Retry only transient problems (network, 5xx), never validation or permission errors.
        retry: (failureCount, error) => failureCount < 2 && isRetryable(error),
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();

// Query keys. Everything user-specific includes the user id so accounts never share cache entries.
export const queryKeys = {
  watchlist: (userId) => ['watchlist', userId],
  search: (query) => ['search', query],
  details: (mediaType, tmdbId) => ['details', mediaType, tmdbId],
  profile: (userId) => ['profile', userId],
  invites: (userId) => ['invites', userId],
  importJobs: (userId) => ['importJobs', userId],
  seriesOverview: (userId) => ['seriesOverview', userId],
  seriesProgress: (userId, tmdbId) => ['seriesProgress', userId, String(tmdbId)],
  season: (tmdbId, season) => ['season', String(tmdbId), season],
  settings: (userId) => ['settings', userId],
  notifications: (userId) => ['notifications', userId],
};
