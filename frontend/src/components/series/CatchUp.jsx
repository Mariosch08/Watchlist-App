import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { catchUpLine, catchUpPlan, seasonEpisodes, sessionLabel } from '../../../../supabase/functions/_shared/series.ts';
import { useUser } from '../../auth/AuthContext.jsx';
import { useSeriesOverview } from '../../hooks/useSeries.js';
import { dismissCatchup, fetchCatchups } from '../../lib/api/series.js';
import { errorMessage } from '../../lib/errors.js';
import { useToast } from '../toast/ToastProvider.jsx';

const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'short' });

function useCatchups() {
  const user = useUser();
  const toast = useToast();
  const queryClient = useQueryClient();
  const stored = useQuery({ queryKey: ['catchups', user.id], queryFn: fetchCatchups });
  const dismiss = useMutation({
    mutationFn: ({ tmdbId, season }) => dismissCatchup(tmdbId, season),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catchups', user.id] }),
    onError: (err) => toast.error(errorMessage(err)),
  });
  const find = (tmdbId, season) => stored.data?.find((c) => c.tmdb_id === tmdbId && c.season_number === season);
  return { find, dismiss };
}

function Plan({ title, plan, stored, onDismiss, busy, link }) {
  return (
    <div className="catchup">
      <p className="catchup-line">{link ? <Link to={link}>{catchUpLine(title, plan)}</Link> : catchUpLine(title, plan)}</p>
      <ol className="catchup-sessions">
        {plan.sessions.slice(0, 4).map((s) => (
          <li key={s.date}>
            <span className="caption">{shortDate(s.date)}</span> {sessionLabel(s)}
          </li>
        ))}
        {plan.sessions.length > 4 && <li className="caption">… und {plan.sessions.length - 4} weitere Wochen</li>}
      </ol>
      {stored && (
        <button type="button" className="btn-ghost btn-compact" disabled={busy} onClick={onDismiss}>
          Plan ausblenden
        </button>
      )}
    </div>
  );
}

// Detail page of a series: the countdown to the next season and the weekly plan.
export function CatchUpNotice({ details }) {
  const overview = useSeriesOverview();
  const { find, dismiss } = useCatchups();
  const row = overview.data?.find((s) => s.tmdb_id === details.tmdb_id);
  if (!row) return null;
  const today = new Date().toISOString().slice(0, 10);
  const plan = catchUpPlan(
    {
      ...row,
      season_episodes: row.season_episodes ?? seasonEpisodes({ seasons: details.seasons }),
      last_episode_to_air: details.last_episode_to_air ?? row.last_episode_to_air,
      next_episode_to_air: details.next_episode_to_air ?? row.next_episode_to_air,
    },
    today,
  );
  const stored = plan && find(details.tmdb_id, plan.season);
  if (!plan || stored?.dismissed) return null;
  return (
    <section className="card" aria-labelledby="catchup-title">
      <h2 id="catchup-title">Aufholen bis Staffel {plan.season}</h2>
      <Plan title={details.title} plan={plan} stored={stored} busy={dismiss.isPending} onDismiss={() => dismiss.mutate({ tmdbId: details.tmdb_id, season: plan.season })} />
      <p className="caption">Die Termine stehen auch im Kalender-Abo. Fällst du zurück, erinnert dich die App einmal pro Woche.</p>
    </section>
  );
}

// Calendar page: all series with a premiere coming up and episodes still open.
export function CatchUpList() {
  const overview = useSeriesOverview();
  const { find, dismiss } = useCatchups();
  const today = new Date().toISOString().slice(0, 10);
  const plans = (overview.data ?? [])
    .filter((s) => s.watch_status !== 'dropped')
    .map((s) => ({ s, plan: catchUpPlan(s, today) }))
    .filter(({ s, plan }) => plan && !find(s.tmdb_id, plan.season)?.dismissed)
    .sort((a, b) => a.plan.premiere.localeCompare(b.plan.premiere));
  if (!plans.length) return null;
  return (
    <section className="card" aria-labelledby="catchups-title">
      <h2 id="catchups-title">Aufholen vor dem Staffelstart</h2>
      {plans.map(({ s, plan }) => (
        <Plan
          key={s.tmdb_id}
          title={s.title ?? 'Serie'}
          plan={plan}
          link={`/title/tv/${s.tmdb_id}`}
          stored={find(s.tmdb_id, plan.season)}
          busy={dismiss.isPending}
          onDismiss={() => dismiss.mutate({ tmdbId: s.tmdb_id, season: plan.season })}
        />
      ))}
    </section>
  );
}
