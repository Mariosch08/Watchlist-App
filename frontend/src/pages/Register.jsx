import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { cognito } from '../auth/session.js';
import { Messages, useSubmit } from '../components/Form.jsx';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '', password2: '', invite: params.get('invite') ?? '' });
  const { busy, error, run, setError } = useSubmit();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = (e) => {
    e.preventDefault();
    if (form.password !== form.password2) return setError('Die Passwörter stimmen nicht überein.');
    run(async () => {
      const email = form.email.trim().toLowerCase();
      await cognito.signUp(email, form.password, form.invite.trim());
      navigate('/confirm', { state: { email } });
    });
  };

  return (
    <form className="card narrow" onSubmit={onSubmit}>
      <h1>Registrieren</h1>
      <p className="muted">Die Registrierung ist nur mit einem Einladungscode möglich.</p>
      <label>
        Einladungscode
        <input required value={form.invite} onChange={set('invite')} autoComplete="off" />
      </label>
      <label>
        E-Mail
        <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      </label>
      <label>
        Passwort (mind. 10 Zeichen, Kleinbuchstaben und Zahlen)
        <input type="password" autoComplete="new-password" minLength={10} required value={form.password} onChange={set('password')} />
      </label>
      <label>
        Passwort wiederholen
        <input type="password" autoComplete="new-password" required value={form.password2} onChange={set('password2')} />
      </label>
      <Messages error={error} />
      <button disabled={busy}>{busy ? 'Registrieren …' : 'Registrieren'}</button>
      <p className="links">
        <Link to="/login">Schon ein Konto? Anmelden</Link> · <Link to="/confirm">Code eingeben</Link>
      </p>
    </form>
  );
}
