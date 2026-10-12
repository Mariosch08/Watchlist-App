import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { needsPassword, useAuth } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { PASSWORD_MIN_LENGTH, setPassword, signOutHere, signOutOtherDevices } from '../lib/api/auth.js';

// Used after a reset link (recovery session) and for friends invited via the dashboard (no password yet).
export default function ResetPasswordPage() {
  const { user, loading, recovery } = useAuth();
  const firstPassword = needsPassword(user);
  useDocumentTitle(firstPassword ? 'Passwort festlegen' : 'Neues Passwort');
  const [password, setPw] = useState('');
  const [password2, setPw2] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const { busy, error, run } = useSubmit();
  const navigate = useNavigate();
  const toast = useToast();

  const onSubmit = (e) => {
    e.preventDefault();
    if (password !== password2) {
      setMismatch(true);
      return;
    }
    run(async () => {
      await setPassword(password);
      // After a reset, other devices may still use the old password: sign them out.
      if (recovery) await signOutOtherDevices().catch(() => {});
      toast.success(firstPassword ? 'Passwort festgelegt. Willkommen!' : 'Passwort geändert.');
      navigate('/', { replace: true });
    });
  };

  if (loading) return <CardSkeleton />;
  if (!user) {
    return (
      <section className="card card--auth">
        <h1 tabIndex={-1}>Link abgelaufen</h1>
        <p>Der Link ist ungültig oder abgelaufen.</p>
        <p className="links">
          <Link to="/forgot-password">Neuen Link anfordern</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="card card--auth" aria-labelledby="reset-title">
      <h1 id="reset-title" tabIndex={-1}>
        {firstPassword ? 'Passwort festlegen' : 'Neues Passwort'}
      </h1>
      {firstPassword && <p className="muted">Du wurdest eingeladen. Lege ein Passwort fest, damit du dich künftig anmelden kannst.</p>}
      <form onSubmit={onSubmit}>
        <label>
          Neues Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={password}
            onChange={(e) => setPw(e.target.value)}
            aria-describedby="new-password-help"
          />
          <span id="new-password-help" className="caption">
            Mindestens {PASSWORD_MIN_LENGTH} Zeichen.
          </span>
        </label>
        <label>
          Passwort wiederholen
          <input
            type="password"
            autoComplete="new-password"
            required
            value={password2}
            onChange={(e) => {
              setPw2(e.target.value);
              setMismatch(false);
            }}
            aria-invalid={mismatch ? 'true' : undefined}
            aria-describedby={mismatch ? 'reset-mismatch' : undefined}
          />
          {mismatch && (
            <span id="reset-mismatch" className="field-error">
              Die Passwörter stimmen nicht überein.
            </span>
          )}
        </label>
        <Messages error={error} />
        <div className="actions">
          <button className="btn-primary" disabled={busy}>
            {busy ? 'Wird gespeichert …' : 'Passwort speichern'}
          </button>
          {recovery && (
            <button type="button" className="btn-ghost" onClick={() => signOutHere()}>
              Abbrechen
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
