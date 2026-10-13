import { Check, Plus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { feedToTitle } from '../../lib/api/discovery.js';
import { detailPath, POSTER_LARGE_BASE } from '../../lib/labels.js';

// One suggestion as a poster card: why it is suggested, 👍/👎 and "Merken".
function FeedRow({ entry, inList, onFeedback, onAdd, pending }) {
  const title = feedToTitle(entry);
  const liked = entry.status === 'liked';
  return (
    <li className="feed-card" aria-busy={pending || undefined}>
      <Link to={detailPath(title)} className="poster-card">
        {title.poster_path ? (
          <img className="poster-large" src={POSTER_LARGE_BASE + title.poster_path} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="poster-large poster-fallback" aria-hidden="true">
            {title.title}
          </span>
        )}
        <span className="poster-card-title">{title.title}</span>
      </Link>
      <span className="feed-reason">
        {entry.data?.composer && <span className="badge badge--accent">Soundtrack</span>}
        {entry.data?.fresh && <span className="badge">Neu</span>} {entry.reason}
      </span>
      <div className="feed-actions">
        <button
          className="btn-ghost btn-compact btn-icon"
          aria-pressed={liked}
          aria-label={`${title.title}: gefällt mir`}
          title="Gefällt mir"
          disabled={pending}
          onClick={() => !liked && onFeedback(entry, 'like')}
        >
          <ThumbsUp size={16} aria-hidden="true" />
        </button>
        <button
          className="btn-ghost btn-compact btn-icon"
          aria-label={`${title.title}: nicht mein Ding`}
          title="Nicht mein Ding"
          disabled={pending}
          onClick={() => onFeedback(entry, 'dislike')}
        >
          <ThumbsDown size={16} aria-hidden="true" />
        </button>
        {inList ? (
          <span className="feed-in-list" title="In deiner Liste">
            <Check size={16} aria-hidden="true" />
            <span className="visually-hidden">In deiner Liste</span>
          </span>
        ) : (
          <button className="btn-ghost btn-compact btn-icon" aria-label={`${title.title} merken`} title="Merken" disabled={pending} onClick={() => onAdd(entry)}>
            <Plus size={16} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export default memo(FeedRow);
