// Letterboxd CSV exports (diary.csv, ratings.csv, watched.csv, watchlist.csv) and Trakt JSON exports.
// Letterboxd has no IMDb/TMDb ids: titles are matched by name and year via TMDb search.
import { parseCsvObjects } from './csv.ts';
import { IMDB_ID, type ImportRow, type MediaType, type ParsedImport, parseDate } from './imdb.ts';

export const isLetterboxdCsv = (csv: string) => /letterboxd\s*uri/i.test(csv.slice(0, 500));

const normTitle = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');

// "4.5" stars → 9 of 10; half stars round up (0.5 → 1).
const stars = (raw: string) => {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 && n <= 5 ? Math.max(1, Math.round(n * 2)) : null;
};

export function parseLetterboxd(csv: string, filename = ''): ParsedImport {
  const { headers, records } = parseCsvObjects(csv);
  if (!headers.includes('letterboxduri') || !headers.includes('name')) throw new Error('UNSUPPORTED_FILE');
  const diary = headers.includes('watcheddate');
  const rated = headers.includes('rating');
  const kind = diary ? 'letterboxd_diary' : rated || /watched/i.test(filename) ? 'letterboxd_ratings' : 'letterboxd_watchlist';
  const rows: ImportRow[] = [];
  const skipped: ParsedImport['skipped'] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    const title = rec.name ?? '';
    const year = Number.parseInt(rec.year ?? '', 10);
    const uri = (rec.letterboxduri ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    if (!title) {
      skipped.push({ imdb_id: '', title, reason: 'invalid_id' });
      continue;
    }
    const ref = `lb:${uri || `${normTitle(title)}:${year || ''}`}`.slice(0, 200);
    const rating = rated ? stars(rec.rating ?? '') : null;
    const watchedOn = diary ? parseDate(rec.watcheddate || rec.date || '') : null;
    // Diary files list every viewing; other files one row per film.
    const key = diary ? `${ref}|${watchedOn}` : ref;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      imdb_id: '',
      ref,
      media_hint: 'movie',
      source: 'letterboxd',
      title: title.slice(0, 300),
      title_type: 'movie',
      year: Number.isInteger(year) && year > 1870 && year < 2100 ? year : null,
      rating,
      rated_at: rating ? (watchedOn ?? parseDate(rec.date ?? '')) : null,
      runtime: null,
      status_hint: kind === 'letterboxd_watchlist' ? 'planned' : 'completed',
      watched_at: kind === 'letterboxd_watchlist' ? null : watchedOn,
      diary: diary && watchedOn ? { watched_on: watchedOn, rewatch: /^(yes|true|1)$/i.test(rec.rewatch ?? ''), rating } : null,
    });
  }
  return { kind, rows, skipped };
}

// Best TMDb search hit: same title (ignoring accents/punctuation) and year (±1), else same year, else none.
export function pickSearchResult(results: any[], title: string, year: number | null) {
  const wanted = normTitle(title);
  const yearOf = (r: any) => Number.parseInt(String(r.release_date ?? r.first_air_date ?? '').slice(0, 4), 10);
  const yearOk = (r: any) => !year || (Number.isInteger(yearOf(r)) && Math.abs(yearOf(r) - year) <= 1);
  const titleOk = (r: any) => [r.title, r.original_title, r.name, r.original_name].some((t) => t && normTitle(t) === wanted);
  return results.find((r) => titleOk(r) && yearOk(r)) ?? (year ? results.find((r) => yearOf(r) === year) : null) ?? null;
}

// ---- Trakt ----------------------------------------------------------------------------------------
// Export files (trakt.tv → Settings → Data, or the API): ratings-*.json, watchlist-*.json, watched-*.json.

export function parseTrakt(json: string, filename = ''): ParsedImport {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error('UNSUPPORTED_FILE');
  }
  if (!Array.isArray(data)) throw new Error('UNSUPPORTED_FILE');
  const sample = (data[0] ?? {}) as Record<string, unknown>;
  const kind =
    'rating' in sample ? 'trakt_ratings' : 'listed_at' in sample || /watchlist/i.test(filename) ? 'trakt_watchlist' : 'trakt_watched';
  const rows: ImportRow[] = [];
  const skipped: ParsedImport['skipped'] = [];
  const seen = new Set<string>();
  for (const item of data as any[]) {
    const obj = item?.movie ?? item?.show;
    const type: MediaType | null = item?.movie ? 'movie' : item?.show && !item?.episode && !item?.season ? 'tv' : null;
    const title = typeof obj?.title === 'string' ? obj.title : '';
    if (!obj || !type) {
      skipped.push({ imdb_id: '', title, reason: 'unsupported_type' });
      continue;
    }
    const ids = obj.ids ?? {};
    const tmdbId = Number.isInteger(ids.tmdb) && ids.tmdb > 0 ? ids.tmdb : null;
    const imdbId = typeof ids.imdb === 'string' && IMDB_ID.test(ids.imdb) ? ids.imdb : '';
    if (!tmdbId && !imdbId && !title) {
      skipped.push({ imdb_id: '', title, reason: 'invalid_id' });
      continue;
    }
    const ref = `trakt:${type}:${ids.trakt ?? tmdbId ?? imdbId ?? title}`.slice(0, 200);
    if (seen.has(ref)) continue;
    seen.add(ref);
    const rating = Number.isInteger(item.rating) && item.rating >= 1 && item.rating <= 10 ? item.rating : null;
    const watched = parseDate(String(item.last_watched_at ?? item.watched_at ?? ''));
    rows.push({
      imdb_id: imdbId,
      ref,
      tmdb_id: tmdbId,
      media_hint: type,
      source: 'trakt',
      title: title.slice(0, 300),
      title_type: type === 'tv' ? 'tvseries' : 'movie',
      year: Number.isInteger(obj.year) ? obj.year : null,
      rating,
      rated_at: rating ? parseDate(String(item.rated_at ?? '')) : null,
      runtime: null,
      status_hint: kind === 'trakt_watchlist' ? 'planned' : 'completed',
      watched_at: kind === 'trakt_watched' ? watched : null,
      diary: null,
    });
  }
  return { kind, rows, skipped };
}
