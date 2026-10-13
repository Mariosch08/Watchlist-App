// Life Reel: one timeline for watching, listening and live shows (pure, from the app's data).
import { MONTH_LONG } from './stats.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const hoursOf = (minutes) => Math.round(minutes / 60);

const best = (views) =>
  [...views].filter((v) => v.rating).sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date))[0] ?? null;

// One entry per month of the year with anything in it, newest first.
export function reelMonths({ views = [], musicMonths = [], concerts = [], year, today }) {
  const out = [];
  for (let m = 11; m >= 0; m--) {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`;
    if (`${key}-01` > today) continue;
    const seen = views.filter((v) => v.date.startsWith(key));
    const music = musicMonths.find((x) => x.month.startsWith(key)) ?? null;
    const gigs = concerts.filter((c) => c.local_date.startsWith(key) && c.local_date <= today).sort((a, b) => a.local_date.localeCompare(b.local_date));
    if (!seen.length && !music?.plays && !gigs.length) continue;
    const films = seen.filter((v) => v.media_type === 'movie').length;
    const series = seen.filter((v) => v.media_type === 'tv').length;
    const musicHours = music?.minutes != null ? hoursOf(music.minutes) : null;
    const parts = [
      films ? plural(films, 'Film', 'Filme') : null,
      series ? plural(series, 'Serie', 'Serien') : null,
      musicHours ? `${music.minutes_estimated ? 'ca. ' : ''}${musicHours} h Musik` : null,
      ...gigs.slice(0, 2).map((g) => `${g.artist} live${g.city ? ` in ${g.city}` : ''}`),
    ].filter(Boolean);
    out.push({
      key,
      label: MONTH_LONG[m],
      films,
      series,
      top: best(seen),
      musicHours,
      musicEstimated: Boolean(music?.minutes_estimated),
      topArtist: music?.top_artist ?? null,
      topTrack: music?.top_track ? { name: music.top_track, artist: music.top_track_artist } : null,
      gigs,
      summary: parts.join(', '),
    });
  }
  return out;
}

// "On this day" across all media: same day in earlier years, and the same month's music.
export function onThisDay({ views = [], musicMonths = [], concerts = [], today }) {
  const md = today.slice(5);
  const year = Number(today.slice(0, 4));
  const items = [];
  for (const v of views) {
    if (v.date.slice(5) === md && v.date < today) items.push({ kind: 'view', years: year - Number(v.date.slice(0, 4)), title: v.title, rating: v.rating, media_type: v.media_type, tmdb_id: v.tmdb_id });
  }
  for (const c of concerts) {
    if (c.local_date.slice(5) === md && c.local_date < today) items.push({ kind: 'concert', years: year - Number(c.local_date.slice(0, 4)), title: c.artist, city: c.city });
  }
  for (const m of musicMonths) {
    if (m.month.slice(5, 7) === md.slice(0, 2) && Number(m.month.slice(0, 4)) < year && m.top_artist) {
      items.push({ kind: 'music', years: year - Number(m.month.slice(0, 4)), title: m.top_artist, month: MONTH_LONG[Number(m.month.slice(5, 7)) - 1], year: Number(m.month.slice(0, 4)) });
    }
  }
  return items.filter((i) => i.years > 0).sort((a, b) => a.years - b.years || a.kind.localeCompare(b.kind));
}

export const yearsAgo = (n) => (n === 1 ? 'Vor einem Jahr' : `Vor ${n} Jahren`);

// Music of a year for the review: hours, the artist on top most often, concerts I went to.
export function yearMusic({ musicMonths = [], concerts = [], year, today }) {
  const months = musicMonths.filter((m) => m.month.startsWith(String(year)));
  const minutes = months.reduce((sum, m) => sum + (m.minutes ?? 0), 0);
  const tally = new Map();
  for (const m of months) {
    if (!m.top_artist) continue;
    const t = tally.get(m.top_artist) ?? { months: 0, plays: 0 };
    tally.set(m.top_artist, { months: t.months + 1, plays: t.plays + (m.top_artist_plays ?? 0) });
  }
  const [topArtist] = [...tally].sort((a, b) => b[1].months - a[1].months || b[1].plays - a[1].plays);
  const gigs = concerts.filter((c) => c.local_date.startsWith(String(year)) && c.local_date <= today);
  if (!months.length && !gigs.length) return null;
  return { hours: hoursOf(minutes), estimated: months.some((m) => m.minutes_estimated), topArtist: topArtist?.[0] ?? null, concerts: gigs.length };
}
