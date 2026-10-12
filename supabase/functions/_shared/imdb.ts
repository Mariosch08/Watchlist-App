// IMDb CSV import/export logic (pure, testable). IMDb has no API for personal data;
// users export CSVs from imdb.com (ratings, watchlist, lists).
import { parseCsvObjects, toCsv } from './csv.ts';

export type ImportKind = 'imdb_ratings' | 'imdb_watchlist' | 'imdb_list';
export type MediaType = 'movie' | 'tv';

export interface ImportRow {
  imdb_id: string;
  title: string;
  title_type: string;   // normalised, e.g. "movie", "tvseries"
  year: number | null;
  rating: number | null; // 1-10
  rated_at: string | null; // ISO date
  runtime: number | null;  // minutes
}

export interface ParsedImport {
  kind: ImportKind;
  rows: ImportRow[];
  skipped: { imdb_id: string; title: string; reason: string }[];
}

const IMDB_ID = /^tt\d{5,10}$/;
const UNSUPPORTED_TYPES = new Set(['tvepisode', 'videogame', 'podcastseries', 'podcastepisode', 'musicvideo']);
export const SERIES_TYPES = new Set(['tvseries', 'tvminiseries']);

const pick = (rec: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) if (rec[k]) return rec[k];
  return '';
};

export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

function parseIntOrNull(raw: string, min: number, max: number) {
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function detectKind(headers: string[], filename = ''): ImportKind {
  if (!headers.includes('position')) return 'imdb_ratings';
  return /watchlist/i.test(filename) ? 'imdb_watchlist' : 'imdb_list';
}

export function parseImdbExport(csv: string, filename = ''): ParsedImport {
  const { headers, records } = parseCsvObjects(csv);
  if (!headers.includes('const') && !headers.includes('tconst')) {
    throw new Error('NOT_IMDB_CSV');
  }
  const kind = detectKind(headers, filename);
  const byId = new Map<string, ImportRow>();
  const skipped: ParsedImport['skipped'] = [];
  for (const rec of records) {
    const imdbId = pick(rec, 'const', 'tconst').toLowerCase();
    const title = pick(rec, 'title', 'originaltitle');
    if (!IMDB_ID.test(imdbId)) {
      skipped.push({ imdb_id: imdbId, title, reason: 'invalid_id' });
      continue;
    }
    const titleType = pick(rec, 'titletype').toLowerCase().replace(/[^a-z]/g, '');
    if (UNSUPPORTED_TYPES.has(titleType)) {
      skipped.push({ imdb_id: imdbId, title, reason: 'unsupported_type' });
      continue;
    }
    const row: ImportRow = {
      imdb_id: imdbId,
      title,
      title_type: titleType,
      year: parseIntOrNull(pick(rec, 'year'), 1870, 2100),
      rating: parseIntOrNull(pick(rec, 'yourrating'), 1, 10),
      rated_at: parseDate(pick(rec, 'daterated')),
      runtime: parseIntOrNull(pick(rec, 'runtimemins', 'runtime'), 1, 100000),
    };
    const prev = byId.get(imdbId);
    // Duplicates: keep the most recent rating.
    if (!prev || (row.rated_at ?? '') > (prev.rated_at ?? '')) byId.set(imdbId, row);
  }
  return { kind, rows: [...byId.values()], skipped };
}

// Picks the TMDb match of GET /find/{imdb_id}, preferring series for series title types.
export function pickFindResult(find: any, titleType: string): { media_type: MediaType; raw: any } | null {
  const movie = find?.movie_results?.[0];
  const tv = find?.tv_results?.[0];
  if (SERIES_TYPES.has(titleType)) return tv ? { media_type: 'tv', raw: tv } : movie ? { media_type: 'movie', raw: movie } : null;
  return movie ? { media_type: 'movie', raw: movie } : tv ? { media_type: 'tv', raw: tv } : null;
}

export interface ExistingEntry {
  status: string;
  my_rating: number | null;
  rated_at: string | null;
  imdb_id: string | null;
  runtime: number | null;
}

export type MergeDecision =
  | { action: 'skip'; reason: 'tombstoned' | 'unchanged' }
  | { action: 'insert'; values: Record<string, unknown> }
  | { action: 'update'; values: Record<string, unknown> };

// Merge rules: never re-create deleted titles, ratings only overwrite when newer,
// rated titles become "completed", plain watchlist entries become "planned". Idempotent.
export function mergeImportRow(row: ImportRow, existing: ExistingEntry | null, tombstoned: boolean): MergeDecision {
  if (!existing) {
    if (tombstoned) return { action: 'skip', reason: 'tombstoned' };
    return {
      action: 'insert',
      values: {
        imdb_id: row.imdb_id,
        status: row.rating ? 'completed' : 'planned',
        my_rating: row.rating,
        rated_at: row.rating ? (row.rated_at ?? null) : null,
        runtime: row.runtime,
        source: 'imdb',
      },
    };
  }
  const values: Record<string, unknown> = {};
  if (!existing.imdb_id) values.imdb_id = row.imdb_id;
  if (!existing.runtime && row.runtime) values.runtime = row.runtime;
  if (row.rating) {
    const existingDate = existing.rated_at?.slice(0, 10) ?? '';
    const isNewer = !existing.my_rating || (row.rated_at ?? '') > existingDate;
    if (isNewer && row.rating !== existing.my_rating) {
      values.my_rating = row.rating;
      values.rated_at = row.rated_at;
    }
    if (existing.status !== 'completed' && (isNewer || !existing.my_rating)) values.status = 'completed';
  }
  return Object.keys(values).length ? { action: 'update', values } : { action: 'skip', reason: 'unchanged' };
}

export interface ExportEntry {
  imdb_id: string | null;
  title: string;
  media_type: MediaType;
  release_date: string | null;
  my_rating: number | null;
  rated_at: string | null;
}

// IMDb-compatible CSV (Const, Your Rating, Date Rated, ...). Entries without IMDb id are left out.
export function buildImdbCsv(entries: ExportEntry[]): string {
  const header = ['Const', 'Your Rating', 'Date Rated', 'Title', 'URL', 'Title Type', 'Year'];
  const rows = entries
    .filter((e) => e.imdb_id)
    .map((e) => [
      e.imdb_id,
      e.my_rating ?? '',
      e.my_rating && e.rated_at ? e.rated_at.slice(0, 10) : '',
      e.title,
      `https://www.imdb.com/title/${e.imdb_id}/`,
      e.media_type === 'tv' ? 'TV Series' : 'Movie',
      e.release_date?.slice(0, 4) ?? '',
    ]);
  return toCsv([header, ...rows]);
}
