import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { TitleRowSkeleton } from '../components/Skeleton.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { deleteNotification, fetchNotifications, markAllRead } from '../lib/api/notifications.js';
import { errorMessage } from '../lib/errors.js';
import { queryKeys } from '../lib/queryClient.js';

const timeLabel = (iso) => new Date(iso).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const linkFor = (n) => {
  if (n.data?.media_type && n.data?.tmdb_id) return `/title/${n.data.media_type}/${n.data.tmdb_id}`;
  return typeof n.data?.path === 'string' && /^\/[a-z]/.test(n.data.path) ? n.data.path : null;
};

export function useNotifications() {
  const user = useUser();
  return useQuery({ queryKey: queryKeys.notifications(user?.id), queryFn: fetchNotifications, enabled: Boolean(user), refetchInterval: 5 * 60_000 });
}

export default function NotificationsPage() {
  useDocumentTitle('Benachrichtigungen');
  const user = useUser();
  const queryClient = useQueryClient();
  const key = queryKeys.notifications(user.id);
  const list = useNotifications();
  const readAll = useMutation({
    mutationFn: markAllRead,
    onMutate: () => queryClient.setQueryData(key, (l) => l?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (id) => deleteNotification(id),
    onMutate: (id) => queryClient.setQueryData(key, (l) => l?.filter((n) => n.id !== id)),
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const unread = (list.data ?? []).filter((n) => !n.read_at).length;
  return (
    <section className="card" aria-labelledby="notifications-title">
      <div className="card-head">
        <PageTitle area="notifications" id="notifications-title">
          Benachrichtigungen
        </PageTitle>
        {unread > 0 && (
          <button className="btn-compact" onClick={() => readAll.mutate()}>
            Alle als gelesen markieren
          </button>
        )}
      </div>
      {list.isError ? (
        <Messages error={errorMessage(list.error)} />
      ) : !list.data ? (
        <TitleRowSkeleton rows={3} />
      ) : list.data.length === 0 ? (
        <p className="empty">Noch keine Benachrichtigungen. Neue Staffeln und Folgen deiner Serien erscheinen hier.</p>
      ) : (
        <ul className="list">
          {list.data.map((n) => {
            const to = linkFor(n);
            return (
              <li key={n.id} className={`title-row${n.read_at ? '' : ' unread'}`}>
                <div className="title-main">
                  {to ? (
                    <Link className="title-name title-link" to={to}>
                      {n.title}
                    </Link>
                  ) : (
                    <span className="title-name">{n.title}</span>
                  )}
                  <span className="meta">
                    {!n.read_at && <span className="badge badge--accent">Neu</span>}
                    {n.body && <span>{n.body}</span>}
                    <span>{timeLabel(n.created_at)}</span>
                  </span>
                </div>
                <button className="btn-ghost btn-compact" onClick={() => remove.mutate(n.id)}>
                  Entfernen
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
