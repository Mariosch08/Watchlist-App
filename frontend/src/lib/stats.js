// Statistics, year in review and challenges, computed in the browser from watchlist + diary.
const DEFAULT_RUNTIME = 110; // minutes, for movies without a known runtime
const keyOf = (t) => `${t.media_type}:${t.tmdb_id}`;
const yearOf = (iso) => (iso ? Number(String(iso).slice(0, 4)) : null);
export const FIRST_DECADE = 1920;

// One viewing per diary entry; completed titles without diary entries count once on their watch date.
export function viewings(watchlist, diary) {
  const items = new Map(watchlist.map((w) => [keyOf(w), w]));
  const logged = new Set(diary.map(keyOf));
  const fromDiary = diary.map((d) => {
    const w = items.get(keyOf(d));
    return {
      media_type: d.media_type,
      tmdb_id: d.tmdb_id,
      title: d.title,
      poster_path: d.poster_path ?? w?.poster_path ?? null,
      release_date: w?.release_date ?? null,
      genre_ids: w?.genre_ids ?? [],
      runtime: w?.runtime ?? null,
      rating: d.rating ?? w?.my_rating ?? null,
      date: d.watched_on,
      place: d.place,
      rewatch: d.rewatch,
    };
  });
  const fromList = watchlist
    .filter((w) => w.status === 'completed' && w.watched_at && !logged.has(keyOf(w)))
    .map((w) => ({
      media_type: w.media_type,
      tmdb_id: w.tmdb_id,
      title: w.title,
      poster_path: w.poster_path,
      release_date: w.release_date,
      genre_ids: w.genre_ids ?? [],
      runtime: w.runtime ?? null,
      rating: w.my_rating,
      date: w.watched_at.slice(0, 10),
      place: null,
      rewatch: false,
    }));
  return [...fromDiary, ...fromList].sort((a, b) => a.date.localeCompare(b.date));
}

export function availableYears(views, now = new Date()) {
  return [...new Set([now.getFullYear(), ...views.map((v) => yearOf(v.date))])].filter(Boolean).sort((a, b) => b - a);
}

const unique = (list) => [...new Map(list.map((v) => [keyOf(v), v])).values()];

