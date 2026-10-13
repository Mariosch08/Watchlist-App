import { MonitorPlay } from 'lucide-react';
import { LOGO_BASE } from '../../lib/labels.js';
import AvailabilityAlert from './AvailabilityAlert.jsx';

const GROUPS = [
  ['flatrate', 'Im Abo'],
  ['rent', 'Leihen'],
  ['buy', 'Kaufen'],
];

// Where to watch in Switzerland. TMDb's data comes from JustWatch, which must be credited.
export default function StreamingProviders({ providers, details }) {
  const groups = GROUPS.filter(([key]) => providers?.[key]?.length > 0);
  return (
    <section className="card" aria-labelledby="streaming-title">
      <div className="card-head">
        <h2 id="streaming-title">
          <MonitorPlay size={18} aria-hidden="true" />
          Streaming in der Schweiz
        </h2>
      </div>
      {groups.length === 0 ? (
        <p className="empty">In der Schweiz derzeit bei keinem Anbieter verfügbar.</p>
      ) : (
        groups.map(([key, label]) => (
          <div key={key} className="provider-group">
            <h3>{label}</h3>
            <ul className="providers">
              {providers[key].map((p) => (
                <li key={p.id} className="provider">
                  {p.logo_path ? <img src={LOGO_BASE + p.logo_path} alt="" loading="lazy" /> : <span className="provider-logo" aria-hidden="true" />}
                  <span>{p.name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {details && <AvailabilityAlert details={details} />}
      <p className="caption">
        Daten von JustWatch.
        {providers?.link && (
          <>
            {' '}
            <a href={providers.link} target="_blank" rel="noopener noreferrer">
              Alle Angebote ansehen
            </a>
          </>
        )}
      </p>
    </section>
  );
}
