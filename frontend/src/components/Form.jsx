import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { errorMessage } from '../lib/errors.js';

// Small helper: runs an async submit handler and exposes busy/error/info state.
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  async function run(fn) {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn({ setInfo });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, info, run, setError };
}

// Status messages always carry an icon and text, never color alone.
export function Messages({ error, info }) {
  return (
    <>
      {error && (
        <p className="notice notice--error" role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      {info && (
        <p className="notice notice--success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{info}</span>
        </p>
      )}
    </>
  );
}
