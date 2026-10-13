import { useQuery } from '@tanstack/react-query';
import { BellRing, PiggyBank, RefreshCw, Tv } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import TitleRow from '../components/TitleRow.jsx';
import { useAlerts } from '../hooks/useAlerts.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { fetchSettings } from '../lib/api/settings.js';
import { scanAvailability } from '../lib/api/streaming.js';
import { errorMessage } from '../lib/errors.js';
import { LOGO_BASE } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';
import { advice, bestCombination, summarize, titleKeyOf } from '../../../supabase/functions/_shared/availability.ts';

function ProviderRow({ p, total, titles, open, onToggle }) {
  return (
    <li className="provider-stat">
      <button type="button" className="provider-stat-head" aria-expanded={open} onClick={onToggle}>
        {p.logo_path ? <img src={LOGO_BASE + p.logo_path} alt="" loading="lazy" /> : <span className="provider-logo" aria-hidden="true" />}
        <span className="provider-stat-name">
          {p.name} {p.mine && <span className="badge badge--accent">Dein Abo</span>}
        </span>
        <span className="provider-stat-bar" aria-hidden="true">
          <span style={{ '--progress': total ? p.count / total : 0 }} />
        </span>
        <span className="provider-stat-count">{p.count}</span>
      </button>
      {open && (
        <ul className="list">
          {titles.map((t) => (
            <TitleRow key={titleKeyOf(t)} item={t} />
          ))}
        </ul>
      )}
    </li>
  );
}

function AlertsCard() {
  const { alerts, remove } = useAlerts();
  const list = alerts.data ?? [];
  if (!list.length) return null;
  return (
    <section className="card" aria-labelledby="alerts-title">
      <h2 id="alerts-title">
        <BellRing size={18} aria-hidden="true" />
        Verfügbarkeits-Alarme
      </h2>
      <ul className="list">
        {list.map((a) => (
          <li key={`${a.media_type}-${a.tmdb_id}`} className="title-row">
            <div className="title-main">
              <Link className="title-name title-link" to={`/title/${a.media_type}/${a.tmdb_id}`}>
                {a.title}
              </Link>
              <span className="meta">{a.notified_at ? `Gemeldet am ${new Date(a.notified_at).toLocaleDateString('de-CH')}` : 'Wartet auf deine Dienste'}</span>
            </div>
            <button className="btn-ghost btn-compact" onClick={() => remove.mutate(a)}>
              Entfernen
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function StreamingPage() {
  useDocumentTitle('Streaming');
  const user = useUser();
  const scan = useQuery({ queryKey: ['availability', user.id], queryFn: scanAvailability, staleTime: 60 * 60_000 });
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const [open, setOpen] = useState(null);
  const myIds = useMemo(() => settings.data?.streaming_providers ?? [], [settings.data]);
  const summary = useMemo(() => (scan.data ? summarize(scan.data.items, myIds) : null), [scan.data, myIds]);
  const byKey = useMemo(() => new Map((scan.data?.items ?? []).map((i) => [titleKeyOf(i), i])), [scan.data]);
  const tips = summary ? advice(summary) : null;
  const combo = summary ? bestCombination(summary.providers.map((p) => ({ ...p })), 2) : null;

  return (
    <>
      <div className="page-head">
        <PageTitle area="streaming" id="streaming-page-title">
          Streaming
        </PageTitle>
        <button className="btn-compact" disabled={scan.isFetching} onClick={() => scan.refetch()}>
          <RefreshCw size={16} aria-hidden="true" />
          {scan.isFetching ? 'Wird geprüft …' : 'Neu prüfen'}
        </button>
      </div>
      {scan.isError ? (
        <Messages error={errorMessage(scan.error)} />
      ) : !summary ? (
        <>
          <p className="muted">Prüfe, wo die Titel deiner Watchlist in der Schweiz im Abo laufen … beim ersten Mal dauert das etwas.</p>
          <CardSkeleton />
        </>
      ) : (
        <>
          <section className="card" aria-labelledby="optimizer-title">
            <h2 id="optimizer-title">
              <PiggyBank size={18} aria-hidden="true" />
              Welches Abo lohnt sich?
            </h2>
            <dl className="stats">
              <div className="stat">
                <dt>Mit deinen Abos</dt>
                <dd>
                  {summary.covered} / {summary.total}
                </dd>
              </div>
              <div className="stat">
                <dt>Nirgends im Abo</dt>
                <dd>{summary.nowhere}</dd>
              </div>
            </dl>
            <ul className="advice">
              {!myIds.length && (
                <li>
                  Wähle unter <Link to="/profile">Profil</Link> deine Streaming-Dienste, dann siehst du, was dir fehlt.
                </li>
              )}
              {tips.add && (
                <li>
                  <strong>Lohnt sich diesen Monat: {tips.add.name}</strong> – {tips.add.exclusive} Titel deiner Watchlist, die du sonst nicht im Abo hast.
                </li>
              )}
              {tips.unused.map((p) => (
                <li key={p.id}>
                  <strong>Kaum genutzt: {p.name}</strong> – nur {p.count} Titel deiner Watchlist. Pausieren spart Geld.
                </li>
              ))}
              {combo.providers.length === 2 && (
                <li>
                  Beste Zweier-Kombination: <strong>{combo.providers.map((p) => p.name).join(' + ')}</strong> deckt {combo.covered} von {summary.total} Titeln ab.
                </li>
              )}
            </ul>
            {scan.data.limited && <p className="caption">Geprüft wurden die 300 zuletzt hinzugefügten offenen Titel.</p>}
          </section>
          <section className="card" aria-labelledby="providers-title">
            <h2 id="providers-title">
              <Tv size={18} aria-hidden="true" />
              Titel pro Dienst
            </h2>
            <ul className="provider-stats">
              {summary.providers.slice(0, 15).map((p) => (
                <ProviderRow
                  key={p.id}
                  p={p}
                  total={summary.total}
                  titles={p.titles.map((k) => byKey.get(k)).filter(Boolean)}
                  open={open === p.id}
                  onToggle={() => setOpen(open === p.id ? null : p.id)}
                />
              ))}
            </ul>
            <p className="caption">Im Abo inkl. gratis und mit Werbung. Streaming-Daten: JustWatch via TMDb, Stand bis 24 Stunden alt.</p>
          </section>
        </>
      )}
      <AlertsCard />
    </>
  );
}
