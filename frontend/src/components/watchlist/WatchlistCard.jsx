import { Star } from 'lucide-react';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { detailPath, POSTER_LARGE_BASE, STATUS_LABEL, TYPE_LABEL } from '../../lib/labels.js';

// Poster view of one watchlist title; changes happen on the detail page.
function WatchlistCard({ item }) {
  const year = item.release_date?.slice(0, 4);
  return (
    <li>
      <Link to={detailPath(item)} className="poster-card">
        {item.poster_path ? (
          <img className="poster-large" src={POSTER_LARGE_BASE + item.poster_path} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className="poster-large poster-fallback" aria-hidden="true">
            {item.title}
          </span>
        )}
        <span className="poster-card-title">{item.title}</span>
        <span className="poster-card-meta">
          {item.my_rating ? (
            <span className="meta-item">
              <Star size={12} aria-hidden="true" className="star-filled" />
              <span className="visually-hidden">Meine Bewertung</span>
              {item.my_rating}
            </span>
          ) : item.status === 'watching' ? (
            STATUS_LABEL.watching
          ) : (
            [TYPE_LABEL[item.media_type], year].filter(Boolean).join(' · ')
          )}
        </span>
      </Link>
    </li>
  );
}

export default memo(WatchlistCard);
