import { Check, Eye } from 'lucide-react';
import { useState } from 'react';
import { useSeason } from '../../hooks/useSeries.js';
import { errorMessage } from '../../lib/errors.js';
import { formatDate } from '../../lib/labels.js';
import { episodeCode, episodeKey, isAired } from '../../lib/series.js';

function EpisodeRow({ episode, season, watched, hideSpoilers, onToggle, onUntilHere }) {
  const [reveal, setReveal] = useState(false);
  const aired = isAired(episode.air_date);
  const code = episodeCode(season, episode.episode_number);
  const spoiler = hideSpoilers && !watched && !reveal && episode.overview;
  return (
    <li className="episode">
      <label className="episode-check">
        <input type="checkbox" checked={watched} disabled={!aired && !watched} onChange={(e) => onToggle(e.target.checked)} />
        <span className="visually-hidden">{`${code} als gesehen markieren`}</span>
      </label>
      <div className="episode-main">
        <span className="episode-title">
          <span className="mono">{code}</span> {episode.name ?? `Folge ${episode.episode_number}`}
        </span>
        <span className="meta">
          {episode.air_date && <span>{aired ? formatDate(episode.air_date) : `ab ${formatDate(episode.air_date)}`}</span>}
          {episode.runtime && <span>{episode.runtime} Min.</span>}
        </span>
        {episode.overview &&
          (spoiler ? (
            <button type="button" className="link caption" onClick={() => setReveal(true)}>
              <Eye size={12} aria-hidden="true" /> Beschreibung anzeigen (Spoiler)
            </button>
          ) : (
            <p className="caption episode-overview">{episode.overview}</p>
          ))}
      </div>
      {aired && !watched && (
        <button type="button" className="btn-ghost btn-compact" onClick={onUntilHere} title="Alle Folgen bis hier als gesehen markieren">
          <Check size={16} aria-hidden="true" />
          Bis hier
        </button>
      )}
    </li>
  );
}

// Episodes of one season, loaded when the season is opened.
export default function SeasonEpisodes({ tmdbId, season, watched, hideSpoilers, onToggle, onUntilHere }) {
  const query = useSeason(tmdbId, season.season_number, true);
  if (query.isError) return <p className="field-error">{errorMessage(query.error)}</p>;
  if (!query.data) return <span className="skeleton skeleton--line skeleton--long" aria-label="Folgen werden geladen" />;
  return (
    <ul className="list episodes">
      {query.data.episodes.map((ep) => (
        <EpisodeRow
          key={ep.episode_number}
          episode={ep}
          season={season.season_number}
          watched={watched.has(episodeKey(season.season_number, ep.episode_number))}
          hideSpoilers={hideSpoilers}
          onToggle={(checked) => onToggle([{ season_number: season.season_number, episode_number: ep.episode_number }], checked)}
          onUntilHere={() => onUntilHere(season.season_number, ep.episode_number)}
        />
      ))}
    </ul>
  );
}
