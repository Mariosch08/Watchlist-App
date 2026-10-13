import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useUser } from '../../auth/AuthContext.jsx';
import { useMusicRefresh } from '../../hooks/useMusic.js';
import { disconnectSpotify, fetchSpotifyConnection } from '../../lib/api/music.js';
import { fetchSettings, updateSettings } from '../../lib/api/settings.js';
import { errorMessage } from '../../lib/errors.js';
import { queryKeys } from '../../lib/queryClient.js';
import { spotifyAuthorizeUrl, spotifyClientId } from '../../lib/spotify.js';
import { Messages } from '../Form.jsx';
import { useToast } from '../toast/ToastProvider.jsx';

const SOURCES = {
  lastfm_username: {
    label: 'Last.fm-Benutzername',
    pattern: /^[A-Za-z][A-Za-z0-9_-]{1,14}$/,
    rule: 'Last.fm-Namen haben 2–15 Zeichen, beginnen mit einem Buchstaben und enthalten nur Buchstaben, Ziffern, _ oder -.',
    placeholder: 'z. B. mario_08',
    max: 15,
  },
  statsfm_username: {
    label: 'stats.fm-Profilname',
    pattern: /^[A-Za-z0-9_.-]{2,40}$/,
    rule: 'Den Profilnamen findest du in der stats.fm-App unter „Profil“ (Link stats.fm/<name>).',
    placeholder: 'z. B. mario08',
    max: 40,
  },
};

// One user-name source (Last.fm or stats.fm): save, change or remove; saving searches right away.
function UsernameField({ field }) {
  const cfg = SOURCES[field];
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = useMusicRefresh();
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const current = settings.data?.[field] ?? '';
  const value = draft ?? current;
  const save = useMutation({
    mutationFn: (name) => updateSettings({ [field]: name || null }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings(user.id), saved);
      setDraft(null);
      if (saved[field]) refresh.mutate();
      else toast.success(`${cfg.label.split('-')[0]} getrennt.`);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const submit = (e) => {
    e.preventDefault();
    const name = value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?stats\.fm\/(user\/)?/i, '');
    setError('');
    if (name && !cfg.pattern.test(name)) return setError(cfg.rule);
    save.mutate(name);
  };
  return (
    <>
      <form className="inline-form" onSubmit={submit} noValidate>
        <label>
          {cfg.label}
          <input value={value} onChange={(e) => setDraft(e.target.value)} autoComplete="off" spellCheck="false" maxLength={cfg.max + 30} placeholder={cfg.placeholder} />
        </label>
        <button type="submit" className="btn-compact" disabled={save.isPending || refresh.isPending || !settings.data || value.trim() === current}>
          {save.isPending || refresh.isPending ? 'Wird geladen …' : value.trim() || !current ? 'Speichern' : 'Trennen'}
        </button>
      </form>
      <Messages error={error} />
    </>
  );
}

// Where my listening data comes from: Last.fm, stats.fm and/or Spotify login.
export default function MusicSources() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const spotify = useQuery({ queryKey: queryKeys.music(user.id, 'spotify'), queryFn: fetchSpotifyConnection, enabled: Boolean(spotifyClientId) });
  const disconnect = useMutation({
    mutationFn: disconnectSpotify,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.music(user.id, 'spotify'), null);
      toast.success('Spotify getrennt.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const connect = async () => {
    try {
      window.location.assign(await spotifyAuthorizeUrl());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <UsernameField field="lastfm_username" />
      <UsernameField field="statsfm_username" />
      <p className="caption">stats.fm: In der App unter Einstellungen → Privatsphäre „Top-Artists“ und „Statistiken“ öffentlich lassen.</p>
      {spotifyClientId &&
        (spotify.data ? (
          <div className="actions">
            <span>
              Spotify verbunden als <strong>{spotify.data.display_name ?? 'dein Konto'}</strong>
            </span>
            <button className="btn-ghost btn-compact" disabled={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Trennen
            </button>
          </div>
        ) : (
          <div className="actions">
            <button className="btn-compact" disabled={!spotify.isSuccess} onClick={connect}>
              Mit Spotify verbinden
            </button>
          </div>
        ))}
      <p className="caption">
        Gelesen werden nur deine meistgehörten und gefolgten Artists sowie deine Hör-Summen – keine Playlists, kein Verlauf. Neuerscheinungen: MusicBrainz, ähnliche
        Artists: Last.fm.
      </p>
    </div>
  );
}
