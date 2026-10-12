import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { unwrap } from '../lib/errors.js';
import { supabase } from '../lib/supabase.js';

// Opened via the e-mail link; Supabase signs the user in with a recovery session.
export default function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    run(async () => {
      unwrap(await supabase.auth.updateUser({ password }));
      await supabase.auth.signOut();
      navigate('/login', { replace: true });
    });
  };

  if (loading) return <p>Lade …</p>;
  if (!user) return <p className="panel panel--narrow panel--ticket reveal">Der Link ist ungültig oder abgelaufen. Fordere unter „Passwort vergessen“ einen neuen an.</p>;
  return (
    <form className="panel panel--narrow panel--ticket reveal" onSubmit={onSubmit}>
      <h1>Neues Passwort setzen</h1>
      <label>
        Neues Passwort
        <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Messages error={error} />
      <button disabled={busy}>Passwort speichern</button>
    </form>
  );
}
