// Month calendar: Monday-first grid, what happened on each day (watched, episodes, concerts, music)
// and what is coming (agenda), plus a summary per week. Pure, tested in test/calendarMonth.test.js.
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const utc = (iso) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, n) => isoOf(utc(iso) + n * DAY_MS);
export const isMonth = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s ?? '');
export const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(utc(s)) && isoOf(utc(s)) === s;
export const shiftMonth = (month, n) => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
export const monthTitle = (month) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

// ISO 8601 week number (weeks start on Monday, week 1 contains the first Thursday).
export function isoWeek(iso) {
  const d = new Date(utc(iso));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Thursday of this week
  const thursday = d.valueOf();
  d.setUTCMonth(0, 1);
  if (d.getUTCDay() !== 4) d.setUTCMonth(0, 1 + ((4 - d.getUTCDay() + 7) % 7)); // first Thursday of the year
  return 1 + Math.ceil((thursday - d.valueOf()) / (7 * DAY_MS));
}

export function monthGrid(month, today) {
  const first = `${month}-01`;
  const start = addDays(first, -((new Date(utc(first)).getUTCDay() + 6) % 7));
  const nextMonth = `${shiftMonth(month, 1)}-01`;
  const weeks = [];
  for (let d = start; d < nextMonth || weeks.length === 0; ) {
    const days = Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(d, i);
      return { iso, day: Number(iso.slice(8)), inMonth: iso.startsWith(month), isToday: iso === today, isPast: iso < today, isFuture: iso > today };
    });
    weeks.push({ week: isoWeek(d), days });
    d = addDays(d, 7);
  }
  return { weeks, from: weeks[0].days[0].iso, to: weeks.at(-1).days[6].iso };
}

const ZURICH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
// The local day (Zurich) of a timestamp, e.g. an episode ticked off at 23:30.
export const zurichDate = (ts) => ZURICH.format(new Date(ts));

export function dayActivity({ views = [], episodes = [], seriesTitles = new Map(), concerts = [], musicDays = [], agenda = [], today }) {
  const map = new Map();
  const at = (iso) => {
    if (!map.has(iso)) map.set(iso, { watched: [], episodes: [], concerts: [], music: null, agenda: [] });
    return map.get(iso);
  };
  for (const v of views) at(v.date).watched.push({ title: v.title, media_type: v.media_type, tmdb_id: v.tmdb_id, rating: v.rating ?? null });
  for (const e of episodes) {
    const day = at(zurichDate(e.watched_at));
    const s = day.episodes.find((x) => x.tmdb_id === e.tmdb_id);
    if (s) s.count++;
    else day.episodes.push({ tmdb_id: e.tmdb_id, title: seriesTitles.get(e.tmdb_id) ?? 'Serie', count: 1 });
  }
  for (const c of concerts) if (!today || c.local_date <= today) at(c.local_date).concerts.push({ artist: c.artist, city: c.city ?? null });
  for (const m of musicDays) {
    if (!m.plays) continue;
    at(m.day.slice(0, 10)).music = { minutes: m.minutes ?? 0, plays: m.plays, estimated: Boolean(m.minutes_estimated), topArtist: m.top_artist ?? null, topArtistPlays: m.top_artist_plays ?? 0 };
  }
  for (const a of agenda) at(a.date).agenda.push(a);
  return map;
}

// Week summary: music minutes, the artist that was on top on most days, and what was watched.
export function weekSummary(week, activity) {
  let minutes = 0;
  let estimated = false;
  let watchedCount = 0;
  let episodeCount = 0;
  const tops = new Map();
  for (const { iso } of week.days) {
    const a = activity.get(iso);
    if (!a) continue;
    watchedCount += a.watched.length;
    episodeCount += a.episodes.reduce((n, e) => n + e.count, 0);
    if (a.music) {
      minutes += a.music.minutes;
      estimated ||= a.music.estimated;
      if (a.music.topArtist) {
        const t = tops.get(a.music.topArtist) ?? { days: 0, plays: 0 };
        tops.set(a.music.topArtist, { days: t.days + 1, plays: t.plays + a.music.topArtistPlays });
      }
    }
  }
  const [top] = [...tops].sort((x, y) => y[1].days - x[1].days || y[1].plays - x[1].plays || x[0].localeCompare(y[0]));
  return { minutes, estimated, topArtist: top?.[0] ?? null, watchedCount, episodeCount };
}

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// Short form for a day cell: "45 min", "3 h".
export const shortMinutes = (minutes) => (minutes < 60 ? `${Math.round(minutes)} min` : `${Math.round(minutes / 60)} h`);

export function weekLine(week, s) {
  const parts = [`KW ${week.week}`];
  if (s.minutes) parts.push(`${s.estimated ? 'ca. ' : ''}${formatMinutes(s.minutes)} Musik`);
  if (s.topArtist) parts.push(`Top: ${s.topArtist}`);
  const seen = [s.watchedCount ? `${s.watchedCount} Titel` : null, s.episodeCount ? `${s.episodeCount} ${s.episodeCount === 1 ? 'Folge' : 'Folgen'}` : null].filter(Boolean);
  if (seen.length) parts.push(seen.join(', '));
  return parts.length > 1 ? parts.join(' · ') : null;
}

export function dayLabel(iso, a) {
  const d = new Date(utc(iso));
  const parts = [`${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]}`];
  if (!a) return parts[0];
  const watched = a.watched.length + a.episodes.reduce((n, e) => n + e.count, 0);
  const details = [
    watched ? `${watched} geschaut` : null,
    a.concerts.length ? `${a.concerts.length} Konzert${a.concerts.length === 1 ? '' : 'e'}` : null,
    a.music ? `${formatMinutes(a.music.minutes)} Musik` : null,
    a.music?.topArtist ? `Top-Artist ${a.music.topArtist}` : null,
    a.agenda.length ? `${a.agenda.length} Termin${a.agenda.length === 1 ? '' : 'e'}` : null,
  ].filter(Boolean);
  return details.length ? `${parts[0]}: ${details.join(', ')}` : parts[0];
}
