import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../auth/AuthContext.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { refreshMusic } from '../lib/api/music.js';
import { errorMessage } from '../lib/errors.js';
import { queryKeys } from '../lib/queryClient.js';

// Recomputes releases and concerts for me and reloads every music query.
export function useMusicRefresh() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: refreshMusic,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.music(user.id) });
      const parts = [`${res?.albums ?? 0} Neuerscheinungen`];
      if (res?.concerts) parts.push(`${res.concerts} Konzerte`);
      toast.success(res?.artists ? `${parts.join(' und ')} für ${res.artists} Artists gefunden.` : 'Noch keine Hördaten gefunden.');
    },
    onError: (err) => (err?.code === 'RATE_LIMITED' ? toast.info(errorMessage(err)) : toast.error(errorMessage(err))),
  });
}
