// IMDb import/export. Actions:
//  start    { csv, filename }                          -> parses CSV, creates import job
//  continue { job_id }                                 -> processes the next batch
//  resolve  { job_id, imdb_id, media_type, tmdb_id }   -> manual match for a not-found title
//  dismiss  { job_id, imdb_id }                        -> drops a not-found title without importing it
//  export   { }                                        -> IMDb-compatible CSV of the watchlist
import { adminClient } from '../_shared/admin.ts';
import { requireUser } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { buildImdbCsv, ExistingEntry, ImportRow, MediaType, parseImdbExport, pickFindResult } from '../_shared/imdb.ts';
import { applyRow, BATCH_SIZE, BatchResult, ImportDeps, mapLimited, MatchedTitle, processBatch } from '../_shared/importJob.ts';
import { HttpError, normalizeTitle, tmdbGet, TMDB_LANGUAGE } from '../_shared/tmdb.ts';

const MAX_CSV_CHARS = 5_000_000;
const MAX_ROWS = 20_000;
const NEGATIVE_CACHE_DAYS = 7;
const JOB_FIELDS = 'id, kind, file_path, status, total, processed, imported, updated, skipped, not_found, error, created_at, finished_at';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

const tmdbToken = () => {
  const token = Deno.env.get('TMDB_API_KEY');
  if (!token) throw new HttpError(500, 'TMDB_API_KEY is not configured', 'TMDB_NOT_CONFIGURED');
  return token;
};

function deps(db: ReturnType<typeof adminClient>, userId: string): ImportDeps {
  return {
    async lookup(row: ImportRow) {
      const key = `imdb:${row.imdb_id}`;
      const { data: cached } = await db.from('tmdb_cache').select('data, expires_at').eq('cache_key', key).maybeSingle();
      if (cached && (!cached.expires_at || new Date(cached.expires_at) > new Date())) {
        return cached.data?.none ? null : (cached.data as MatchedTitle);
      }
      const find = await tmdbGet(`/find/${row.imdb_id}`, { external_source: 'imdb_id', language: TMDB_LANGUAGE }, tmdbToken(), fetch);
      const picked = pickFindResult(find, row.title_type);
      const match = picked ? (normalizeTitle(picked.raw, picked.media_type) as MatchedTitle) : null;
      await db.from('tmdb_cache').upsert({
        cache_key: key,
        kind: 'mapping',
        data: match ?? { none: true },
        fetched_at: new Date().toISOString(),
        expires_at: match ? null : new Date(Date.now() + NEGATIVE_CACHE_DAYS * 86_400_000).toISOString(),
      });
      return match;
    },
    async getExisting(mediaType: MediaType, tmdbId: number) {
      const { data, error } = await db
        .from('watchlist')
        .select('status, my_rating, rated_at, imdb_id, runtime')
        .match({ user_id: userId, media_type: mediaType, tmdb_id: tmdbId })
        .maybeSingle();
      if (error) throw error;
      return data as ExistingEntry | null;
    },
    async isTombstoned(mediaType: MediaType, tmdbId: number) {
      const { data } = await db
        .from('watchlist_tombstones')
        .select('tmdb_id')
        .match({ user_id: userId, media_type: mediaType, tmdb_id: tmdbId })
        .maybeSingle();
      return Boolean(data);
    },
    async insert(title: MatchedTitle, values: Record<string, unknown>) {
      const { error } = await db.from('watchlist').upsert(
        {
          user_id: userId,
          media_type: title.media_type,
          tmdb_id: title.tmdb_id,
          title: title.title.slice(0, 300),
          original_title: title.original_title?.slice(0, 300) ?? null,
          poster_path: title.poster_path,
          release_date: title.release_date,
          vote_average: title.vote_average ? Math.round(title.vote_average * 10) / 10 : null,
          ...values,
        },
        { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true },
      );
      if (error) throw error;
    },
    async update(mediaType: MediaType, tmdbId: number, values: Record<string, unknown>) {
      const { error } = await db.from('watchlist').update(values).match({ user_id: userId, media_type: mediaType, tmdb_id: tmdbId });
      if (error) throw error;
    },
  };
}

