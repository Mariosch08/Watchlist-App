import { downloadFile } from './download.js';
import { unwrap } from './errors.js';
import { invokeFunction, supabase } from './supabase.js';

const MAX_FILE_BYTES = 5_000_000;
const MAX_BATCH_RETRIES = 3;

export async function latestImportJob() {
  const rows = unwrap(
    await supabase
      .from('import_jobs')
      .select('id, kind, file_path, status, total, processed, imported, updated, skipped, not_found, created_at, finished_at')
      .order('created_at', { ascending: false })
      .limit(1),
  );
  return rows[0] ?? null;
}

export async function startImport(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Die Datei ist zu gross (max. 5 MB).');
  const csv = await file.text();
  try {
    return (await invokeFunction('imdb', { action: 'start', csv, filename: file.name })).job;
  } catch (err) {
    if (/NOT_IMDB_CSV/.test(err.message)) throw new Error('Das ist keine IMDb-CSV-Datei (Spalte „Const“ fehlt).');
    throw err;
  }
}

// Processes batches until the job is done; reports progress after each batch.
export async function runImport(job, onProgress) {
  let current = job;
  let failures = 0;
  while (current.status === 'processing') {
    try {
      current = (await invokeFunction('imdb', { action: 'continue', job_id: current.id })).job;
      failures = 0;
      onProgress(current);
    } catch (err) {
      if (++failures > MAX_BATCH_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 1500 * failures));
    }
  }
  return current;
}

export async function resolveNotFound(jobId, imdbId, match) {
  return (
    await invokeFunction('imdb', {
      action: 'resolve',
      job_id: jobId,
      imdb_id: imdbId,
      media_type: match.media_type,
      tmdb_id: match.tmdb_id,
    })
  ).job;
}

export async function exportImdbCsv() {
  const res = await invokeFunction('imdb', { action: 'export' });
  downloadFile(res.csv, res.filename, 'text/csv;charset=utf-8');
  return res;
}

export async function exportJson() {
  const data = unwrap(await supabase.rpc('export_my_data'));
  downloadFile(JSON.stringify(data, null, 2), 'watchlist-export.json', 'application/json');
}
