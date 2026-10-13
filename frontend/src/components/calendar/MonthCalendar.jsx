import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KIND_LABEL } from '../../../../supabase/functions/_shared/agenda.ts';
import { useUser } from '../../auth/AuthContext.jsx';
import { useAgenda } from '../../hooks/useAgenda.js';
import { useSeriesOverview } from '../../hooks/useSeries.js';
import { useWatchlist } from '../../hooks/useWatchlist.js';
import { diaryKeys, fetchDiary } from '../../lib/api/diary.js';
import { fetchConcertLog, fetchMusicDays } from '../../lib/api/music.js';
import { fetchEpisodesBetween } from '../../lib/api/series.js';
import { addDays, dayActivity, dayLabel, formatMinutes, isDay, isMonth, monthGrid, monthTitle, shiftMonth, shortMinutes, weekLine, weekSummary } from '../../lib/calendarMonth.js';
import { queryKeys } from '../../lib/queryClient.js';
import { viewings } from '../../lib/stats.js';

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function DayDetails({ iso, a, isFuture }) {
  const empty = !a || (!a.watched.length && !a.episodes.length && !a.concerts.length && !a.music && !a.agenda.length);
  return (
    <section className="card" aria-labelledby="day-title">
      <h2 id="day-title">{dayLabel(iso).split(':')[0]}</h2>
      {empty ? (
        <p className="empty">{isFuture ? 'Für diesen Tag steht noch nichts an.' : 'An diesem Tag ist nichts eingetragen.'}</p>
      ) : (
        <div className="day-details">
          {a.watched.length > 0 && (
            <div>
              <h3>Geschaut</h3>
              <ul>
                {a.watched.map((w, i) => (
                  <li key={`${w.media_type}-${w.tmdb_id}-${i}`}>
                    <Link to={`/title/${w.media_type}/${w.tmdb_id}`}>{w.title}</Link>
                    {w.rating ? <span className="muted"> · {w.rating}/10</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.episodes.length > 0 && (
            <div>
              <h3>Folgen</h3>
              <ul>
                {a.episodes.map((e) => (
                  <li key={e.tmdb_id}>
                    <Link to={`/title/tv/${e.tmdb_id}`}>{e.title}</Link> <span className="muted">· {e.count === 1 ? '1 Folge' : `${e.count} Folgen`}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.music && (
            <div>
              <h3>Musik</h3>
              <p>
                {a.music.estimated ? 'ca. ' : ''}
                {formatMinutes(a.music.minutes)} · {a.music.plays} Plays
                {a.music.topArtist && (
                  <>
                    <br />
                    Top-Artist: <strong>{a.music.topArtist}</strong>
                    {a.music.topArtistPlays ? <span className="muted"> ({a.music.topArtistPlays}×)</span> : null}
                  </>
                )}
              </p>
              {a.music.estimated && <p className="caption">Geschätzt aus Last.fm-Plays (3,5 Min. pro Play).</p>}
            </div>
          )}
          {a.concerts.length > 0 && (
            <div>
              <h3>Live</h3>
              <ul>
                {a.concerts.map((c, i) => (
                  <li key={i}>
                    {c.artist}
                    {c.city ? <span className="muted"> · {c.city}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {a.agenda.length > 0 && (
            <div>
              <h3>Geplant</h3>
              <ul>
                {a.agenda.map((e) => (
                  <li key={e.uid}>
                    <span className="badge">{KIND_LABEL[e.kind]}</span> {e.path ? <Link to={e.path}>{e.title}</Link> : e.title}
                    {e.detail && <span className="muted"> · {e.detail.split('\n')[0]}</span>}
                    {e.url && (
                      <>
                        {' '}
                        <a href={e.url} target="_blank" rel="noopener noreferrer">
                          Tickets
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// Always-visible month: what I watched and heard on each day, what is coming, and a line per week.
export default function MonthCalendar() {
  const user = useUser();
  const [params, setParams] = useSearchParams();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
  const month = isMonth(params.get('monat')) ? params.get('monat') : today.slice(0, 7);
  const selected = isDay(params.get('tag')) ? params.get('tag') : month === today.slice(0, 7) ? today : `${month}-01`;
  const grid = useMemo(() => monthGrid(month, today), [month, today]);
  const go = (patch) => setParams({ ...Object.fromEntries(params), ...patch }, { replace: true });

  const watchlist = useWatchlist();
  const diary = useQuery({ queryKey: diaryKeys.all(user.id), queryFn: fetchDiary });
  const series = useSeriesOverview();
  const going = useQuery({ queryKey: queryKeys.music(user.id, 'going'), queryFn: fetchConcertLog });
  const music = useQuery({ queryKey: ['music-days', user.id, grid.from, grid.to], queryFn: () => fetchMusicDays(grid.from, grid.to) });
  const episodes = useQuery({
    queryKey: ['episodes-between', user.id, grid.from, grid.to],
    queryFn: () => fetchEpisodesBetween(`${addDays(grid.from, -1)}T00:00:00Z`, `${addDays(grid.to, 1)}T23:59:59Z`),
  });
  const horizon = Math.max(30, Math.round((Date.parse(grid.to) - Date.parse(today)) / 86_400_000));
  const { items: agenda } = useAgenda(horizon);

  const activity = useMemo(() => {
    const views = watchlist.data && diary.data ? viewings(watchlist.data, diary.data) : [];
    return dayActivity({
      views,
      episodes: episodes.data ?? [],
      seriesTitles: new Map((series.data ?? []).map((s) => [s.tmdb_id, s.title])),
      concerts: going.data ?? [],
      musicDays: music.data ?? [],
      agenda: agenda ?? [],
      today,
    });
  }, [watchlist.data, diary.data, episodes.data, series.data, going.data, music.data, agenda, today]);

  return (
    <>
      <section className="card" aria-labelledby="month-title">
        <div className="month-head">
          <h2 id="month-title">{monthTitle(month)}</h2>
          <div className="month-nav">
            <button type="button" className="btn-ghost btn-compact btn-icon" aria-label="Vorheriger Monat" onClick={() => go({ monat: shiftMonth(month, -1), tag: `${shiftMonth(month, -1)}-01` })}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <button type="button" className="btn-compact" onClick={() => setParams({}, { replace: true })}>
              Heute
            </button>
            <button type="button" className="btn-ghost btn-compact btn-icon" aria-label="Nächster Monat" onClick={() => go({ monat: shiftMonth(month, 1), tag: `${shiftMonth(month, 1)}-01` })}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="month" role="grid" aria-labelledby="month-title">
          <div className="month-row month-weekdays" role="row">
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader">
                {d}
              </span>
            ))}
          </div>
          {grid.weeks.map((w) => {
            const line = weekLine(w, weekSummary(w, activity));
            return (
              <div key={w.days[0].iso} className="month-week">
                <div className="month-row" role="row">
                  {w.days.map((d) => {
                    const a = activity.get(d.iso);
                    const seen = a ? a.watched.length + a.episodes.reduce((n, e) => n + e.count, 0) : 0;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        role="gridcell"
                        className={['month-day', d.inMonth ? '' : 'month-day--out', d.isToday ? 'month-day--today' : ''].filter(Boolean).join(' ')}
                        aria-pressed={d.iso === selected}
                        aria-label={dayLabel(d.iso, a)}
                        onClick={() => go({ monat: d.iso.slice(0, 7), tag: d.iso })}
                      >
                        <span className="month-num">{d.day}</span>
                        {a?.music?.minutes > 0 && <span className="month-music">{shortMinutes(a.music.minutes)}</span>}
                        {a?.music?.topArtist && <span className="month-artist">{a.music.topArtist}</span>}
                        <span className="month-marks" aria-hidden="true">
                          {seen > 0 && <span className="month-mark month-mark--seen">{seen}</span>}
                          {a?.concerts.length > 0 && <span className="month-mark">♪</span>}
                          {a?.agenda.length > 0 && <span className="month-mark month-mark--plan" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {line && <p className="month-week-line">{line}</p>}
              </div>
            );
          })}
        </div>
        <p className="caption">Zahl = geschaut, Punkt = geplant. Musik pro Tag von stats.fm (echte Hörzeit) oder Last.fm (geschätzt); die letzten Wochen füllen sich nach und nach.</p>
      </section>
      <DayDetails iso={selected} a={activity.get(selected)} isFuture={selected > today} />
    </>
  );
}