export function yearStats(views, year, genreNames = new Map()) {
  const v = views.filter((x) => yearOf(x.date) === year);
  const movies = v.filter((x) => x.media_type === 'movie');
  const months = Array.from({ length: 12 }, (_, i) => v.filter((x) => Number(x.date.slice(5, 7)) === i + 1).length);
  const minutes = movies.reduce((sum, x) => sum + (x.runtime || DEFAULT_RUNTIME), 0);
  const rated = unique(v.filter((x) => x.rating));
  const ratings = Array.from({ length: 10 }, (_, i) => rated.filter((x) => x.rating === i + 1).length);
  const genre = new Map();
  for (const x of unique(v)) {
    for (const id of x.genre_ids ?? []) {
      const g = genre.get(id) ?? { id, name: genreNames.get(id) ?? `Genre ${id}`, count: 0, ratingSum: 0, rated: 0 };
      g.count++;
      if (x.rating) {
        g.ratingSum += x.rating;
        g.rated++;
      }
      genre.set(id, g);
    }
  }
  const decades = new Map();
  for (const x of unique(movies)) {
    const y = yearOf(x.release_date);
    if (y) decades.set(Math.floor(y / 10) * 10, (decades.get(Math.floor(y / 10) * 10) ?? 0) + 1);
  }
  const best = Math.max(...months);
  return {
    year,
    total: v.length,
    titles: unique(v).length,
    movies: unique(movies).length,
    series: unique(v.filter((x) => x.media_type === 'tv')).length,
    hours: Math.round(minutes / 60),
    estimated: movies.some((x) => !x.runtime),
    months,
    bestMonth: best > 0 ? months.indexOf(best) : null,
    ratings,
    average: rated.length ? Math.round((rated.reduce((s, x) => s + x.rating, 0) / rated.length) * 10) / 10 : null,
    genres: [...genre.values()]
      .map((g) => ({ id: g.id, name: g.name, count: g.count, average: g.rated ? Math.round((g.ratingSum / g.rated) * 10) / 10 : null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    decades: [...decades.entries()].sort((a, b) => a[0] - b[0]).map(([decade, count]) => ({ decade, count })),
    favourites: rated.sort((a, b) => b.rating - a.rating || b.date.localeCompare(a.date)).slice(0, 5),
    cinema: v.filter((x) => x.place === 'cinema').length,
    rewatches: v.filter((x) => x.rewatch).length,
  };
}

// Goals with progress; `topRated` is the TMDb top 100 (null while loading).
export function challenges({ views, watchlist, topRated, year, now = new Date() }) {
  const inYear = views.filter((x) => yearOf(x.date) === year);
  const seenMovies = new Set([
    ...watchlist.filter((w) => w.media_type === 'movie' && w.status === 'completed').map((w) => w.tmdb_id),
    ...views.filter((x) => x.media_type === 'movie').map((x) => x.tmdb_id),
  ]);
  const releaseYear = new Map(watchlist.map((w) => [keyOf(w), yearOf(w.release_date)]));
  const decades = new Set();
  for (const id of seenMovies) {
    const y = releaseYear.get(`movie:${id}`) ?? yearOf(views.find((x) => x.media_type === 'movie' && x.tmdb_id === id)?.release_date);
    if (y && y >= FIRST_DECADE) decades.add(Math.floor(y / 10) * 10);
  }
  const allDecades = [];
  for (let d = FIRST_DECADE; d <= Math.floor(now.getFullYear() / 10) * 10; d += 10) allDecades.push(d);
  const top = topRated ?? [];
  const list = [
    { id: 'films52', title: `52 Filme in ${year}`, detail: 'Ein Film pro Woche', goal: 52, value: unique(inYear.filter((x) => x.media_type === 'movie')).length },
    {
      id: 'decades',
      title: 'Jedes Jahrzehnt',
      detail: `Ein Film aus jedem Jahrzehnt seit den ${FIRST_DECADE}ern`,
      goal: allDecades.length,
      value: allDecades.filter((d) => decades.has(d)).length,
      missing: allDecades.filter((d) => !decades.has(d)),
    },
    { id: 'top100', title: 'TMDb Top 100', detail: 'Die 100 bestbewerteten Filme auf TMDb', goal: 100, value: top.filter((t) => seenMovies.has(t.tmdb_id)).length, loading: !topRated },
    { id: 'genres', title: 'Genre-Entdecker:in', detail: `10 verschiedene Genres in ${year}`, goal: 10, value: new Set(inYear.flatMap((x) => x.genre_ids ?? [])).size },
    { id: 'cinema', title: 'Kino-Fan', detail: `12 Kinobesuche in ${year} (laut Tagebuch)`, goal: 12, value: inYear.filter((x) => x.place === 'cinema').length },
  ];
  return list.map((c) => ({ ...c, value: Math.min(c.value, c.goal), done: c.value >= c.goal }));
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const MONTH_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Shareable year-in-review card (1080×1350 SVG, Quiet Ink colours); turned into a PNG in the browser.
export function reviewSvg(stats, { name } = {}) {
  const W = 1080;
  const H = 1350;
  const ink = '#1c1b19';
  const muted = '#6b665d';
  const accent = '#9a3412';
  const paper = '#f7f4ee';
  const max = Math.max(1, ...stats.months);
  const bars = stats.months
    .map((m, i) => {
      const h = Math.round((m / max) * 220);
      const x = 90 + i * 76;
      return `<rect x="${x}" y="${1080 - h}" width="52" height="${h}" rx="6" fill="${i === stats.bestMonth ? accent : '#d6cfc2'}"/><text x="${x + 26}" y="1120" font-size="22" text-anchor="middle" fill="${muted}">${MONTH_SHORT[i]}</text>`;
    })
    .join('');
  const numbers = [
    [stats.titles, stats.titles === 1 ? 'Titel' : 'Titel'],
    [stats.hours, 'Stunden Film'],
    [stats.cinema, 'im Kino'],
  ]
    .map(([n, label], i) => `<text x="${90 + i * 320}" y="470" font-size="120" font-weight="600" fill="${ink}">${esc(n)}</text><text x="${94 + i * 320}" y="520" font-size="30" fill="${muted}">${esc(label)}</text>`)
    .join('');
  const fav = stats.favourites[0];
  const genre = stats.genres[0];
  const lines = [
    genre ? `Lieblingsgenre: ${genre.name}` : null,
    fav ? `Höchste Bewertung: ${fav.title} (${fav.rating}/10)` : null,
    stats.bestMonth != null ? `Stärkster Monat: ${MONTH_LONG[stats.bestMonth]}` : null,
  ].filter(Boolean);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Source Serif 4, Georgia, serif">
<rect width="${W}" height="${H}" fill="${paper}"/>
<text x="90" y="170" font-size="34" fill="${muted}" letter-spacing="4">${esc(name ? `${name.toUpperCase()} · ` : '')}JAHRESRÜCKBLICK</text>
<text x="90" y="290" font-size="110" font-weight="600" fill="${ink}">Mein Filmjahr ${esc(stats.year)}</text>
<line x1="90" y1="340" x2="${W - 90}" y2="340" stroke="#d6cfc2" stroke-width="2"/>
${numbers}
${lines.map((l, i) => `<text x="90" y="${640 + i * 60}" font-size="38" fill="${ink}">${esc(l.length > 52 ? `${l.slice(0, 51)}…` : l)}</text>`).join('')}
${bars}
<text x="90" y="${H - 80}" font-size="24" fill="${muted}">Watchlist · Daten von TMDb</text>
</svg>`;
}
