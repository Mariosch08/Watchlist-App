import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Messages, useSubmit } from '../components/Form.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { requestPasswordReset } from '../lib/api/auth.js';

export default function ForgotPasswordPage() {
  useDocumentTitle('Passwort zurücksetzen');
  const location = useLocation();
  const [email, setEmail] = useState('');
  const { busy, error, info, run } = useSubmit();

  const onSubmit = (e) => {
    e.preventDefault();
    run(async ({ setInfo }) => {
      await requestPasswordReset(email);
      setInfo('Falls ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt. Er ist eine Stunde gültig.');
    });
  };

  return (
    <section className="card card--auth" aria-labelledby="forgot-title">
      <h1 id="forgot-title" tabIndex={-1}>
        Passwort zurücksetzen
      </h1>
      <form onSubmit={onSubmit}>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Messages error={error} info={info} />
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Wird gesendet …' : 'Link senden'}
        </button>
      </form>
      <p className="links">
        <Link to="/login" state={location.state}>
          Zurück zur Anmeldung
        </Link>
      </p>
    </section>
  );
}
