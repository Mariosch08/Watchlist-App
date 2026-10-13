import { Link } from 'react-router-dom';
import { onThisDay, reelMonths, yearsAgo } from '../../lib/reel.js';
import { detailPath } from '../../lib/labels.js';

// Life Reel: one page per month with what I watched, listened to and saw live, plus "On this day".
export default function LifeReel({ views, musicMonths, concerts, year, today }) {
  const months = reelMonths({ views, musicMonths, concerts, year, today });
  const memories = year === Number(today.slice(0, 4)) ? onThisDay({ views, musicMonths, concerts, today }) : [];
  return (
    <>
      {memories.length > 0 && (
        <section className="card" aria-labelledby="this-day-title">
          <h2 id="this-day-title">An diesem Tag</h2>
          <ul className="memories">
            {memories.map((m, i) => (
              <li key={`${m.kind}-${i}`}>
                <span className="caption">{yearsAgo(m.years)}</span>{' '}
                {m.kind === 'view' ? (
                  <>
                    <Link to={detailPath(m)}>{m.title}</Link> geschaut{m.rating ? ` (${m.rating}/10)` : ''}
                  </>
                ) : m.kind === 'concert' ? (
                  <>
                    {m.title} live{m.city ? ` in ${m.city}` : ''}
                  </>
                ) : (
                  <>
                    Im {m.month} {m.year} lief am meisten {m.title}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {months.length === 0 ? (
        <p className="empty">
          Für {year} gibt es noch nichts. Trag Gesehenes ins <Link to="/diary">Tagebuch</Link> ein und verbinde deine <Link to="/music">Musik</Link>.
        </p>
      ) : (
        <ol className="reel">
          {months.map((m) => (
            <li key={m.key} className="card reel-month" aria-labelledby={`reel-${m.key}`}>
              <h2 id={`reel-${m.key}`}>{m.label}</h2>
              <p className="reel-summary">{m.summary}</p>
              <dl className="reel-facts">
                {m.top && (
                  <div>
                    <dt>Top-{m.top.media_type === 'tv' ? 'Serie' : 'Film'}</dt>
                    <dd>
                      <Link to={detailPath(m.top)}>{m.top.title}</Link> {m.top.rating ? `· ${m.top.rating}/10` : ''}
                    </dd>
                  </div>
                )}
                {m.topTrack && (
                  <div>
                    <dt>Song in Dauerschleife</dt>
                    <dd>
                      {m.topTrack.name}
                      {m.topTrack.artist ? ` · ${m.topTrack.artist}` : ''}
                    </dd>
                  </div>
                )}
                {m.topArtist && (
                  <div>
                    <dt>Meistgehört</dt>
                    <dd>{m.topArtist}</dd>
                  </div>
                )}
                {m.gigs.length > 0 && (
                  <div>
                    <dt>Live</dt>
                    <dd>{m.gigs.map((g) => `${g.artist}${g.venue ? `, ${g.venue}` : ''}`).join(' · ')}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ol>
      )}
      <p className="caption">
        Filme und Serien aus Tagebuch und Watchlist, Musik pro Monat von stats.fm (echte Hörzeit) oder Last.fm (Plays × 3,5 Min.), Konzerte, die du auf
        der Musikseite eingetragen oder mit „Ich gehe hin“ markiert hast.
      </p>
    </>
  );
}
