import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { safeReturnPath } from '../auth/guards.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { resendConfirmation, signIn } from '../lib/api/auth.js';

const REASON_TEXT = {
  expired: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  deleted: 'Dein Konto und alle Daten wurden gelöscht.',
};

const URL_ERROR_TEXT = {
  otp_expired: 'Der Link aus der E-Mail ist abgelaufen oder wurde schon verwendet. Melde dich an oder fordere unten eine neue Bestätigungsmail an.',
};

export default function LoginPage() {
  useDocumentTitle('Anmelden');
  const { signedOutReason, urlError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const { busy, error, info, run } = useSubmit();
  const resend = useSubmit();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from;

  const onSubmit = (e) => {
    e.preventDefault();
    setUnconfirmed(false);
    run(async () => {
      try {
        await signIn(email, password);
        navigate(safeReturnPath(from), { replace: true });
      } catch (err) {
        if (err?.code === 'email_not_confirmed') setUnconfirmed(true);
        throw err;
      }
    });
  };

  const resendMail = () =>
    resend.run(async ({ setInfo }) => {
      await resendConfirmation(email);
      setInfo(`Wir haben eine neue Bestätigungsmail an ${email.trim()} geschickt.`);
    });

  const notice = urlError ? (URL_ERROR_TEXT[urlError.code] ?? `Der Link aus der E-Mail funktioniert nicht (${urlError.description || urlError.code}).`) : REASON_TEXT[signedOutReason];

  return (
    <section className="card card--auth" aria-labelledby="login-title">
      <h1 id="login-title" tabIndex={-1}>
        Anmelden
      </h1>
      <p className="muted">Deine Filme und Serien, mit Freunden geteilt.</p>
      {notice && <Messages info={notice} />}
      <form onSubmit={onSubmit}>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Messages error={error} info={info} />
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
      {(unconfirmed || urlError) && (
        <div className="stack">
          <button type="button" disabled={resend.busy || !email.trim()} onClick={resendMail}>
            {resend.busy ? 'Wird gesendet …' : 'Bestätigungsmail erneut senden'}
          </button>
          {!email.trim() && <span className="caption">Gib oben deine E-Mail-Adresse ein.</span>}
          <Messages error={resend.error} info={resend.info} />
        </div>
      )}
      <p className="links">
        <Link to="/forgot-password" state={{ from }}>
          Passwort vergessen
        </Link>{' '}
        ·{' '}
        <Link to="/register" state={{ from }}>
          Mit Einladung registrieren
        </Link>
      </p>
    </section>
  );
}
