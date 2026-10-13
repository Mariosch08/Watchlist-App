import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { planRotation, priceOf, viewingPace } from '../../../../supabase/functions/_shared/rotation.ts';
import { useUser } from '../../auth/AuthContext.jsx';
import { useSeriesOverview } from '../../hooks/useSeries.js';
import { useWatchlist } from '../../hooks/useWatchlist.js';
import { diaryKeys, fetchDiary } from '../../lib/api/diary.js';
import { fetchRecentEpisodes } from '../../lib/api/series.js';
import { updateSettings } from '../../lib/api/settings.js';
import { fetchRotationPlan, saveRotationPlan } from '../../lib/api/streaming.js';
import { errorMessage } from '../../lib/errors.js';
import { queryKeys } from '../../lib/queryClient.js';
import { planTitles, watchedMinutes } from '../../lib/rotationInput.js';
import { useToast } from '../toast/ToastProvider.jsx';

const monthName = (month) => new Date(`${month}-01T12:00:00`).toLocaleDateString('de-CH', { month: 'long' });
const hours = (minutes) => Math.max(1, Math.round(minutes / 60));
const chf = (x) => `CHF ${x.toFixed(2).replace(/\.00$/, '')}`;
const twelveWeeksAgo = () => new Date(Date.now() - 84 * 86_400_000).toISOString();

// "Nov: Netflix (9 Titel, ca. 16 h). Dez: Disney+ (6 Titel). Spart etwa CHF 38."
export default function RotationCard({ items, providers, settings }) {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const watchlist = useWatchlist();
  const series = useSeriesOverview();
  const diary = useQuery({ queryKey: diaryKeys.all(user.id), queryFn: fetchDiary });
  const episodes = useQuery({ queryKey: ['episodes-recent', user.id], queryFn: () => fetchRecentEpisodes(twelveWeeksAgo()), staleTime: 60 * 60_000 });
  const saved = useQuery({ queryKey: ['rotation', user.id], queryFn: fetchRotationPlan });
  const names = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p.name])), [providers]);
  const prices = useMemo(() => settings.streaming_prices ?? {}, [settings.streaming_prices]);
  const current = useMemo(() => settings.streaming_providers ?? [], [settings.streaming_providers]);
  const ready = watchlist.data && series.data && diary.data && episodes.data;

  const today = new Date().toISOString().slice(0, 10);
  const pace = useMemo(
    () => (ready ? viewingPace(watchedMinutes({ diary: diary.data, watchlist: watchlist.data, episodes: episodes.data, series: series.data }), today) : null),
    [ready, diary.data, watchlist.data, episodes.data, series.data, today],
  );
  const plan = useMemo(
    () => (pace ? planRotation({ titles: planTitles(items, watchlist.data, series.data), names, pace: pace.minutesPerWeek, prices, current, today }) : null),
    [pace, items, watchlist.data, series.data, names, prices, current, today],
  );

  const save = useMutation({
    mutationFn: () => saveRotationPlan(plan.months),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotation', user.id] });
      toast.success('Plan gespeichert. Die Erinnerungen erscheinen in deinem Kalender-Abo.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const setPrice = useMutation({
    mutationFn: (next) => updateSettings({ streaming_prices: next }),
    onSuccess: (row) => queryClient.setQueryData(queryKeys.settings(user.id), (old) => ({ ...old, streaming_prices: row.streaming_prices })),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const changePrice = (id, value) => {
    const n = Number(String(value).replace(',', '.'));
    const next = { ...prices };
    if (value === '' || !Number.isFinite(n)) delete next[id];
    else next[id] = Math.max(0, Math.min(200, Math.round(n * 100) / 100));
    if (JSON.stringify(next) !== JSON.stringify(prices)) setPrice.mutate(next);
  };

  if (!plan) return null;
  const priceIds = [...new Set([...plan.months.map((m) => m.provider_id), ...current])].filter((id) => names[id]);
  const currentNames = current.map((id) => names[id]).filter(Boolean);

  return (
    <section className="card" aria-labelledby="rotation-title">
      <div className="card-head">
        <h2 id="rotation-title">Abo-Rotation</h2>
        {saved.data && <span className="caption">Gespeichert am {new Date(saved.data.saved_at).toLocaleDateString('de-CH')}</span>}
      </div>
      <p className="muted">
        Ein Dienst pro Monat, passend zu deinem Tempo: etwa {hours(pace.minutesPerWeek)} h pro Woche
        {pace.estimated ? ' (Schätzung – trag Gesehenes ins Tagebuch ein, dann wird es genauer).' : ', gemessen an Tagebuch, Filmen und Folgen der letzten 12 Wochen.'}
      </p>
      {plan.months.length === 0 ? (
        <p className="empty">Keine offenen Titel im Abo gefunden. Ergänze deine Watchlist oder prüfe die Dienste neu.</p>
      ) : (
        <>
          <ol className="rotation">
            {plan.months.map((m) => (
              <li key={m.month}>
                <span className="rotation-month">{monthName(m.month)}</span>
                <span className="rotation-provider">{m.provider}</span>
                <span className="meta">
                  <span>{m.titles.length} Titel</span>
                  <span>ca. {hours(m.minutes)} h</span>
                  <span>{chf(m.price)}</span>
                </span>
                <details className="rotation-titles">
                  <summary>Titel anzeigen</summary>
                  <ul>
                    {m.titles.map((t) => (
                      <li key={t.key}>
                        <Link to={`/title/${t.key.replace(':', '/')}`}>{t.title}</Link>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
          <p>
            {plan.savings > 0 ? (
              <>
                <strong>Spart etwa {chf(Math.round(plan.savings))}</strong> gegenüber {currentNames.length ? `${currentNames.join(' + ')} durchgehend` : 'allen Diensten gleichzeitig'}.
              </>
            ) : (
              <>Kostet {chf(plan.cost)} für {plan.months.length} Monate.</>
            )}
            {plan.free.length > 0 && ` ${plan.free.length} Titel laufen gratis.`}
            {plan.later.length > 0 && ` ${plan.later.length} Titel passen erst danach.`}
          </p>
          <div className="actions">
            <button className="btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>
              {saved.data ? 'Plan aktualisieren' : 'In den Kalender'}
            </button>
          </div>
          <p className="caption">Im Kalender-Abo: „Abo starten“ am Monatsersten und „kündigen“ drei Tage vor Monatsende, mit den noch offenen Titeln.</p>
        </>
      )}
      {priceIds.length > 0 && (
        <details className="disclosure">
          <summary>Preise anpassen</summary>
          <ul className="price-list">
            {priceIds.map((id) => {
              const p = priceOf(id, prices);
              return (
                <li key={id}>
                  <label htmlFor={`price-${id}`}>{names[id]}</label>
                  <input
                    id={`price-${id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="200"
                    step="0.05"
                    defaultValue={p.price}
                    onBlur={(e) => changePrice(id, e.target.value)}
                  />
                  <span className="caption">{p.estimated ? 'geschätzt' : 'CHF/Monat'}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </section>
  );
}
