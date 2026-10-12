import { useEffect, useState } from 'react';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { unwrap } from '../lib/errors.js';
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
    <form className="card" onSubmit={onSubmit}>
      <h2>Profil</h2>
      <p className="muted">E-Mail: {profile.email}</p>
      <label>
        Anzeigename
        <input required maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label>
        Benutzername (3–20 Zeichen: a–z, 0–9, _), damit Freunde dich finden
        <input pattern="[a-z0-9_]{3,20}" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} />
      </label>
      <Messages error={error} info={info} />
      <button disabled={busy}>Speichern</button>
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
    <form className="card" onSubmit={onSubmit}>
      <h2>Passwort ändern</h2>
      <label>
        Neues Passwort
        <input type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <Messages error={error} info={info} />
      <button disabled={busy}>Passwort ändern</button>
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
    <section className="card">
      <h2>Einladungen (Admin)</h2>
      <form className="row" onSubmit={create}>
        <label>
          Max. Nutzungen
          <input type="number" min={1} max={50} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <button disabled={busy}>Code erstellen</button>
      </form>
      <Messages error={error} info={info} />
      <ul className="plain">
        {invites.map((i) => (
          <li key={i.code}>
            <code>{i.code}</code> – {i.uses}/{i.max_uses} genutzt, gültig bis {new Date(i.expires_at).toLocaleDateString('de-CH')}{' '}
            <button className="link" onClick={() => copyLink(i.code)}>
              Link kopieren
            </button>{' '}
            <button className="link danger" onClick={() => revoke(i.code)}>
              Widerrufen
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DataSection() {
  const [confirm, setConfirm] = useState('');
  const { busy, error, run } = useSubmit();
  const exportData = () =>
    run(async () => {
      const data = unwrap(await supabase.rpc('export_my_data'));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'watchlist-export.json' });
      a.click();
      URL.revokeObjectURL(url);
    });
  const deleteAccount = () =>
    run(async () => {
      unwrap(await supabase.rpc('delete_my_account'));
      await supabase.auth.signOut({ scope: 'local' });
    });
  return (
    <section className="card">
      <h2>Meine Daten</h2>
      <button disabled={busy} onClick={exportData}>
        Daten als JSON exportieren
      </button>
      <h3 className="danger">Konto löschen</h3>
      <p className="muted">
        Löscht dein Konto und alle deine Daten unwiderruflich. Tippe <strong>{DELETE_CONFIRMATION}</strong> zur Bestätigung.
      </p>
      <div className="row">
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Bestätigung" />
        <button className="danger" disabled={busy || confirm !== DELETE_CONFIRMATION} onClick={deleteAccount}>
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
  if (error) return <p className="error">{error}</p>;
  if (!profile) return <p>Lade …</p>;
  return (
    <>
      <ProfileForm profile={profile} onSaved={setProfile} />
      <ChangePassword />
      {profile.is_admin && <Invites />}
      <DataSection />
    </>
  );
}
