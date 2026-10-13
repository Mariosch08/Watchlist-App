import { formatListeners, musicProfile, SOURCE_LABEL } from '../../lib/musicProfile.js';
import { BarList } from '../stats/Charts.jsx';

const GROUPS = [
  { key: 'core', title: 'Dauerbrenner', text: 'Seit Jahren und auch jetzt oft gehört.' },
  { key: 'rising', title: 'Im Kommen', text: 'Hörst du in den letzten Wochen deutlich mehr.' },
  { key: 'hidden', title: 'Geheimtipps', text: 'Kleine Artists, die du gern hörst. Ihre Neuheiten bekommen Vorrang, weil sie sonst untergehen.' },
  { key: 'fading', title: 'Wiederentdecken', text: 'Früher oft gehört, zuletzt kaum.' },
];

const joinGerman = (items) => (items.length > 1 ? `${items.slice(0, -1).join(', ')} und ${items.at(-1)}` : (items[0] ?? ''));

// What the tracker knows about my listening and why it suggests what it suggests.
export default function MusicProfile({ artists }) {
  const p = musicProfile(artists);
  const groups = GROUPS.filter((g) => p.groups[g.key].length > 0);
  return (
    <section className="card" aria-labelledby="profile-title">
      <h2 id="profile-title">Dein Musikprofil</h2>
      <dl className="stats">
        <div className="stat">
          <dt>Artists ausgewertet</dt>
          <dd>{p.total}</dd>
        </div>
        <div className="stat">
          <dt>Kleine Artists</dt>
          <dd>{p.small}</dd>
        </div>
        {p.offMainstream != null && (
          <div className="stat">
            <dt>Abseits des Mainstreams</dt>
            <dd>{p.offMainstream} %</dd>
          </div>
        )}
        {p.loved > 0 && (
          <div className="stat">
            <dt>Lieblingssongs</dt>
            <dd>{p.loved}</dd>
          </div>
        )}
      </dl>
      {p.genres.length > 0 && (
        <div className="profile-block">
          <h3>Genres</h3>
          <BarList items={p.genres.map((g) => ({ key: g.name, label: g.name, value: g.share, display: `${g.share} %` }))} />
        </div>
      )}
      {groups.length > 0 && (
        <div className="grid-2 profile-groups">
          {groups.map((g) => (
            <div key={g.key} className="profile-block" role="group" aria-labelledby={`profile-${g.key}`}>
              <h3 id={`profile-${g.key}`}>{g.title}</h3>
              <p className="caption">{g.text}</p>
              <ul className="chip-list chip-list--plain">
                {p.groups[g.key].map((a) => (
                  <li key={a.artist_key} className="chip" title={a.listeners ? formatListeners(a.listeners) : undefined}>
                    {a.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <details className="disclosure">
        <summary>Alle {p.total} Artists</summary>
        <ol className="chip-list">
          {p.all.map((a) => (
            <li key={a.artist_key} className="chip">
              {a.name}
            </li>
          ))}
        </ol>
      </details>
      <p className="caption">
        Aus {joinGerman(p.sources.map((s) => SOURCE_LABEL[s]))}
        {p.trends ? ': letzte 4 Wochen, 6 Monate und alle Jahre' : ''}
        {p.loved > 0 ? ', dazu deine Lieblingssongs' : ''}. Grösse der Artists nach Last.fm-Hörern und Spotify-Popularität.
      </p>
    </section>
  );
}
