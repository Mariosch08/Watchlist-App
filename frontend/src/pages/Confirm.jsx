import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cognito } from '../auth/session.js';
import { Messages, useSubmit } from '../components/Form.jsx';

export default function ConfirmPage() {
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const { busy, error, info, run } = useSubmit();
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    run(async () => {
      await cognito.confirmSignUp(email.trim().toLowerCase(), code.trim());
      navigate('/login', { replace: true });
    });
  };
  const resend = () =>
    run(async ({ setInfo }) => {
      await cognito.resendCode(email.trim().toLowerCase());
      setInfo('Ein neuer Code wurde gesendet.');
    });

  return (
    <form className="card narrow" onSubmit={onSubmit}>
      <h1>E-Mail bestätigen</h1>
      <p className="muted">Wir haben dir einen Bestätigungscode per E-Mail geschickt.</p>
      <label>
        E-Mail
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Code
        <input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
      </label>
      <Messages error={error} info={info} />
      <button disabled={busy}>Bestätigen</button>
      <p className="links">
        <button type="button" className="link" disabled={busy || !email} onClick={resend}>
          Code erneut senden
        </button>{' '}
        · <Link to="/login">Zur Anmeldung</Link>
      </p>
    </form>
  );
}
