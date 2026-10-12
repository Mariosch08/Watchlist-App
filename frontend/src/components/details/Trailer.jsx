import { Play } from 'lucide-react';
import { useState } from 'react';

// Click-to-load: nothing is requested from YouTube until the user presses play.
export default function Trailer({ trailer, title }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="trailer">
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(trailer.key)}?autoplay=1&rel=0`}
          title={`Trailer: ${title}`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <div className="trailer-placeholder">
          <button onClick={() => setPlaying(true)}>
            <Play size={16} aria-hidden="true" />
            Trailer abspielen
          </button>
          <span className="caption">Wird erst beim Abspielen von YouTube geladen.</span>
        </div>
      )}
    </div>
  );
}
