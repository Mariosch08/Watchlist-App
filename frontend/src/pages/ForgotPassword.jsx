import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cognito } from '../auth/session.js';
import { Messages, useSubmit } from '../components/Form.jsx';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const navigate = useNavigate();
  const normalized = () => email.trim().toLowerCase();

  const onRequest = (e) => {
    e.preventDefault();
    run(async () => {
      await cognito.forgotPassword(normalized());
      setStep('confirm');
    });
  };
  const onConfirm = (e) => {
    e.preventDefault();
    run(async () => {
      await cognito.confirmForgotPassword(normalized(), code.trim(), password);
      navigate('/login', { replace: true });
    });
  };

  return step === 'request' ? (
    <form className="card narrow" onSubmit={onRequest}>
      <h1>Passwort vergessen</h1>
      <label>
        E-Mail
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Messages error={error} />
      <button disabled={busy}>Code anfordern</button>
      <p className="links">
        <Link to="/login">Zurück zur Anmeldung</Link>
      </p>
    </form>
  ) : (
    <form className="card narrow" onSubmit={onConfirm}>
      <h1>Neues Passwort setzen</h1>
      <p className="muted">Falls ein Konto zu {email} existiert, haben wir dir einen Code geschickt.</p>
      <label>
        Code
        <input autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <label>
        Neues Passwort
        <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Messages error={error} />
      <button disabled={busy}>Passwort speichern</button>
    </form>
  );
}
