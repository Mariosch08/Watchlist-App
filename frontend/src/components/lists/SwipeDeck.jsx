import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { detailPath, POSTER_LARGE_BASE, TYPE_LABEL } from '../../lib/labels.js';

const THRESHOLD = 90;

// One card at a time: swipe (or ←/→, or the buttons) to vote. Titles everybody likes become matches.
export default function SwipeDeck({ queue, matches, onVote, busy }) {
  const current = queue[0];
  const [dx, setDx] = useState(0);
  const start = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if (!current || busy || e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight') onVote(current, 1);
      if (e.key === 'ArrowLeft') onVote(current, -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, busy, onVote]);

  if (!current) {
    return (
      <div className="stack">
        <p className="empty">Du hast alle Titel bewertet. Sobald jemand Neues hinzufügt, geht es hier weiter.</p>
        {matches.length > 0 && (
          <>
            <h3>Matches – alle wollen sie sehen</h3>
            <ul className="chip-list chip-list--plain">
              {matches.map((t) => (
                <li key={`${t.media_type}-${t.tmdb_id}`} className="chip">
                  <Link to={detailPath(t)}>{t.title}</Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    );
  }

  const release = (e) => {
    if (start.current == null) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    start.current = null;
    if (Math.abs(dx) > THRESHOLD && !busy) onVote(current, dx > 0 ? 1 : -1);
    setDx(0);
  };

  return (
    <div className="swipe">
      <div
        className="swipe-card"
        data-direction={dx > THRESHOLD / 2 ? 'yes' : dx < -THRESHOLD / 2 ? 'no' : undefined}
        style={{ '--dx': `${dx}px` }}
        onPointerDown={(e) => {
          start.current = e.clientX;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => start.current != null && setDx(e.clientX - start.current)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        {current.poster_path ? <img src={POSTER_LARGE_BASE + current.poster_path} alt="" draggable="false" /> : <span className="swipe-poster" aria-hidden="true" />}
        <div className="swipe-info">
          <Link className="title-name title-link" to={detailPath(current)}>
            {current.title}
          </Link>
          <span className="meta">
            {TYPE_LABEL[current.media_type]}
            {current.release_date ? ` · ${current.release_date.slice(0, 4)}` : ''}
            {current.up > 0 ? ` · ${current.up} 👍` : ''}
          </span>
        </div>
      </div>
      <div className="swipe-actions">
        <button className="btn-icon swipe-no" aria-label={`${current.title}: nein`} title="Nein (←)" disabled={busy} onClick={() => onVote(current, -1)}>
          <ThumbsDown size={20} aria-hidden="true" />
        </button>
        <span className="caption" aria-live="polite">
          noch {queue.length}
        </span>
        <button className="btn-icon btn-primary swipe-yes" aria-label={`${current.title}: ja`} title="Ja (→)" disabled={busy} onClick={() => onVote(current, 1)}>
          <ThumbsUp size={20} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
