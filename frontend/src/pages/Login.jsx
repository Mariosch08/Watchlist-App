import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signIn } from '../auth/session.js';
import { Messages, useSubmit } from '../components/Form.jsx';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const navigate = useNavigate();
  const location = useLocation();

  const onSubmit = (e) => {
    e.preventDefault();
    run(async () => {
      try {
        await signIn(email, password);
        navigate(location.state?.from ?? '/', { replace: true });
      } catch (err) {
        if (err.code === 'UserNotConfirmedException') navigate('/confirm', { state: { email } });
        else throw err;
      }
    });
  };

  return (
    <form className="card narrow" onSubmit={onSubmit}>
      <h1>Anmelden</h1>
      <label>
        E-Mail
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Passwort
        <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Messages error={error} />
      <button disabled={busy}>{busy ? 'Anmelden …' : 'Anmelden'}</button>
      <p className="links">
        <Link to="/forgot-password">Passwort vergessen?</Link> · <Link to="/register">Registrieren (mit Einladung)</Link>
      </p>
    </form>
  );
}
