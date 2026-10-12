import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Messages, useSubmit } from '../components/Form.jsx';
import { unwrap } from '../lib/errors.js';
import { supabase } from '../lib/supabase.js';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = (e) => {
    e.preventDefault();
    run(async () => {
      unwrap(await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }));
      navigate(location.state?.from ?? '/', { replace: true });
    });
  };

  return (
    <section className="card card--auth" aria-labelledby="login-title">
      <h1 id="login-title">Anmelden</h1>
      <p className="muted">Deine Filme und Serien, mit Freunden geteilt.</p>
      <form onSubmit={onSubmit}>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Passwort
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Messages error={error} />
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Anmelden …' : 'Anmelden'}
        </button>
      </form>
      <p className="links">
        <Link to="/forgot-password">Passwort vergessen</Link> · <Link to="/register">Mit Einladung registrieren</Link>
      </p>
    </section>
  );
}
