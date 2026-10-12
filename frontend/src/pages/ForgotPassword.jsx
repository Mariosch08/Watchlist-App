import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Messages, useSubmit } from '../components/Form.jsx';
import { unwrap } from '../lib/errors.js';
import { appUrl, supabase } from '../lib/supabase.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const { busy, error, info, run } = useSubmit();

  const onSubmit = (e) => {
    e.preventDefault();
    run(async ({ setInfo }) => {
      unwrap(await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: appUrl('reset-password') }));
      setInfo('Falls ein Konto existiert, haben wir dir einen Link zum Zurücksetzen geschickt.');
    });
  };

  return (
    <section className="card card--auth" aria-labelledby="forgot-title">
      <h1 id="forgot-title">Passwort zurücksetzen</h1>
      <form onSubmit={onSubmit}>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <Messages error={error} info={info} />
        <button className="btn-primary" disabled={busy}>
          Link senden
        </button>
      </form>
      <p className="links">
        <Link to="/login">Zurück zur Anmeldung</Link>
      </p>
    </section>
  );
}
