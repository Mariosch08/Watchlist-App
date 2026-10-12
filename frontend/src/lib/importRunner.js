// Runs an IMDb import job outside of React so it survives navigation between pages.
// Only one job runs at a time; starting the same job again attaches to the running loop.
import { isRetryable } from './errors.js';

const initialState = { job: null, running: false, retrying: false, error: null };
let state = initialState;
let active = null; // { id, cancelled, promise }
const listeners = new Set();

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

export const getImportState = () => state;

export function subscribeImport(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Processes batches until the job is done, cancelled or fails permanently.
 * deps: { continueImport(jobId) -> job, onBatch?(job), sleep?(ms), maxRetries? }
 */
export function ensureImportRunning(job, deps) {
  if (active && active.id === job.id) return active.promise;
  if (active) active.cancelled = true;
  const run = { id: job.id, cancelled: false, promise: null };
  active = run;
  setState({ job, running: job.status === 'processing', retrying: false, error: null });
  run.promise = loop(job, run, deps);
  return run.promise;
}

async function loop(job, run, { continueImport, onBatch, sleep = defaultSleep, maxRetries = 4 }) {
  let current = job;
  let failures = 0;
  try {
    while (current.status === 'processing' && !run.cancelled) {
      try {
        current = await continueImport(current.id);
        failures = 0;
        if (run.cancelled) break;
        setState({ job: current, retrying: false, error: null });
        onBatch?.(current);
      } catch (err) {
        if (run.cancelled) break;
        failures += 1;
        if (!isRetryable(err) || failures > maxRetries) {
          setState({ error: err, retrying: false });
          break;
        }
        setState({ retrying: true });
        await sleep(1000 * 2 ** (failures - 1));
      }
    }
  } finally {
    if (active === run) {
      active = null;
      setState({ running: false, retrying: false });
    }
  }
  return current;
}

// Stops the loop (e.g. on sign-out) and forgets the job.
export function resetImport() {
  if (active) active.cancelled = true;
  active = null;
  state = initialState;
  listeners.forEach((fn) => fn());
}

// Lets the UI show an updated job (e.g. after resolving a title) without restarting the loop.
export function updateImportJob(job) {
  if (state.job?.id === job.id) setState({ job });
}
