import { Star } from 'lucide-react';
import { POSTER_BASE, TYPE_LABEL } from '../lib/labels.js';

// One movie/series row: poster, title, meta line (type, year, rating, original title) and actions.
export default function TitleRow({ item, children }) {
  const year = item.release_date?.slice(0, 4);
  const score = Number(item.vote_average);
  const showOriginal = item.original_title && item.original_title !== item.title;
  return (
    <li className="title-row">
      {item.poster_path ? (
        <img className="poster" src={POSTER_BASE + item.poster_path} alt={`Poster: ${item.title}`} loading="lazy" />
      ) : (
        <span className="poster" aria-hidden="true" />
      )}
      <div className="title-main">
        <span className="title-name">{item.title}</span>
        <div className="meta">
          <span>{TYPE_LABEL[item.media_type]}</span>
          {year && <span>{year}</span>}
          {score > 0 && (
            <span className="meta-item" title="TMDb-Bewertung">
              <Star size={12} aria-hidden="true" />
              {score.toFixed(1)}
            </span>
          )}
          {item.my_rating && <span className="badge badge--accent">Meine Bewertung {item.my_rating}/10</span>}
          {showOriginal && <span className="meta-original">{item.original_title}</span>}
        </div>
      </div>
      {children}
    </li>
  );
}