async function loadJob(db: ReturnType<typeof adminClient>, userId: string, jobId: unknown) {
  if (typeof jobId !== 'string' || !/^[0-9a-f-]{36}$/.test(jobId)) throw new HttpError(400, 'Invalid job_id', 'INVALID_INPUT');
  const { data } = await db.from('import_jobs').select(`${JOB_FIELDS}, items`).match({ id: jobId, user_id: userId }).maybeSingle();
  if (!data) throw new HttpError(404, 'Job not found', 'JOB_NOT_FOUND');
  return data;
}

async function start(db: ReturnType<typeof adminClient>, userId: string, body: any) {
  if (typeof body.csv !== 'string' || !body.csv.trim()) throw new HttpError(400, 'csv is required', 'INVALID_INPUT');
  if (body.csv.length > MAX_CSV_CHARS) throw new HttpError(413, 'CSV too large', 'CSV_TOO_LARGE');
  const filename = typeof body.filename === 'string' ? body.filename.slice(0, 300) : null;
  let parsed;
  try {
    parsed = parseImdbExport(body.csv, filename ?? '');
  } catch {
    throw new HttpError(400, 'NOT_IMDB_CSV', 'NOT_IMDB_CSV');
  }
  if (parsed.rows.length > MAX_ROWS) throw new HttpError(413, 'Too many rows', 'TOO_MANY_ROWS');
  const { data, error } = await db
    .from('import_jobs')
    .insert({
      user_id: userId,
      kind: parsed.kind,
      file_path: filename,
      status: parsed.rows.length ? 'processing' : 'done',
      total: parsed.rows.length,
      skipped: parsed.skipped.length,
      items: parsed.rows,
      finished_at: parsed.rows.length ? null : new Date().toISOString(),
    })
    .select(JOB_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

async function advance(db: ReturnType<typeof adminClient>, userId: string, body: any) {
  const job = await loadJob(db, userId, body.job_id);
  if (job.status !== 'processing') {
    const { items: _items, ...rest } = job;
    return rest;
  }
  const rows = (job.items as ImportRow[]).slice(job.processed, job.processed + BATCH_SIZE);
  let result: BatchResult;
  try {
    result = await processBatch(rows, deps(db, userId));
  } catch (err) {
    console.error(err);
    await db.from('import_jobs').update({ error: 'Batch failed, will retry' }).eq('id', job.id);
    throw new HttpError(502, 'Batch failed, please continue', 'BATCH_FAILED');
  }
  const processed = job.processed + result.processed;
  const done = processed >= job.total;
  const { data, error } = await db
    .from('import_jobs')
    .update({
      processed,
      imported: job.imported + result.imported,
      updated: job.updated + result.updated,
      skipped: job.skipped + result.skipped,
      not_found: [...(job.not_found as ImportRow[]), ...result.not_found],
      status: done ? 'done' : 'processing',
      finished_at: done ? new Date().toISOString() : null,
      ...(done ? { items: [] } : {}),
      error: null,
    })
    .eq('id', job.id)
    .select(JOB_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

async function resolve(db: ReturnType<typeof adminClient>, userId: string, body: any) {
  const job = await loadJob(db, userId, body.job_id);
  const notFound = job.not_found as ImportRow[];
  const row = notFound.find((r) => r.imdb_id === body.imdb_id);
  if (!row) throw new HttpError(404, 'Title not in not-found list', 'NOT_IN_LIST');
  const mediaType = body.media_type;
  const tmdbId = body.tmdb_id;
  if (!['movie', 'tv'].includes(mediaType) || !Number.isInteger(tmdbId) || tmdbId < 1) throw new HttpError(400, 'Invalid match', 'INVALID_INPUT');
  const raw = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: TMDB_LANGUAGE }, tmdbToken(), fetch);
  if (!raw) throw new HttpError(404, 'TMDb title not found', 'NOT_FOUND');
  const match = normalizeTitle(raw, mediaType) as MatchedTitle;
  await db.from('tmdb_cache').upsert({ cache_key: `imdb:${row.imdb_id}`, kind: 'mapping', data: match, expires_at: null });
  const result: BatchResult = { processed: 0, imported: 0, updated: 0, skipped: 0, not_found: [] };
  await applyRow(row, match, deps(db, userId), result);
  const { data, error } = await db
    .from('import_jobs')
    .update({
      imported: job.imported + result.imported,
      updated: job.updated + result.updated,
      skipped: job.skipped + result.skipped,
      not_found: notFound.filter((r) => r.imdb_id !== row.imdb_id),
    })
    .eq('id', job.id)
    .select(JOB_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

async function dismiss(db: ReturnType<typeof adminClient>, userId: string, body: any) {
  const job = await loadJob(db, userId, body.job_id);
  const notFound = job.not_found as ImportRow[];
  if (!notFound.some((r) => r.imdb_id === body.imdb_id)) throw new HttpError(404, 'Title not in not-found list', 'NOT_IN_LIST');
  const { data, error } = await db
    .from('import_jobs')
    .update({ not_found: notFound.filter((r) => r.imdb_id !== body.imdb_id), skipped: job.skipped + 1 })
    .eq('id', job.id)
    .select(JOB_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

async function exportCsv(db: ReturnType<typeof adminClient>, userId: string) {
  // PostgREST returns at most 1000 rows per request: read all pages with a stable order.
  const entries: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('watchlist')
      .select('media_type, tmdb_id, imdb_id, title, release_date, my_rating, rated_at')
      .eq('user_id', userId)
      .order('added_at')
      .order('media_type')
      .order('tmdb_id')
      .range(from, from + 999);
    if (error) throw error;
    entries.push(...data);
    if (data.length < 1000) break;
  }
  // Fill in missing IMDb ids (manually added titles) and remember them. One failed lookup never fails the export.
  const missing = entries.filter((x) => !x.imdb_id);
  await mapLimited(missing, 6, async (e) => {
    try {
      const ids = await tmdbGet(`/${e.media_type}/${e.tmdb_id}/external_ids`, {}, tmdbToken(), fetch);
      if (ids?.imdb_id && /^tt\d{5,10}$/.test(ids.imdb_id)) {
        e.imdb_id = ids.imdb_id;
        await db.from('watchlist').update({ imdb_id: ids.imdb_id }).match({ user_id: userId, media_type: e.media_type, tmdb_id: e.tmdb_id });
      }
    } catch (err) {
      console.warn('external_ids lookup failed', e.media_type, e.tmdb_id, err);
    }
  });
  return {
    csv: buildImdbCsv(entries),
    filename: `watchlist-imdb-${new Date().toISOString().slice(0, 10)}.csv`,
    exported: entries.filter((e) => e.imdb_id).length,
    missing: entries.filter((e) => !e.imdb_id).length,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const user = await requireUser(req);
  if (!user) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body', 'INVALID_INPUT');
    const db = adminClient();
    switch (body.action) {
      case 'start':
        return json(200, { job: await start(db, user.id, body) });
      case 'continue':
        return json(200, { job: await advance(db, user.id, body) });
      case 'resolve':
        return json(200, { job: await resolve(db, user.id, body) });
      case 'dismiss':
        return json(200, { job: await dismiss(db, user.id, body) });
      case 'export':
        return json(200, await exportCsv(db, user.id));
      default:
        throw new HttpError(400, 'Unknown action', 'INVALID_INPUT');
    }
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message, code: err.code });
    console.error(err);
    return json(500, { error: 'Internal error', code: 'INTERNAL' });
  }
});
