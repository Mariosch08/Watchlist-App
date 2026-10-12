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

const LASTFM_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{1,14}$/;

// Where my listening data comes from: Last.fm user name and/or Spotify login.
export default function MusicSources() {
  const user = useUser();
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = useMusicRefresh();
  const settings = useQuery({ queryKey: queryKeys.settings(user.id), queryFn: fetchSettings });
  const spotify = useQuery({ queryKey: queryKeys.music(user.id, 'spotify'), queryFn: fetchSpotifyConnection, enabled: Boolean(spotifyClientId) });
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const current = settings.data?.lastfm_username ?? '';
  const value = draft ?? current;

  const saveLastfm = useMutation({
    mutationFn: (name) => updateSettings({ lastfm_username: name || null }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.settings(user.id), saved);
      setDraft(null);
      if (saved.lastfm_username) refresh.mutate();
      else toast.success('Last.fm getrennt.');
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const disconnect = useMutation({
    mutationFn: disconnectSpotify,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.music(user.id, 'spotify'), null);
      toast.success('Spotify getrennt.');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const submit = (e) => {
    e.preventDefault();
    const name = value.trim();
    setError('');
    if (name && !LASTFM_PATTERN.test(name)) return setError('Last.fm-Namen haben 2–15 Zeichen, beginnen mit einem Buchstaben und enthalten nur Buchstaben, Ziffern, _ oder -.');
    saveLastfm.mutate(name);
  };
  const connect = async () => {
    try {
      window.location.assign(await spotifyAuthorizeUrl());
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="stack">
      <form className="inline-form" onSubmit={submit} noValidate>
        <label>
          Last.fm-Benutzername
          <input value={value} onChange={(e) => setDraft(e.target.value)} autoComplete="off" spellCheck="false" maxLength={15} placeholder="z. B. mario_08" />
        </label>
        <button type="submit" className="btn-compact" disabled={saveLastfm.isPending || refresh.isPending || !settings.data || value.trim() === current}>
          {saveLastfm.isPending || refresh.isPending ? 'Wird geladen …' : value.trim() || !current ? 'Speichern' : 'Trennen'}
        </button>
      </form>
      <Messages error={error} />
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
        Gelesen werden nur deine meistgehörten und gefolgten Artists – keine Playlists, kein Verlauf. Neuerscheinungen: MusicBrainz, ähnliche Artists: Last.fm.
      </p>
    </div>
  );
}
