// Daily series check: compares the stored progress row with fresh TMDb data (pure, testable).
import { pickEpisode } from './tmdb.ts';

type Episode = { season_number: number; episode_number: number; name: string | null; air_date: string | null } | null;

export interface StoredProgress {
  tmdb_id: number;
  number_of_seasons: number | null;
  last_episode_to_air: Episode;
}

export interface SeriesEvent {
  type: 'new_season' | 'new_episode';
  key: string; // dedupe key for notifications
  title: string;
  body: string;
  data: Record<string, unknown>;
}

const isAfter = (a: Episode, b: Episode) =>
  Boolean(a) && (!b || a!.season_number > b.season_number || (a!.season_number === b.season_number && a!.episode_number > b.episode_number));

export const episodeCode = (e: { season_number: number; episode_number: number }) =>
  `S${String(e.season_number).padStart(2, '0')}E${String(e.episode_number).padStart(2, '0')}`;

const formatDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : null);

export function diffSeries(prev: StoredProgress, raw: Record<string, any>, seriesTitle: string) {
  const last = pickEpisode(raw.last_episode_to_air);
  const next = pickEpisode(raw.next_episode_to_air);
  const seasons = Number.isInteger(raw.number_of_seasons) ? raw.number_of_seasons : null;
  const update = {
    tmdb_status: raw.status || null,
    number_of_seasons: seasons,
    number_of_episodes: Number.isInteger(raw.number_of_episodes) ? raw.number_of_episodes : null,
    last_episode_to_air: last,
    next_episode_to_air: next,
    season_episodes: seasonEpisodes(raw),
    last_checked_at: new Date().toISOString(),
  };
  const events: SeriesEvent[] = [];
  // First check after tracking started: remember the state, announce nothing.
  const firstCheck = prev.number_of_seasons == null && prev.last_episode_to_air == null;
  if (!firstCheck && seasons != null && prev.number_of_seasons != null && seasons > prev.number_of_seasons) {
    const when = next && next.season_number === seasons ? formatDate(next.air_date) : null;
    events.push({
      type: 'new_season',
      key: `season:${prev.tmdb_id}:${seasons}`,
      title: `${seriesTitle}: Staffel ${seasons} angekündigt`,
      body: when ? `Start am ${when}.` : 'Eine neue Staffel ist angekündigt.',
      data: { media_type: 'tv', tmdb_id: prev.tmdb_id, season_number: seasons },
    });
  }
  if (!firstCheck && last && isAfter(last, prev.last_episode_to_air)) {
    events.push({
      type: 'new_episode',
      key: `episode:${prev.tmdb_id}:${episodeCode(last)}`,
      title: `${seriesTitle}: neue Folge ${episodeCode(last)}`,
      body: last.name ? `„${last.name}“ ist erschienen.` : 'Eine neue Folge ist erschienen.',
      data: { media_type: 'tv', tmdb_id: prev.tmdb_id, season_number: last.season_number, episode_number: last.episode_number },
    });
  }
  return { update, events };
}

// Episodes per season from TMDb /tv/{id} (specials left out): [season 1, season 2, ...].
export function seasonEpisodes(raw: Record<string, any>): number[] | null {
  const seasons = (raw.seasons ?? []).filter((s: any) => Number.isInteger(s?.season_number) && s.season_number >= 1);
  if (!seasons.length) return null;
  const counts: number[] = [];
  for (const s of seasons) counts[s.season_number - 1] = Math.max(0, Number(s.episode_count) || 0);
  return Array.from(counts, (c) => c ?? 0);
}

// ---- Catch-up countdown --------------------------------------------------------------------------

export const CATCH_UP_DAYS = 180; // only premieres this close get a plan

export interface CatchUpSeries {
  tmdb_id: number;
  title?: string | null;
  season_episodes: number[] | null;
  last_episode_to_air: Episode;
  next_episode_to_air: Episode;
  watched_count: number;
  next_up_season?: number | null;
  next_up_episode?: number | null;
}

// Episodes that have aired up to the last one (needs the episode counts per season).
export function airedEpisodes(counts: number[] | null, last: Episode) {
  if (!counts || !last) return null;
  return counts.slice(0, last.season_number - 1).reduce((sum, n) => sum + n, 0) + last.episode_number;
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

// The open episodes in order, starting at "next up" (or right after what was watched).
function openEpisodes(s: CatchUpSeries, behind: number) {
  const counts = s.season_episodes ?? [];
  let season = s.next_up_season ?? 1;
  let episode = s.next_up_episode ?? 1;
  const out: { season_number: number; episode_number: number }[] = [];
  while (out.length < behind && season <= counts.length) {
    if (episode > (counts[season - 1] ?? 0)) {
      season++;
      episode = 1;
      continue;
    }
    out.push({ season_number: season, episode_number: episode });
    episode++;
  }
  return out;
}

// "Severance S3 starts in 41 days. You're 6 episodes behind, so 1 per week gets you there."
// Weekly sessions on Saturdays until the premiere.
export function catchUpPlan(s: CatchUpSeries, today: string) {
  const next = s.next_episode_to_air;
  if (!next?.air_date || next.episode_number !== 1 || next.air_date <= today) return null;
  const days = daysUntil(today, next.air_date);
  if (days > CATCH_UP_DAYS) return null;
  const aired = airedEpisodes(s.season_episodes, s.last_episode_to_air);
  if (aired == null) return null;
  const behind = Math.max(0, aired - s.watched_count);
  if (!behind) return null;
  const firstSaturday = addDays(today, (6 - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7);
  const slots: string[] = [];
  for (let d = firstSaturday; d < next.air_date; d = addDays(d, 7)) slots.push(d);
  if (!slots.length) slots.push(today);
  const perWeek = Math.ceil(behind / slots.length);
  const queue = openEpisodes(s, behind);
  const sessions = slots.slice(0, Math.ceil(behind / perWeek)).map((date, i) => {
    const episodes = queue.slice(i * perWeek, (i + 1) * perWeek);
    const count = Math.min(perWeek, behind - i * perWeek);
    return { date, count, episodes };
  });
  return { season: next.season_number, premiere: next.air_date, days, behind, perWeek, sessions };
}

export type CatchUp = NonNullable<ReturnType<typeof catchUpPlan>>;

export function catchUpLine(title: string, p: CatchUp) {
  const start = p.days === 1 ? 'startet morgen' : `startet in ${p.days} Tagen`;
  const behind = p.behind === 1 ? '1 Folge' : `${p.behind} Folgen`;
  const pace = p.perWeek === 1 ? '1 Folge pro Woche' : `${p.perWeek} Folgen pro Woche`;
  return `${title} Staffel ${p.season} ${start}. Du bist ${behind} hinten – mit ${pace} bist du rechtzeitig dran.`;
}

// Compared to the plan's starting point: more than a week behind the schedule?
export function behindSchedule(plan: { behind_at_start: number; per_week: number; started_on: string }, behindNow: number, today: string) {
  const weeks = Math.floor(daysUntil(plan.started_on, today) / 7);
  const expected = Math.max(0, plan.behind_at_start - plan.per_week * weeks);
  return behindNow > expected + plan.per_week;
}

export const sessionLabel = (session: { count: number; episodes: { season_number: number; episode_number: number }[] }) =>
  session.episodes.length
    ? session.episodes.length === 1
      ? episodeCode(session.episodes[0])
      : `${episodeCode(session.episodes[0])}–${episodeCode(session.episodes[session.episodes.length - 1])}`
    : session.count === 1
      ? '1 Folge'
      : `${session.count} Folgen`;
