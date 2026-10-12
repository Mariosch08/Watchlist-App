import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '../auth/AuthContext.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { createAlert, deleteAlert, fetchAlerts } from '../lib/api/streaming.js';
import { errorMessage } from '../lib/errors.js';

export function useAlerts() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = ['alerts', user?.id];
  const alerts = useQuery({ queryKey: key, queryFn: fetchAlerts, enabled: Boolean(user) });
  const add = useMutation({
    mutationFn: createAlert,
    onSuccess: (_, t) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.success(`Du bekommst eine Nachricht, sobald „${t.title}“ auf deinen Streaming-Diensten ist.`);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: deleteAlert,
    onMutate: (t) => queryClient.setQueryData(key, (list) => list?.filter((a) => !(a.media_type === t.media_type && a.tmdb_id === t.tmdb_id))),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.error(errorMessage(err));
    },
  });
  return { alerts, add, remove };
}
