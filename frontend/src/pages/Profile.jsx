import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import { useState } from 'react';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages, useSubmit } from '../components/Form.jsx';
import { CardSkeleton } from '../components/Skeleton.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { deleteAccount, exportJson } from '../lib/api/account.js';
import { PASSWORD_MIN_LENGTH, setPassword, signOutOtherDevices } from '../lib/api/auth.js';
import { createInvite, fetchInvites, inviteLink, inviteState, revokeInvite } from '../lib/api/invites.js';
import { fetchProfile, updateProfile, USERNAME_PATTERN } from '../lib/api/profile.js';
import { fetchSettings, updateSettings } from '../lib/api/settings.js';
import { errorMessage } from '../lib/errors.js';
import { formatDate } from '../lib/labels.js';
import { queryKeys } from '../lib/queryClient.js';

const DELETE_CONFIRMATION = 'LÖSCHEN';

function LoadError({ error, onRetry }) {
  return (
    <div className="stack">
      <Messages error={errorMessage(error)} />
      <div className="actions">
        <button onClick={onRetry}>Erneut laden</button>
      </div>
    </div>
  );
}

function ProfileForm({ profile }) {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [username, setUsername] = useState(profile.username ?? '');
  const [fieldError, setFieldError] = useState({});
  const save = useMutation({
    mutationFn: () => updateProfile(user.id, { display_name: displayName.trim(), username: username.trim() || null }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.profile(user.id), saved);
      toast.success('Profil gespeichert.');
    },
    onError: (err) => {
      if (err?.code === '23505') setFieldError({ username: 'Dieser Benutzername ist bereits vergeben.' });
    },
  });
  const onSubmit = (e) => {
    e.preventDefault();
    const errors = {};
    if (!displayName.trim()) errors.displayName = 'Bitte gib einen Anzeigenamen ein.';
    if (username.trim() && !USERNAME_PATTERN.test(username.trim())) errors.username = '3–20 Zeichen: a–z, 0–9 und _.';
    setFieldError(errors);
    if (Object.keys(errors).length === 0) save.mutate();
  };
  const otherError = save.error && save.error.code !== '23505' ? errorMessage(save.error) : '';
  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="profile-title">
      <h1 id="profile-title" tabIndex={-1}>
        Profil
      </h1>
      <p className="muted">Angemeldet als {profile.email}</p>
      <label>
        Anzeigename
        <input
          maxLength={50}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          aria-invalid={fieldError.displayName ? 'true' : undefined}
          aria-describedby={fieldError.displayName ? 'displayname-error' : undefined}
        />
        {fieldError.displayName && (
          <span id="displayname-error" className="field-error">
            {fieldError.displayName}
          </span>
        )}
      </label>
      <label>
        Benutzername (optional)
        <input
          value={username}
          maxLength={20}
          onChange={(e) => {
            setUsername(e.target.value.toLowerCase());
            setFieldError((f) => ({ ...f, username: undefined }));
          }}
          aria-invalid={fieldError.username ? 'true' : undefined}
          aria-describedby={fieldError.username ? 'username-error' : 'username-help'}
          className="mono"
        />
        {fieldError.username ? (
          <span id="username-error" className="field-error">
            {fieldError.username}
          </span>
        ) : (
          <span id="username-help" className="caption">
            3–20 Zeichen: a–z, 0–9 und _. Darüber finden dich Freunde.
          </span>
        )}
      </label>
      <Messages error={otherError} />
      <div className="actions">
        <button className="btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
        </button>
      </div>
    </form>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [password, setPw] = useState('');
  const [password2, setPw2] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const { busy, error, run } = useSubmit();
  const others = useSubmit();
  const onSubmit = (e) => {
    e.preventDefault();
    if (password !== password2) return setMismatch(true);
    run(async () => {
      await setPassword(password);
      setPw('');
      setPw2('');
      toast.success('Passwort geändert.');
    });
  };
  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="password-title">
      <h2 id="password-title">Passwort und Geräte</h2>
      <label>
        Neues Passwort
        <input type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required value={password} onChange={(e) => setPw(e.target.value)} />
      </label>
      <label>
        Passwort wiederholen
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password2}
          onChange={(e) => {
            setPw2(e.target.value);
            setMismatch(false);
          }}
          aria-invalid={mismatch ? 'true' : undefined}
          aria-describedby={mismatch ? 'pw-mismatch' : undefined}
        />
        {mismatch && (
          <span id="pw-mismatch" className="field-error">
            Die Passwörter stimmen nicht überein.
          </span>
        )}
      </label>
      <Messages error={error} />
      <div className="actions">
        <button disabled={busy}>{busy ? 'Wird geändert …' : 'Passwort ändern'}</button>
        <button
          type="button"
          className="btn-ghost"
          disabled={others.busy}
          onClick={() =>
            others.run(async () => {
              await signOutOtherDevices();
              toast.success('Auf allen anderen Geräten abgemeldet.');
            })
          }
        >
          Auf anderen Geräten abmelden
        </button>
      </div>
      <Messages error={others.error} />
    </form>
  );
}

