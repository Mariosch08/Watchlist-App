import { POSTER_BASE, TYPE_LABEL } from '../lib/labels.js';

// One movie/series row: poster, title, meta line (type, year, original title, ratings) and actions.
export default function TitleRow({ item, index = 0, children }) {
  const year = item.release_date?.slice(0, 4);
  const score = Number(item.vote_average);
  const showOriginal = item.original_title && item.original_title !== item.title;
  return (
    <li className="title-row reveal" style={{ '--i': index }}>
      {item.poster_path ? (
        <img className="poster" src={POSTER_BASE + item.poster_path} alt="" loading="lazy" />
      ) : (
        <div className="poster" aria-hidden="true" />
      )}
      <div className="title-main">
        <span className="title-name">{item.title}</span>
        <div className="meta">
          <span>{TYPE_LABEL[item.media_type]}</span>
          {year && <span>{year}</span>}
          {score > 0 && <span className="score">★ {score.toFixed(1)}</span>}
          {item.my_rating && <span className="badge-mine">Ich {item.my_rating}/10</span>}
          {showOriginal && <span className="meta-original">{item.original_title}</span>}
        </div>
      </div>
      {children}
    </li>
  );
}
