// Daily series check: compares the stored progress row with fresh TMDb data (pure, testable).
import { pickEpisode } from './tmdb.ts';

type Episode = { season_number: number; episode_number: number; name: string | null; air_date: string | null } | null;

export interface StoredProgress {
  tmdb_id: number;
  number_of_seasons: number | null;
  last_episode_to_air: Episode;
}

export interface SeriesEvent {
  type: 'new_season' | 'new_episode';
  key: string; // dedupe key for notifications
  title: string;
  body: string;
  data: Record<string, unknown>;
}

const isAfter = (a: Episode, b: Episode) =>
  Boolean(a) && (!b || a!.season_number > b.season_number || (a!.season_number === b.season_number && a!.episode_number > b.episode_number));

export const episodeCode = (e: { season_number: number; episode_number: number }) =>
  `S${String(e.season_number).padStart(2, '0')}E${String(e.episode_number).padStart(2, '0')}`;

const formatDate = (iso: string | null) => (iso ? iso.split('-').reverse().join('.') : null);

export function diffSeries(prev: StoredProgress, raw: Record<string, any>, seriesTitle: string) {
  const last = pickEpisode(raw.last_episode_to_air);
  const next = pickEpisode(raw.next_episode_to_air);
  const seasons = Number.isInteger(raw.number_of_seasons) ? raw.number_of_seasons : null;
  const update = {
    tmdb_status: raw.status || null,
    number_of_seasons: seasons,
    number_of_episodes: Number.isInteger(raw.number_of_episodes) ? raw.number_of_episodes : null,
    last_episode_to_air: last,
    next_episode_to_air: next,
    last_checked_at: new Date().toISOString(),
  };
  const events: SeriesEvent[] = [];
  // First check after tracking started: remember the state, announce nothing.
  const firstCheck = prev.number_of_seasons == null && prev.last_episode_to_air == null;
  if (!firstCheck && seasons != null && prev.number_of_seasons != null && seasons > prev.number_of_seasons) {
    const when = next?.season_number === seasons ? formatDate(next.air_date) : null;
    events.push({
      type: 'new_season',
      key: `season:${prev.tmdb_id}:${seasons}`,
      title: `${seriesTitle}: Staffel ${seasons} angekündigt`,
      body: when ? `Start am ${when}.` : 'Eine neue Staffel ist angekündigt.',
      data: { media_type: 'tv', tmdb_id: prev.tmdb_id, season_number: seasons },
    });
  }
  if (!firstCheck && last && isAfter(last, prev.last_episode_to_air)) {
    events.push({
      type: 'new_episode',
      key: `episode:${prev.tmdb_id}:${episodeCode(last)}`,
      title: `${seriesTitle}: neue Folge ${episodeCode(last)}`,
      body: last.name ? `„${last.name}“ ist erschienen.` : 'Eine neue Folge ist erschienen.',
      data: { media_type: 'tv', tmdb_id: prev.tmdb_id, season_number: last.season_number, episode_number: last.episode_number },
    });
  }
  return { update, events };
}
