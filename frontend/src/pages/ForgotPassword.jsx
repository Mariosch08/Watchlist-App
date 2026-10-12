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
    <form className="card narrow" onSubmit={onSubmit}>
      <h1>Passwort vergessen</h1>
      <label>
        E-Mail
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Messages error={error} info={info} />
      <button disabled={busy}>Link anfordern</button>
      <p className="links">
        <Link to="/login">Zurück zur Anmeldung</Link>
      </p>
    </form>
  );
}
