import { useState } from 'react';
import { CognitoError, errorMessage } from '../auth/cognito.js';

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
      setError(err instanceof CognitoError ? errorMessage(err) : err.message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, info, run, setError };
}

export function Messages({ error, info }) {
  return (
    <>
      {error && <p className="error" role="alert">{error}</p>}
      {info && <p className="info">{info}</p>}
    </>
  );
}
