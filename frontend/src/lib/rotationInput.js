// Prepares the input of the subscription rotation (see _shared/rotation.ts) from what the app already has:
// where titles stream, their length, the series progress, the diary and recently watched episodes.
const DEFAULT_MOVIE = 110;
const DEFAULT_EPISODE = 45;
const SEASON = 10; // episodes assumed for a series that is not tracked yet

const keyOf = (t) => `${t.media_type}:${t.tmdb_id}`;

// What is left to watch, in minutes: a film's runtime, or the open episodes of a series.
export function minutesLeft(entry, series) {
  if (entry.media_type === 'movie') return entry.runtime || DEFAULT_MOVIE;
  const episode = entry.runtime || series?.runtime || DEFAULT_EPISODE;
  const open = series?.number_of_episodes ? Math.max(1, series.number_of_episodes - (series.watched_count ?? 0)) : SEASON;
  return episode * Math.min(open, 30);
}

// Series I am watching come first, then the oldest wishes.
export function planTitles(items, watchlist = [], series = []) {
  const byKey = new Map(watchlist.map((w) => [keyOf(w), w]));
  const seriesById = new Map(series.map((s) => [s.tmdb_id, s]));
  return items
    .map((it) => {
      const w = byKey.get(keyOf(it)) ?? { media_type: it.media_type, tmdb_id: it.tmdb_id };
      return {
        key: keyOf(it),
        title: it.title,
        minutes: minutesLeft(w, seriesById.get(it.tmdb_id)),
        providers: (it.flatrate ?? []).map((p) => p.id),
        watching: w.status === 'watching',
        added: w.added_at ?? '',
      };
    })
    .sort((a, b) => Number(b.watching) - Number(a.watching) || a.added.localeCompare(b.added))
    .map(({ watching: _w, added: _a, ...t }) => t);
}

// Everything watched with a date and a length: diary entries and finished films (once per day), episodes.
export function watchedMinutes({ diary = [], watchlist = [], episodes = [], series = [] }) {
  const runtime = new Map(watchlist.map((w) => [keyOf(w), w.runtime]));
  const seen = new Set();
  const out = [];
  const add = (key, date, minutes) => {
    if (!date || seen.has(`${key}|${date}`)) return;
    seen.add(`${key}|${date}`);
    out.push({ date, minutes });
  };
  for (const d of diary) if (d.media_type === 'movie') add(keyOf(d), d.watched_on, runtime.get(keyOf(d)) || DEFAULT_MOVIE);
  for (const w of watchlist) if (w.media_type === 'movie' && w.watched_at) add(keyOf(w), w.watched_at.slice(0, 10), w.runtime || DEFAULT_MOVIE);
  const episodeLength = new Map(series.map((s) => [s.tmdb_id, s.runtime]));
  for (const e of episodes) out.push({ date: e.watched_at.slice(0, 10), minutes: episodeLength.get(e.tmdb_id) || runtime.get(`tv:${e.tmdb_id}`) || DEFAULT_EPISODE });
  return out;
}
