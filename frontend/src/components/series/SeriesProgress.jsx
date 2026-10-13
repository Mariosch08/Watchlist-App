import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '../../auth/AuthContext.jsx';
import { useEpisodeMutation, useSeriesProgress } from '../../hooks/useSeries.js';
import { fetchSettings } from '../../lib/api/settings.js';
import { errorMessage } from '../../lib/errors.js';
import { formatDate } from '../../lib/labels.js';
import { queryKeys } from '../../lib/queryClient.js';
import { airedEpisodes, bingeFinish, episodeCode, episodeKey, episodesUpTo, nextUp, progressStats } from '../../lib/series.js';
import SeasonEpisodes from './SeasonEpisodes.jsx';

const TMDB_STATUS = {
  'Returning Series': 'Läuft weiter',
  Ended: 'Abgeschlossen',
  Canceled: 'Abgesetzt',
  'In Production': 'In Produktion',
  Planned: 'Geplant',
  Pilot: 'Pilot',
};

function BingeCalculator({ remaining }) {
  const [perDay, setPerDay] = useState(2);
  const result = bingeFinish(remaining, Number(perDay));
  if (!remaining) return null;
  return (
    <p className="muted binge">
      Bei{' '}
      <input
        type="number"
        min={1}
        max={30}
        value={perDay}
        onChange={(e) => setPerDay(e.target.value)}
        aria-label="Folgen pro Tag"
        className="binge-input"
      />{' '}
      Folgen pro Tag bist du {result ? <strong>am {result.date.toLocaleDateString('de-CH')}</strong> : '…'} durch ({remaining} Folgen offen).
    </p>
  );
}

// Episode tracking on the detail page of a series.
export default function SeriesProgress({ details }) {
  const user = useUser();
  const progress = useSeriesProgress(details.tmdb_id);
  const settings = useQuery({ queryKey: queryKeys.settings(user?.id), queryFn: fetchSettings, enabled: Boolean(user) });
  const mutation = useEpisodeMutation(details);
  const [open, setOpen] = useState(() => new Set());
  const seasons = details.seasons ?? [];
  const last = details.last_episode_to_air;

  if (!seasons.length) return null;
  if (progress.isError) return <p className="field-error">{errorMessage(progress.error)}</p>;
  if (!progress.data) return <span className="skeleton skeleton--line skeleton--long" aria-label="Fortschritt wird geladen" />;

  const watched = progress.data.watched;
  const stats = progressStats(seasons, watched, last);
  const next = nextUp(seasons, watched, last);
  const toggle = (episodes, checked) => mutation.mutate({ episodes, watched: checked });
  const untilHere = (season, episode) => {
    const missing = episodesUpTo(seasons, season, episode).filter((e) => !watched.has(episodeKey(e.season_number, e.episode_number)));
    toggle(missing, true);
  };
  const hideSpoilers = settings.data?.hide_spoilers ?? true;
  const upcoming = details.next_episode_to_air;

  return (
    <section className="card" aria-labelledby="progress-title">
      <div className="card-head">
        <h2 id="progress-title">
          <ListChecks size={18} aria-hidden="true" />
          Dein Fortschritt
        </h2>
        <span className="caption">
          {TMDB_STATUS[details.tmdb_status] ?? details.tmdb_status}
          {upcoming?.air_date && ` · nächste Folge ${episodeCode(upcoming.season_number, upcoming.episode_number)} am ${formatDate(upcoming.air_date)}`}
        </span>
      </div>
      <div className="stack">
        <div className="meta">
          <span>
            {stats.seen} von {stats.aired} Folgen gesehen
          </span>
          <span>{stats.percent} %</span>
        </div>
        <div className="progress" role="progressbar" aria-label="Serienfortschritt" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.percent}>
          <div className="progress-fill" style={{ '--progress': stats.aired ? stats.seen / stats.aired : 0 }} />
        </div>
      </div>
      {next ? (
        <div className="up-next">
          <span>
            Als Nächstes: <strong className="mono">{episodeCode(next.season_number, next.episode_number)}</strong>
          </span>
          <button className="btn-primary btn-compact" disabled={mutation.isPending} onClick={() => toggle([next], true)}>
            Als gesehen markieren
          </button>
        </div>
      ) : stats.aired > 0 ? (
        <p className="muted">Alles gesehen, was bisher erschienen ist.</p>
      ) : null}
      <BingeCalculator remaining={stats.remaining} />
      <div className="seasons">
        {seasons.map((s) => {
          const airedInSeason = airedEpisodes([s], last);
          const seenInSeason = airedInSeason.filter((e) => watched.has(episodeKey(e.season_number, e.episode_number))).length;
          const isOpen = open.has(s.season_number);
          return (
            <details
              key={s.season_number}
              className="season"
              open={isOpen}
              onToggle={(e) => {
                const isNowOpen = e.currentTarget.open;
                setOpen((prev) => {
                  const nextSet = new Set(prev);
                  if (isNowOpen) nextSet.add(s.season_number);
                  else nextSet.delete(s.season_number);
                  return nextSet;
                });
              }}
            >
              <summary>
                <span className="season-name">{s.name}</span>
                <span className="caption">
                  {seenInSeason}/{airedInSeason.length || s.episode_count} gesehen
                </span>
              </summary>
              {isOpen && (
                <div className="stack">
                  {airedInSeason.length > seenInSeason && (
                    <div className="actions">
                      <button className="btn-compact" onClick={() => toggle(airedInSeason, true)}>
                        Ganze Staffel als gesehen markieren
                      </button>
                    </div>
                  )}
                  <SeasonEpisodes
                    tmdbId={details.tmdb_id}
                    season={s}
                    watched={watched}
                    hideSpoilers={hideSpoilers}
                    onToggle={toggle}
                    onUntilHere={untilHere}
                  />
                </div>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