const INVITE_STATE_LABEL = { active: 'Aktiv', used: 'Aufgebraucht', expired: 'Abgelaufen' };

function InviteRow({ invite, onRevoke, revoking }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const state = inviteState(invite);
  const share = async () => {
    const url = inviteLink(invite.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Einladung zur Watchlist', text: 'Hier ist deine Einladung zu meiner Watchlist:', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success('Einladungslink kopiert.');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Link konnte nicht kopiert werden. Code: ' + invite.code);
    }
  };
  return (
    <li className="title-row">
      <div className="title-main">
        <span>
          <code>{invite.code}</code> <span className={state === 'active' ? 'badge badge--accent' : 'badge'}>{INVITE_STATE_LABEL[state]}</span>
        </span>
        <span className="meta">
          {invite.note && <span>Für {invite.note}</span>}
          <span>
            {invite.uses} von {invite.max_uses} genutzt
          </span>
          <span>gültig bis {formatDate(invite.expires_at)}</span>
          {invite.used_by?.length > 0 && <span>von {invite.used_by.join(', ')}</span>}
        </span>
      </div>
      <div className="row-actions">
        {state === 'active' && (
          <button className="btn-compact" onClick={share}>
            <Share2 size={16} aria-hidden="true" />
            Link teilen
          </button>
        )}
        {confirm ? (
          <>
            <button className="btn-danger btn-compact" disabled={revoking} onClick={() => onRevoke(invite.code)}>
              Wirklich widerrufen
            </button>
            <button className="btn-ghost btn-compact" onClick={() => setConfirm(false)}>
              Abbrechen
            </button>
          </>
        ) : (
          <button className="btn-ghost btn-compact" onClick={() => setConfirm(true)}>
            {state === 'active' ? 'Widerrufen' : 'Entfernen'}
          </button>
        )}
      </div>
    </li>
  );
}

