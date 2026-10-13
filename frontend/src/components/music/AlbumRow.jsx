import { ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react';
import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../lib/labels.js';

const lastfmUrl = (artist, title) => `https://www.last.fm/music/${encodeURIComponent(artist).replace(/%20/g, '+')}/${encodeURIComponent(title).replace(/%20/g, '+')}`;

// One new release: cover, title, artist, kind and date, why it is suggested, 👍/👎 and listen links.
function AlbumRow({ entry, pending, onFeedback }) {
  const [broken, setBroken] = useState(false);
  const liked = entry.status === 'liked';
  const upcoming = entry.data?.upcoming;
  const film = entry.data?.bridge;
  const artist = entry.data?.artist ?? entry.subtitle ?? '';
  const label = `${entry.title} von ${artist}`;
  return (
    <li className="title-row" aria-busy={pending || undefined}>
      {entry.image_url && !broken ? (
        <img className="poster poster--square" src={entry.image_url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="poster poster--square" aria-hidden="true" />
      )}
      <div className="title-main">
        <span className="title-name">{entry.title}</span>
        <div className="meta">
          <span>{artist}</span>
          {entry.data?.kind && <span>{entry.data.kind}</span>}
          {entry.release_date && <span>{upcoming ? `erscheint ${formatDate(entry.release_date)}` : formatDate(entry.release_date)}</span>}
          {entry.data?.fresh && <span className="badge">Neu</span>}
          {entry.data?.small && <span className="badge">Geheimtipp</span>}
        </div>
        {entry.reason && <span className="reason">{entry.reason}</span>}
      </div>
      <div className="row-actions">
        <button
          className="btn-ghost btn-compact btn-icon"
          aria-pressed={liked}
          aria-label={`${label}: gefällt mir`}
          title="Gefällt mir"
          disabled={pending}
          onClick={() => !liked && onFeedback(entry, 'like')}
        >
          <ThumbsUp size={16} aria-hidden="true" />
        </button>
        <button
          className="btn-ghost btn-compact btn-icon"
          aria-label={`${label}: nicht mein Ding`}
          title="Nicht mein Ding"
          disabled={pending}
          onClick={() => onFeedback(entry, 'dislike')}
        >
          <ThumbsDown size={16} aria-hidden="true" />
        </button>
        {entry.data?.spotify_url && (
          <a className="button-link btn-compact" href={entry.data.spotify_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            Spotify
          </a>
        )}
        {film ? (
          <Link className="button-link btn-ghost btn-compact" to={`/title/${film.media_type}/${film.tmdb_id}`}>
            Zum Film
          </Link>
        ) : (
          <a className="button-link btn-ghost btn-compact" href={entry.data?.lastfm_url ?? lastfmUrl(artist, entry.title)} target="_blank" rel="noopener noreferrer">
            Last.fm
          </a>
        )}
      </div>
    </li>
  );
}

export default memo(AlbumRow);
