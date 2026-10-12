import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
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

  if (loading) return <CardSkeleton />;
  if (!user) {
    return (
      <section className="card card--auth">
        <h1>Link abgelaufen</h1>
        <p>Der Link ist ungültig oder abgelaufen.</p>
        <p className="links">
          <Link to="/forgot-password">Neuen Link anfordern</Link>
        </p>
      </section>
    );
  }
  return (
    <section className="card card--auth" aria-labelledby="reset-title">
      <h1 id="reset-title">Neues Passwort</h1>
      <form onSubmit={onSubmit}>
        <label>
          Neues Passwort
          <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Messages error={error} />
        <button className="btn-primary" disabled={busy}>
          Passwort speichern
        </button>
      </form>
    </section>
  );
}