function InvitesCard() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = queryKeys.invites(user.id);
  const invites = useQuery({ queryKey: key, queryFn: fetchInvites });
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState('');
  const create = useMutation({
    mutationFn: () => createInvite({ maxUses: Math.min(50, Math.max(1, Number(maxUses) || 1)), note: note.trim() }),
    onSuccess: (row) => {
      queryClient.setQueryData(key, (list) => [row, ...(list ?? [])]);
      setNote('');
      toast.success(`Code ${row.code} erstellt. Teile jetzt den Link.`);
    },
  });
  const revoke = useMutation({
    mutationFn: (code) => revokeInvite(code),
    onSuccess: (_, code) => queryClient.setQueryData(key, (list) => list?.filter((i) => i.code !== code)),
    onError: (err) => toast.error(`Widerrufen fehlgeschlagen. ${errorMessage(err)}`),
  });
  const sorted = [...(invites.data ?? [])].sort((a, b) => (inviteState(a) === 'active' ? 0 : 1) - (inviteState(b) === 'active' ? 0 : 1));
  return (
    <section className="card" aria-labelledby="invites-title">
      <h2 id="invites-title">Freunde einladen</h2>
      <p className="muted">Nur für Admins sichtbar. Jeder Code ist 14 Tage gültig.</p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Für wen? (optional)
          <input value={note} maxLength={100} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Lukas" />
        </label>
        <label className="narrow-field">
          Nutzungen
          <input type="number" min={1} max={50} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <button className="btn-primary" disabled={create.isPending}>
          {create.isPending ? 'Wird erstellt …' : 'Code erstellen'}
        </button>
      </form>
      <Messages error={create.error ? errorMessage(create.error) : ''} />
      {invites.isError ? (
        <LoadError error={invites.error} onRetry={() => invites.refetch()} />
      ) : !invites.data ? (
        <span className="skeleton skeleton--line skeleton--long" aria-label="Wird geladen" />
      ) : sorted.length === 0 ? (
        <p className="empty">Noch keine Einladungen. Erstelle einen Code und teile den Link mit einem Freund.</p>
      ) : (
        <ul className="list">
          {sorted.map((i) => (
            <InviteRow key={i.code} invite={i} onRevoke={(code) => revoke.mutate(code)} revoking={revoke.isPending} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SettingsCard() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const key = queryKeys.settings(user.id);
  const settings = useQuery({ queryKey: key, queryFn: fetchSettings });
  const save = useMutation({
    mutationFn: (changes) => updateSettings(changes),
    onMutate: (changes) => queryClient.setQueryData(key, (s) => (s ? { ...s, ...changes } : s)),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: key });
      toast.error(`Einstellung nicht gespeichert. ${errorMessage(err)}`);
    },
  });
  return (
    <section className="card" aria-labelledby="settings-title">
      <h2 id="settings-title">Einstellungen</h2>
      {settings.isError ? (
        <LoadError error={settings.error} onRetry={() => settings.refetch()} />
      ) : (
        <label className="check-row">
          <input
            type="checkbox"
            checked={settings.data?.hide_spoilers ?? true}
            disabled={!settings.data}
            onChange={(e) => save.mutate({ hide_spoilers: e.target.checked })}
          />
          Spoiler-Schutz: Beschreibungen ungesehener Folgen verbergen
        </label>
      )}
    </section>
  );
}

function DataCard() {
  const [confirm, setConfirm] = useState('');
  const exporting = useSubmit();
  const deleting = useSubmit();
  return (
    <section className="card" aria-labelledby="data-title">
      <h2 id="data-title">Meine Daten</h2>
      <p className="muted">Lade alle deine Daten herunter. Für IMDb oder Letterboxd gibt es den Export unter „Import“.</p>
      <div className="actions">
        <button disabled={exporting.busy} onClick={() => exporting.run(exportJson)}>
          {exporting.busy ? 'Wird vorbereitet …' : 'Daten als JSON herunterladen'}
        </button>
      </div>
      <Messages error={exporting.error} />
      <h3>Konto löschen</h3>
      <p className="muted">
        Löscht dein Konto und alle deine Daten unwiderruflich. Tippe <strong>{DELETE_CONFIRMATION}</strong> zur Bestätigung.
      </p>
      <div className="inline-form">
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label={`Zur Bestätigung ${DELETE_CONFIRMATION} eingeben`} />
        <button className="btn-danger" disabled={deleting.busy || confirm.trim() !== DELETE_CONFIRMATION} onClick={() => deleting.run(deleteAccount)}>
          {deleting.busy ? 'Wird gelöscht …' : 'Konto endgültig löschen'}
        </button>
      </div>
      <Messages error={deleting.error} />
    </section>
  );
}

export default function ProfilePage() {
  useDocumentTitle('Profil');
  const user = useUser();
  const profile = useQuery({ queryKey: queryKeys.profile(user.id), queryFn: () => fetchProfile(user.id) });
  return (
    <>
      {profile.isError ? (
        <section className="card">
          <h1 tabIndex={-1}>Profil</h1>
          <LoadError error={profile.error} onRetry={() => profile.refetch()} />
        </section>
      ) : profile.data ? (
        <ProfileForm key={profile.data.id} profile={profile.data} />
      ) : (
        <CardSkeleton />
      )}
      <SettingsCard />
      <PasswordCard />
      {profile.data?.is_admin && <InvitesCard />}
      <DataCard />
    </>
  );
}
