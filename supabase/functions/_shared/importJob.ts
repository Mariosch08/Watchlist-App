// Processes an IMDb import job in small batches (each Edge Function call handles one batch,
// the client keeps calling "continue" until done). All I/O is injected for testing.
import { ExistingEntry, ImportRow, MediaType, mergeImportRow } from './imdb.ts';

export interface MatchedTitle {
  media_type: MediaType;
  tmdb_id: number;
  title: string;
  original_title: string | null;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
}

export interface ImportDeps {
  lookup(row: ImportRow): Promise<MatchedTitle | null>;
  getExisting(mediaType: MediaType, tmdbId: number): Promise<ExistingEntry | null>;
  isTombstoned(mediaType: MediaType, tmdbId: number): Promise<boolean>;
  insert(title: MatchedTitle, values: Record<string, unknown>): Promise<void>;
  update(mediaType: MediaType, tmdbId: number, values: Record<string, unknown>): Promise<void>;
}

export interface BatchResult {
  processed: number;
  imported: number;
  updated: number;
  skipped: number;
  not_found: ImportRow[];
}

export const BATCH_SIZE = 40;
const LOOKUP_CONCURRENCY = 6;

export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function processBatch(rows: ImportRow[], deps: ImportDeps): Promise<BatchResult> {
  const result: BatchResult = { processed: rows.length, imported: 0, updated: 0, skipped: 0, not_found: [] };
  const matches = await mapLimited(rows, LOOKUP_CONCURRENCY, (row) => deps.lookup(row));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const match = matches[i];
    if (!match) {
      result.not_found.push(row);
      continue;
    }
    await applyRow(row, match, deps, result);
  }
  return result;
}

export async function applyRow(row: ImportRow, match: MatchedTitle, deps: ImportDeps, result: BatchResult) {
  const existing = await deps.getExisting(match.media_type, match.tmdb_id);
  const tombstoned = existing ? false : await deps.isTombstoned(match.media_type, match.tmdb_id);
  const decision = mergeImportRow(row, existing, tombstoned);
  if (decision.action === 'insert') {
    await deps.insert(match, decision.values);
    result.imported++;
  } else if (decision.action === 'update') {
    await deps.update(match.media_type, match.tmdb_id, decision.values);
    result.updated++;
  } else {
    result.skipped++;
  }
}
