import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { cognito, clearSession, getAccessToken } from '../auth/session.js';
import { Messages, useSubmit } from '../components/Form.jsx';

const DELETE_CONFIRMATION = 'LÖSCHEN';

function ProfileForm({ profile, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const { busy, error, info, run } = useSubmit();
  const onSubmit = (e) => {
    e.preventDefault();
    run(async ({ setInfo }) => {
      const body = { display_name: displayName };
      if (username && username !== profile.username) body.username = username;
      const res = await api('/me', { method: 'PUT', body });
      onSaved(res.profile);
      setInfo('Gespeichert.');
    }).catch(() => {});
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
      <Messages error={error === 'Username already taken' ? 'Dieser Benutzername ist bereits vergeben.' : error} info={info} />
      <button disabled={busy}>Speichern</button>
    </form>
  );
}

function ChangePassword() {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const { busy, error, info, run } = useSubmit();
  const onSubmit = (e) => {
    e.preventDefault();
    run(async ({ setInfo }) => {
      await cognito.changePassword(await getAccessToken(), oldPw, newPw);
      setOldPw('');
      setNewPw('');
      setInfo('Passwort geändert.');
    });
  };
  return (
    <form className="card" onSubmit={onSubmit}>
      <h2>Passwort ändern</h2>
      <label>
        Aktuelles Passwort
        <input type="password" autoComplete="current-password" required value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      </label>
      <label>
        Neues Passwort
        <input type="password" autoComplete="new-password" minLength={10} required value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      </label>
      <Messages error={error} info={info} />
      <button disabled={busy}>Passwort ändern</button>
    </form>
  );
}

function Invites() {
  const [invites, setInvites] = useState([]);
  const [maxUses, setMaxUses] = useState(1);
  const { busy, error, run } = useSubmit();
  const load = () => run(async () => setInvites((await api('/admin/invites')).invites));
  useEffect(() => {
    load();
  }, []);
  const create = (e) => {
    e.preventDefault();
    run(async () => {
      await api('/admin/invites', { method: 'POST', body: { max_uses: Number(maxUses) } });
      setInvites((await api('/admin/invites')).invites);
    });
  };
  const revoke = (code) =>
    run(async () => {
      await api(`/admin/invites/${code}`, { method: 'DELETE' });
      setInvites((list) => list.filter((i) => i.code !== code));
    });
  const link = (code) => `${window.location.origin}/register?invite=${code}`;
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
      <Messages error={error} />
      <ul className="plain">
        {invites.map((i) => (
          <li key={i.code}>
            <code>{i.code}</code> – {i.uses}/{i.max_uses} genutzt, gültig bis {new Date(i.expires_at).toLocaleDateString('de-CH')}{' '}
            <button className="link" onClick={() => navigator.clipboard?.writeText(link(i.code))}>
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
      const data = await api('/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'watchlist-export.json' });
      a.click();
      URL.revokeObjectURL(url);
    });
  const deleteAccount = () =>
    run(async () => {
      await api('/me', { method: 'DELETE' });
      clearSession();
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
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/me').then((r) => setProfile(r.profile), (e) => setError(e.message));
  }, []);
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
