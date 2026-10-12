import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUser } from '../../auth/AuthContext.jsx';
import { useAlerts } from '../../hooks/useAlerts.js';
import { fetchSettings } from '../../lib/api/settings.js';
import { queryKeys } from '../../lib/queryClient.js';

// "Sag mir, wenn es auf meinen Diensten kommt" – shown when the title is not on any of my services yet.
export default function AvailabilityAlert({ details }) {
  const user = useUser();
  const settings = useQuery({ queryKey: queryKeys.settings(user?.id), queryFn: fetchSettings, enabled: Boolean(user) });
  const { alerts, add, remove } = useAlerts();
  const mine = new Set(settings.data?.streaming_providers ?? []);
  const flatrate = details.providers?.flatrate ?? [];
  const onMine = flatrate.filter((p) => mine.has(p.id));
  const alert = (alerts.data ?? []).find((a) => a.media_type === details.media_type && a.tmdb_id === details.tmdb_id);
  if (!settings.data) return null;
  if (onMine.length) {
    return <p className="notice notice--success">Mit deinen Abos verfügbar: {onMine.map((p) => p.name).join(', ')}.</p>;
  }
  if (alert && !alert.notified_at) {
    return (
      <div className="actions">
        <span className="badge badge--accent">
          <BellRing size={12} aria-hidden="true" /> Alarm aktiv
        </span>
        <button className="btn-ghost btn-compact" onClick={() => remove.mutate(details)}>
          Alarm entfernen
        </button>
      </div>
    );
  }
  return (
    <div className="stack">
      <div className="actions">
        <button className="btn-compact" disabled={add.isPending} onClick={() => add.mutate({ media_type: details.media_type, tmdb_id: details.tmdb_id, title: details.title })}>
          <BellRing size={16} aria-hidden="true" />
          {mine.size ? 'Benachrichtigen, wenn auf meinen Diensten' : 'Benachrichtigen, wenn im Abo verfügbar'}
        </button>
      </div>
      {mine.size === 0 && (
        <p className="caption">
          Tipp: Wähle unter <Link to="/profile">Profil</Link> deine Streaming-Dienste.
        </p>
      )}
    </div>
  );
}
