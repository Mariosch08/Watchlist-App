// Pure helpers for series tracking (no specials: season 0 is ignored everywhere).

export const episodeKey = (season, episode) => `${season}:${episode}`;

export const episodeCode = (season, episode) => `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

const compare = (a, b) => a.season_number - b.season_number || a.episode_number - b.episode_number;

// All episodes of the given seasons (from episode counts), in order.
export function allEpisodes(seasons = []) {
  const out = [];
  for (const s of seasons) {
    if (s.season_number < 1) continue;
    for (let e = 1; e <= (s.episode_count ?? 0); e++) out.push({ season_number: s.season_number, episode_number: e });
  }
  return out;
}

// Episodes that have already aired, based on the last aired episode reported by TMDb.
export function airedEpisodes(seasons, lastAired) {
  if (!lastAired) return [];
  return allEpisodes(seasons).filter((ep) => compare(ep, lastAired) <= 0);
}

// "Bis hier gesehen": every episode up to and including the target.
export function episodesUpTo(seasons, season, episode) {
  const target = { season_number: season, episode_number: episode };
  return allEpisodes(seasons).filter((ep) => compare(ep, target) <= 0);
}

// The first aired episode not yet watched.
export function nextUp(seasons, watched, lastAired) {
  return airedEpisodes(seasons, lastAired).find((ep) => !watched.has(episodeKey(ep.season_number, ep.episode_number))) ?? null;
}

export function progressStats(seasons, watched, lastAired) {
  const aired = airedEpisodes(seasons, lastAired);
  const seen = aired.filter((ep) => watched.has(episodeKey(ep.season_number, ep.episode_number))).length;
  return { aired: aired.length, seen, remaining: aired.length - seen, percent: aired.length ? Math.round((seen / aired.length) * 100) : 0 };
}

// Binge calculator: date when the remaining episodes are done at `perDay` episodes per day.
export function bingeFinish(remaining, perDay, today = new Date()) {
  if (remaining <= 0 || perDay <= 0) return null;
  const days = Math.ceil(remaining / perDay);
  const d = new Date(today);
  d.setDate(d.getDate() + days - 1);
  return { days, date: d };
}

export const FORGOTTEN_AFTER_DAYS = 30;

// A series you are "watching" but have not touched for a month.
export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

export function isForgotten(row, now = new Date()) {
  const days = daysSince(row.last_watched_at ?? row.started_at, now);
  return row.watch_status === 'watching' && days != null && days >= FORGOTTEN_AFTER_DAYS;
}

export function isAired(airDate, today = new Date()) {
  return Boolean(airDate) && airDate <= today.toISOString().slice(0, 10);
}
