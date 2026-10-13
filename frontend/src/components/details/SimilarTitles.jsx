import { Link } from 'react-router-dom';
import { detailPath, POSTER_LARGE_BASE, STATUS_LABEL, titleKey } from '../../lib/labels.js';

// Recommended titles as a poster grid; each opens its own detail page.
export default function SimilarTitles({ titles, byKey }) {
  return (
    <section className="card" aria-labelledby="similar-title">
      <h2 id="similar-title">
        Ähnliche Titel
      </h2>
      {titles?.length ? (
        <ul className="poster-grid">
          {titles.map((t) => {
            const entry = byKey?.get(titleKey(t));
            return (
              <li key={titleKey(t)}>
                <Link to={detailPath(t)} className="poster-card">
                  {t.poster_path ? (
                    <img className="poster-large" src={POSTER_LARGE_BASE + t.poster_path} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="poster-large" aria-hidden="true" />
                  )}
                  <span className="poster-card-title">{t.title}</span>
                  <span className="caption">{t.release_date?.slice(0, 4)}</span>
                  {entry && (
                    <span className="badge badge--accent">
                      <span className="visually-hidden">In deiner Liste: </span>
                      {STATUS_LABEL[entry.status]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">Für diesen Titel kennt TMDb noch keine ähnlichen Titel.</p>
      )}
    </section>
  );
}
