import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../src/lib/errors.js';
import { ensureImportRunning, getImportState, resetImport, subscribeImport } from '../src/lib/importRunner.js';

const job = (processed, status = 'processing') => ({ id: 'job-1', total: 3, processed, status, imported: processed, updated: 0, skipped: 0, not_found: [] });
const sleep = () => Promise.resolve();

afterEach(() => resetImport());

describe('importRunner', () => {
  it('runs batches until done and reports progress', async () => {
    const continueImport = vi.fn().mockResolvedValueOnce(job(2)).mockResolvedValueOnce(job(3, 'done'));
    const seen = [];
    const unsub = subscribeImport(() => seen.push(getImportState().job?.processed));
    const final = await ensureImportRunning(job(0), { continueImport, sleep });
    unsub();
    expect(final.status).toBe('done');
    expect(continueImport).toHaveBeenCalledTimes(2);
    expect(seen).toContain(2);
    expect(getImportState().running).toBe(false);
  });

  it('attaches to the running loop instead of starting a second one', async () => {
    let release;
    const continueImport = vi.fn(() => new Promise((r) => (release = () => r(job(3, 'done')))));
    const a = ensureImportRunning(job(0), { continueImport, sleep });
    const b = ensureImportRunning(job(0), { continueImport, sleep });
    expect(a).toBe(b);
    release();
    await a;
    expect(continueImport).toHaveBeenCalledTimes(1);
  });

  it('retries transient errors and stops on permanent ones', async () => {
    const transient = new AppError('x', { status: 502, retryable: true });
    const continueImport = vi.fn().mockRejectedValueOnce(transient).mockResolvedValueOnce(job(3, 'done'));
    expect((await ensureImportRunning(job(0), { continueImport, sleep })).status).toBe('done');

    resetImport();
    const permanent = new AppError('weg', { status: 404, retryable: false });
    const failing = vi.fn().mockRejectedValue(permanent);
    await ensureImportRunning(job(0), { continueImport: failing, sleep });
    expect(failing).toHaveBeenCalledTimes(1);
    expect(getImportState().error).toBe(permanent);
  });

  it('gives up after too many transient failures', async () => {
    const failing = vi.fn().mockRejectedValue(new AppError('x', { retryable: true }));
    await ensureImportRunning(job(0), { continueImport: failing, sleep, maxRetries: 2 });
    expect(failing).toHaveBeenCalledTimes(3);
  });

  it('stops when reset (e.g. sign-out)', async () => {
    let release;
    const continueImport = vi.fn(() => new Promise((r) => (release = () => r(job(1)))));
    const p = ensureImportRunning(job(0), { continueImport, sleep });
    resetImport();
    release();
    await p;
    expect(continueImport).toHaveBeenCalledTimes(1);
    expect(getImportState().job).toBeNull();
  });
});
