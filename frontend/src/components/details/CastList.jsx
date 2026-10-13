import { Users } from 'lucide-react';
import { PROFILE_BASE } from '../../lib/labels.js';

export default function CastList({ cast, crew }) {
  if (!cast?.length && !crew?.length) return null;
  return (
    <section className="card" aria-labelledby="cast-title">
      <h2 id="cast-title">
        <Users size={18} aria-hidden="true" />
        Besetzung
      </h2>
      {crew?.length > 0 && (
        <dl className="crew">
          {crew.map((g) => (
            <div key={g.job}>
              <dt>{g.job}</dt>
              <dd>{g.names.join(', ')}</dd>
            </div>
          ))}
        </dl>
      )}
      {cast?.length > 0 && (
        <ul className="people">
          {cast.map((p) => (
            <li key={p.id} className="person">
              {p.profile_path ? (
                <img className="avatar" src={PROFILE_BASE + p.profile_path} alt="" loading="lazy" />
              ) : (
                <span className="avatar" aria-hidden="true" />
              )}
              <span className="person-text">
                <span className="person-name">{p.name}</span>
                {p.character && <span className="caption">{p.character}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
