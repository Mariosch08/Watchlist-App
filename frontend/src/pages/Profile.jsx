import { useEffect, useState } from 'react';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { unwrap } from '../lib/errors.js';
import { exportJson } from '../lib/imdb.js';
import { appUrl, supabase } from '../lib/supabase.js';

const DELETE_CONFIRMATION = 'LÖSCHEN';

function ProfileForm({ profile, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const { busy, error, info, run } = useSubmit();
  const onSubmit = (e) => {
    e.preventDefault();
    run(async ({ setInfo }) => {
      const saved = unwrap(
        await supabase
          .from('profiles')
          .update({ display_name: displayName.trim(), username: username.trim() || null })
          .eq('id', profile.id)
          .select()
          .single(),
      );
      onSaved(saved);
      setInfo('Gespeichert.');
    });
  };
  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="profile-title">
      <h1 id="profile-title">Profil</h1>
      <p className="muted">E-Mail: {profile.email}</p>
      <label>
        Anzeigename
        <input required maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        Benutzername (optional)
        <input
          pattern="[a-z0-9_]{3,20}"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          aria-describedby="username-help"
          className="mono"
        />
        <span id="username-help" className="caption">
          3–20 Zeichen: a–z, 0–9 und _. Darüber finden dich Freunde.
        </span>
      </label>
      <Messages error={error} info={info} />
      <div className="actions">
        <button className="btn-primary" disabled={busy}>
          Änderungen speichern
        </button>
      </div>
    </form>
  );
}

function ChangePassword() {
  const [password, setPassword] = useState('');
  const { busy, error, info, run } = useSubmit();
  const onSubmit = (e) => {
    e.preventDefault();
    run(async ({ setInfo }) => {
      unwrap(await supabase.auth.updateUser({ password }));
      setPassword('');
      setInfo('Passwort geändert.');
    });
  };
  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="password-title">
      <h2 id="password-title">Passwort ändern</h2>
      <label>
        Neues Passwort
        <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Messages error={error} info={info} />
      <div className="actions">
        <button disabled={busy}>Passwort ändern</button>
      </div>
    </form>
  );
}

function Invites() {
  const [invites, setInvites] = useState([]);
  const [maxUses, setMaxUses] = useState(1);
  const { busy, error, info, run } = useSubmit();
  const load = async () =>
    setInvites(unwrap(await supabase.from('invites').select().order('created_at', { ascending: false })));
  useEffect(() => {
    run(load);
  }, []);
  const create = (e) => {
    e.preventDefault();
    run(async () => {
      unwrap(await supabase.from('invites').insert({ max_uses: Number(maxUses) }));
      await load();
    });
  };
  const revoke = (code) =>
    run(async () => {
      unwrap(await supabase.from('invites').delete().eq('code', code));
      setInvites((list) => list.filter((i) => i.code !== code));
    });
  const copyLink = (code) =>
    run(async ({ setInfo }) => {
      await navigator.clipboard.writeText(appUrl(`register?invite=${code}`));
      setInfo('Einladungslink kopiert.');
    });
  return (
    <section className="card" aria-labelledby="invites-title">
      <h2 id="invites-title">Einladungen</h2>
      <p className="muted">Nur für Admins sichtbar. Jeder Code ist 14 Tage gültig.</p>
      <form className="inline-form" onSubmit={create}>
        <label>
          Max. Nutzungen
          <input type="number" min={1} max={50} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={busy}>
          Code erstellen
        </button>
      </form>
      <Messages error={error} info={info} />
      {invites.length === 0 ? (
        <p className="empty">Noch keine Einladungen. Erstelle einen Code und schicke den Link an einen Freund.</p>
      ) : (
        <ul className="list">
          {invites.map((i) => (
            <li key={i.code} className="title-row">
              <div className="title-main">
                <code>{i.code}</code>
                <span className="meta">
                  {i.uses} von {i.max_uses} genutzt · gültig bis {new Date(i.expires_at).toLocaleDateString('de-CH')}
                </span>
              </div>
              <div className="row-actions">
                <button className="btn-compact" disabled={busy} onClick={() => copyLink(i.code)}>
                  Link kopieren
                </button>
                <button className="btn-ghost btn-compact" disabled={busy} onClick={() => revoke(i.code)}>
                  Widerrufen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DataSection() {
  const [confirm, setConfirm] = useState('');
  const { busy, error, run } = useSubmit();
  const exportData = () => run(exportJson);
  const deleteAccount = () =>
    run(async () => {
      unwrap(await supabase.rpc('delete_my_account'));
      await supabase.auth.signOut({ scope: 'local' });
    });
  return (
    <section className="card" aria-labelledby="data-title">
      <h2 id="data-title">Meine Daten</h2>
      <div className="actions">
        <button disabled={busy} onClick={exportData}>
          Daten als JSON herunterladen
        </button>
      </div>
      <h3>Konto löschen</h3>
      <p className="muted">
        Löscht dein Konto und alle deine Daten unwiderruflich. Tippe <strong>{DELETE_CONFIRMATION}</strong> zur Bestätigung.
      </p>
      <div className="inline-form">
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={`Zur Bestätigung ${DELETE_CONFIRMATION} eingeben`} />
        <button className="btn-danger" disabled={busy || confirm !== DELETE_CONFIRMATION} onClick={deleteAccount}>
          Konto endgültig löschen
        </button>
      </div>
      <Messages error={error} />
    </section>
  );
}

export default function ProfilePage() {
  const user = useUser();
  const [profile, setProfile] = useState(null);
  const { error, run } = useSubmit();
  useEffect(() => {
    run(async () => setProfile(unwrap(await supabase.from('profiles').select().eq('id', user.id).single())));
  }, [user.id]);
  if (error) return <Messages error={error} />;
  if (!profile) return <CardSkeleton />;
  return (
    <>
      <ProfileForm profile={profile} onSaved={setProfile} />
      <ChangePassword />
      {profile.is_admin && <Invites />}
      <DataSection />
    </>
  );
}
