import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUser } from '../../auth/AuthContext.jsx';
import { fetchProviders } from '../../lib/api/discovery.js';
import { fetchSettings, updateSettings } from '../../lib/api/settings.js';
import { errorMessage } from '../../lib/errors.js';
import { queryKeys } from '../../lib/queryClient.js';
import { Messages } from '../Form.jsx';
import { useToast } from '../toast/ToastProvider.jsx';

const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';
const SHOWN = 18;

// Streaming subscriptions (Switzerland). Recommendations prefer titles on these services.
export default function StreamingCard() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = queryKeys.settings(user.id);
  const settings = useQuery({ queryKey: key, queryFn: fetchSettings });
  const providers = useQuery({ queryKey: ['providers', 'CH'], queryFn: fetchProviders, staleTime: 24 * 60 * 60_000 });
  const save = useMutation({
    mutationFn: (ids) => updateSettings({ streaming_providers: ids }),
    onMutate: (ids) => queryClient.setQueryData(key, (s) => (s ? { ...s, streaming_providers: ids } : s)),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.error(`Nicht gespeichert. ${errorMessage(err)}`);
    },
  });
  const selected = new Set(settings.data?.streaming_providers ?? []);
  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    save.mutate([...next]);
  };
  const list = (providers.data ?? []).slice(0, SHOWN);
  return (
    <section className="card" aria-labelledby="streaming-title">
      <h2 id="streaming-title">
        Meine Streaming-Dienste
      </h2>
      <p className="muted">Vorschläge und „Was schauen wir heute?“ bevorzugen Titel, die du mit deinen Abos in der Schweiz schauen kannst.</p>
      {providers.isError || settings.isError ? (
        <Messages error={errorMessage(providers.error ?? settings.error)} />
      ) : !providers.data || !settings.data ? (
        <span className="skeleton skeleton--line skeleton--long" aria-label="Wird geladen" />
      ) : (
        <div className="provider-grid" role="group" aria-label="Streaming-Dienste">
          {list.map((p) => (
            <label key={p.id} className={`provider-option${selected.has(p.id) ? ' is-selected' : ''}`}>
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              {p.logo_path && <img src={LOGO_BASE + p.logo_path} alt="" width="32" height="32" loading="lazy" />}
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      )}
      <p className="caption">Streaming-Daten: JustWatch via TMDb.</p>
    </section>
  );
}
