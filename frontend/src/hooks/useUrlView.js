import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { normalizeView, viewToParams } from '../lib/watchlistView.js';

// Watchlist view state (segment, type, sort, text) lives in the URL: reload, back and links keep it.
export function useUrlView() {
  const [params, setParams] = useSearchParams();
  const view = useMemo(() => normalizeView(params), [params]);
  const setView = useCallback(
    (patch) =>
      setParams(
        (current) => {
          const base = normalizeView(current);
          const next = { ...base, ...patch };
          // Switching the segment resets the sort to that segment's default.
          if (patch.segment && !patch.sort) next.sort = normalizeView({ s: patch.segment }).sort;
          return viewToParams(next);
        },
        { replace: true, preventScrollReset: true },
      ),
    [setParams],
  );
  return [view, setView];
}
