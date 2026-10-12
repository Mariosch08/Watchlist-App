import { downloadFile } from '../download.js';
import { AppError, unwrap } from '../errors.js';
import { invokeFunction, supabase } from '../supabase.js';

const MAX_FILE_BYTES = 5_000_000;
const JOB_COLUMNS = 'id, kind, file_path, status, total, processed, imported, updated, skipped, not_found, error, created_at, finished_at';

export async function fetchRecentJobs(limit = 10) {
  return unwrap(await supabase.from('import_jobs').select(JOB_COLUMNS).order('created_at', { ascending: false }).limit(limit));
}

export async function startImport(file) {
  if (file.size > MAX_FILE_BYTES) throw new AppError('Die Datei ist zu gross (max. 5 MB).');
  const csv = await file.text();
  return (await invokeFunction('imdb', { action: 'start', csv, filename: file.name })).job;
}

export async function continueImport(jobId) {
  return (await invokeFunction('imdb', { action: 'continue', job_id: jobId })).job;
}

// Rows are identified by their IMDb id or, for Letterboxd/Trakt rows without one, by `ref`.
export const rowRef = (row) => row.ref ?? row.imdb_id;

export async function resolveNotFound(jobId, ref, match) {
  return (
    await invokeFunction('imdb', {
      action: 'resolve',
      job_id: jobId,
      ref,
      media_type: match.media_type,
      tmdb_id: match.tmdb_id,
    })
  ).job;
}

export async function dismissNotFound(jobId, ref) {
  return (await invokeFunction('imdb', { action: 'dismiss', job_id: jobId, ref })).job;
}

export async function exportImdbCsv() {
  const res = await invokeFunction('imdb', { action: 'export' });
  downloadFile(res.csv, res.filename, 'text/csv;charset=utf-8');
  return res;
}
