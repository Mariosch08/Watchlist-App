import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Messages, useSubmit } from '../components/Form.jsx';
import { unwrap } from '../lib/errors.js';
import { appUrl, supabase } from '../lib/supabase.js';

export default function RegisterPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ email: '', password: '', password2: '', invite: params.get('invite') ?? '' });
  const [done, setDone] = useState(false);
  const { busy, error, run, setError } = useSubmit();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = (e) => {
    e.preventDefault();
    if (form.password !== form.password2) return setError('Die Passwörter stimmen nicht überein.');
    run(async () => {
      const invite = form.invite.trim();
      // The very first user needs no code; the database trigger enforces the real rule.
      if (invite && !unwrap(await supabase.rpc('check_invite', { code: invite }))) {
        throw new Error('Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.');
      }
      unwrap(
        await supabase.auth.signUp({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          options: { data: { invite_code: invite }, emailRedirectTo: appUrl() },
        }),
      );
      setDone(true);
    });
  };

  if (done) {
    return (
      <div className="panel panel--narrow panel--ticket reveal">
        <p className="eyebrow">Nur mit Einladung</p>
      <h1>Fast geschafft</h1>
        <p>Wir haben dir eine E-Mail an {form.email} geschickt. Klicke auf den Link darin, um dein Konto zu bestätigen.</p>
        <Link to="/login">Zur Anmeldung</Link>
      </div>
    );
  }

  return (
    <form className="panel panel--narrow panel--ticket reveal" onSubmit={onSubmit}>
      <h1>Registrieren</h1>
      <p className="muted">Die Registrierung ist nur mit einem Einladungscode möglich.</p>
      <label>
        Einladungscode
        <input value={form.invite} onChange={set('invite')} autoComplete="off" />
      </label>
      <label>
        E-Mail
        <input type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
      </label>
      <label>
        Passwort (mind. 10 Zeichen)
        <input type="password" autoComplete="new-password" minLength={10} required value={form.password} onChange={set('password')} />
      </label>
      <label>
        Passwort wiederholen
        <input type="password" autoComplete="new-password" required value={form.password2} onChange={set('password2')} />
      </label>
      <Messages error={error} />
      <button disabled={busy}>{busy ? 'Registrieren …' : 'Registrieren'}</button>
      <p className="links">
        <Link to="/login">Schon ein Konto? Anmelden</Link>
      </p>
    </form>
  );
}
