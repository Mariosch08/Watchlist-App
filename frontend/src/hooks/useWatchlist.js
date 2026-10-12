import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useUser } from '../auth/AuthContext.jsx';
import { addTitle, fetchWatchlist, removeItem, restoreItem, updateItem } from '../lib/api/watchlist.js';
import { errorMessage } from '../lib/errors.js';
import { STATUS_LABEL, titleKey } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';
import { applyChange, DERIVED_FIELDS } from '../lib/watchlistRules.js';
import { useToast } from '../components/toast/ToastProvider.jsx';

export function useWatchlist() {
  const user = useUser();
  return useQuery({ queryKey: queryKeys.watchlist(user?.id), queryFn: fetchWatchlist, enabled: Boolean(user) });
}

// Helpers that edit the cached list in place (one row at a time, never the whole snapshot).
function useListCache() {
  const queryClient = useQueryClient();
  const user = useUser();
  const key = queryKeys.watchlist(user?.id);
  return {
    key,
    queryClient,
    get: () => queryClient.getQueryData(key),
    patch: (k, fn) => queryClient.setQueryData(key, (list) => list?.map((x) => (titleKey(x) === k ? fn(x) : x))),
    upsert: (item) =>
      queryClient.setQueryData(key, (list) => (list ? [item, ...list.filter((x) => titleKey(x) !== titleKey(item))] : list)),
    drop: (k) => queryClient.setQueryData(key, (list) => list?.filter((x) => titleKey(x) !== k)),
  };
}

export function useAddTitle() {
  const cache = useListCache();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ result, status }) => addTitle(result, { status }),
    onSuccess: ({ item, existed }) => {
      if (!item) return;
      cache.upsert(item);
      toast.success(existed ? `„${item.title}“ ist bereits in deiner Watchlist.` : `„${item.title}“ hinzugefügt.`);
    },
    onError: (err, { result }) => toast.error(`„${result.title}“ konnte nicht hinzugefügt werden. ${errorMessage(err)}`),
  });
}

// Optimistic status/rating update for one row. Rolls back only this row's fields on failure.
export function useUpdateItem(item) {
  const cache = useListCache();
  const toast = useToast();
  const self = useRef(null);
  const k = titleKey(item);
  const mutationKey = ['watchlist-row', k];
  const mutation = useMutation({
    mutationKey,
    scope: { id: k }, // edits of the same row reach the server in order
    mutationFn: ({ changes }) => updateItem(item, changes),
    onMutate: async ({ changes }) => {
      await cache.queryClient.cancelQueries({ queryKey: cache.key });
      const current = cache.get()?.find((x) => titleKey(x) === k) ?? item;
      const previous = Object.fromEntries(DERIVED_FIELDS.map((f) => [f, current[f]]));
      cache.patch(k, (x) => applyChange(x, changes));
      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) cache.patch(k, (x) => ({ ...x, ...context.previous }));
      toast.error(`„${item.title}“ konnte nicht gespeichert werden. ${errorMessage(err)}`, {
        action: { label: 'Erneut versuchen', onClick: () => self.current?.mutate(variables) },
      });
    },
    onSuccess: (saved, variables, context) => {
      if (!saved) {
        cache.drop(k);
        toast.info(`„${item.title}“ ist nicht mehr in deiner Watchlist.`);
        return;
      }
      // A later edit of the same row is still pending: keep its optimistic value until it lands.
      if (cache.queryClient.isMutating({ mutationKey }) <= 1) cache.patch(k, () => saved);
      // Status changes can move the row to another tab: say where it went and offer undo.
      const before = context?.previous;
      if (before && saved.status !== before.status && !variables.undo) {
        toast.success(`„${saved.title}“: ${STATUS_LABEL[saved.status]}`, {
          replace: `status-${k}`,
          action: {
            label: 'Rückgängig',
            onClick: () => self.current?.mutate({ changes: { status: before.status, my_rating: before.my_rating, watched_at: before.watched_at }, undo: true }),
          },
        });
      }
    },
  });
  self.current = mutation;
  return mutation;
}

// Removes a row at once and offers undo (re-inserts the full snapshot, incl. rating and dates).
// List-level hook: the row component unmounts as soon as the row is gone.
export function useRemoveItem() {
  const cache = useListCache();
  const toast = useToast();
  const restore = useMutation({
    mutationFn: (snapshot) => restoreItem(snapshot),
    onSuccess: (restored) => {
      cache.upsert(restored);
      toast.success(`„${restored.title}“ ist wieder in deiner Watchlist.`);
    },
    onError: (err) => toast.error(`Wiederherstellen fehlgeschlagen. ${errorMessage(err)}`),
  });
  return useMutation({
    mutationFn: (item) => removeItem(item),
    onMutate: async (item) => {
      await cache.queryClient.cancelQueries({ queryKey: cache.key });
      const k = titleKey(item);
      const snapshot = cache.get()?.find((x) => titleKey(x) === k) ?? item;
      cache.drop(k);
      return { snapshot };
    },
    onError: (err, item, context) => {
      if (context?.snapshot) cache.upsert(context.snapshot);
      toast.error(`„${item.title}“ konnte nicht entfernt werden. ${errorMessage(err)}`);
    },
    onSuccess: (data, item, context) => {
      toast.success(`„${item.title}“ entfernt.`, {
        duration: 8000,
        action: { label: 'Rückgängig', onClick: () => restore.mutate(context.snapshot) },
      });
    },
  });
}
