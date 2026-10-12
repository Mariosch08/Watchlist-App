import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Messages, useSubmit } from '../components/Form.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { PASSWORD_MIN_LENGTH, resendConfirmation, signUp } from '../lib/api/auth.js';

export default function RegisterPage() {
  useDocumentTitle('Registrieren');
  const [params] = useSearchParams();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '', password2: '', invite: params.get('invite') ?? '' });
  const [done, setDone] = useState(false);
  const [fieldError, setFieldError] = useState({});
  const { busy, error, run, setError } = useSubmit();
  const resend = useSubmit();
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setFieldError((f) => ({ ...f, [k]: undefined }));
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (form.password !== form.password2) {
      setFieldError({ password2: 'Die Passwörter stimmen nicht überein.' });
      return;
    }
    setError('');
    run(async () => {
      try {
        await signUp({ email: form.email, password: form.password, inviteCode: form.invite });
        setDone(true);
      } catch (err) {
        if (err.field) {
          setFieldError({ [err.field]: err.message });
          return;
        }
        throw err;
      }
    });
  };

  if (done) {
    return (
      <section className="card card--auth" aria-labelledby="register-done">
        <h1 id="register-done" tabIndex={-1}>
          E-Mail bestätigen
        </h1>
        <p>
          Wir haben eine E-Mail an <strong>{form.email.trim()}</strong> geschickt. Öffne den Link darin, um dein Konto zu bestätigen.
        </p>
        <p className="caption">Keine Mail erhalten? Schau im Spam-Ordner nach oder lass sie dir erneut schicken.</p>
        <div className="actions">
          <button
            disabled={resend.busy}
            onClick={() =>
              resend.run(async ({ setInfo }) => {
                await resendConfirmation(form.email);
                setInfo('Neue Bestätigungsmail gesendet.');
              })
            }
          >
            {resend.busy ? 'Wird gesendet …' : 'Mail erneut senden'}
          </button>
        </div>
        <Messages error={resend.error} info={resend.info} />
        <p className="links">
          <Link to="/login" state={location.state}>
            Zur Anmeldung
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section className="card card--auth" aria-labelledby="register-title">
      <h1 id="register-title" tabIndex={-1}>
        Registrieren
      </h1>
      <p className="muted">Die Registrierung ist nur mit Einladungscode möglich.</p>
      <form onSubmit={onSubmit} noValidate={false}>
        <label>
          Einladungscode
          <input
            value={form.invite}
            onChange={set('invite')}
            autoComplete="off"
            className="mono"
            aria-invalid={fieldError.invite ? 'true' : undefined}
            aria-describedby={fieldError.invite ? 'invite-error' : undefined}
          />
          {fieldError.invite && (
            <span id="invite-error" className="field-error">
              {fieldError.invite}
            </span>
          )}
        </label>
        <label>
          E-Mail
          <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        </label>
        <label>
          Passwort
          <input
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={form.password}
            onChange={set('password')}
            aria-describedby="password-help"
          />
          <span id="password-help" className="caption">
            Mindestens {PASSWORD_MIN_LENGTH} Zeichen.
          </span>
        </label>
        <label>
          Passwort wiederholen
          <input
            type="password"
            autoComplete="new-password"
            required
            value={form.password2}
            onChange={set('password2')}
            aria-invalid={fieldError.password2 ? 'true' : undefined}
            aria-describedby={fieldError.password2 ? 'password2-error' : undefined}
          />
          {fieldError.password2 && (
            <span id="password2-error" className="field-error">
              {fieldError.password2}
            </span>
          )}
        </label>
        <Messages error={error} />
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Konto wird erstellt …' : 'Konto erstellen'}
        </button>
      </form>
      <p className="links">
        <Link to="/login" state={location.state}>
          Bereits registriert? Anmelden
        </Link>
      </p>
    </section>
  );
}
