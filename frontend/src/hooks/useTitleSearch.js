import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MIN_QUERY_LENGTH, searchTitles } from '../lib/api/tmdb.js';
import { queryKeys } from '../lib/queryClient.js';

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export const normalizeQuery = (q) => q.trim().replace(/\s+/g, ' ');

// TMDb search as you type. Results are keyed by the query, so late responses for an
// older query can never overwrite newer results.
export function useTitleSearch(rawQuery) {
  const query = normalizeQuery(useDebouncedValue(rawQuery));
  const enabled = query.length >= MIN_QUERY_LENGTH;
  const result = useInfiniteQuery({
    queryKey: queryKeys.search(query.toLowerCase()),
    queryFn: ({ pageParam }) => searchTitles(query, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < Math.min(last.total_pages, 20) ? last.page + 1 : undefined),
    enabled,
    staleTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  });
  const results = enabled ? (result.data?.pages.flatMap((p) => p.results) ?? []) : [];
  const settledQuery = normalizeQuery(rawQuery) === query;
  return { ...result, query, enabled, results, settled: settledQuery && !result.isFetching };
}
