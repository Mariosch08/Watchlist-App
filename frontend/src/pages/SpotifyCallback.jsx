import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useUser } from '../auth/AuthContext.jsx';
import { Messages } from '../components/Form.jsx';
import { useToast } from '../components/toast/ToastProvider.jsx';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { connectSpotify, refreshMusic } from '../lib/api/music.js';
import { errorMessage } from '../lib/errors.js';
import { queryKeys } from '../lib/queryClient.js';
import { readSpotifyCallback } from '../lib/spotify.js';

// Spotify redirects here after login; the one-time code is exchanged on the server.
export default function SpotifyCallbackPage() {
  useDocumentTitle('Spotify verbinden');
  const user = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const started = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const res = await connectSpotify(readSpotifyCallback(location.search));
        toast.success(`Spotify verbunden${res?.display_name ? ` als ${res.display_name}` : ''}. Neuerscheinungen werden gesucht …`);
        await refreshMusic().catch(() => null);
        queryClient.invalidateQueries({ queryKey: queryKeys.music(user.id) });
        navigate('/music', { replace: true });
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }, [location.search, navigate, queryClient, toast, user.id]);

  return (
    <section className="card" aria-labelledby="spotify-title">
      <h1 id="spotify-title" tabIndex={-1}>
        Spotify verbinden
      </h1>
      {error ? (
        <>
          <Messages error={error} />
          <Link to="/music">Zurück zu Musik</Link>
        </>
      ) : (
        <p className="muted" role="status">
          Verbindung wird hergestellt …
        </p>
      )}
    </section>
  );
}
