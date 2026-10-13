import { unwrap } from '../errors.js';
import { invokeFunction, supabase } from '../supabase.js';

export async function fetchSeriesOverview() {
  return unwrap(await supabase.rpc('series_overview'));
}

// Catch-up plans before a season premiere (created by the daily series check).
export async function fetchCatchups() {
  return unwrap(await supabase.from('catchup_plans').select('tmdb_id, season_number, premiere, behind_at_start, per_week, started_on, dismissed'));
}

export async function dismissCatchup(tmdbId, seasonNumber) {
  unwrap(await supabase.from('catchup_plans').update({ dismissed: true }).match({ tmdb_id: tmdbId, season_number: seasonNumber }));
}

// Episodes ticked off in a time range (calendar).
export async function fetchEpisodesBetween(fromIso, toIso) {
  return unwrap(
    await supabase.from('watched_episodes').select('tmdb_id, season_number, episode_number, watched_at').gte('watched_at', fromIso).lt('watched_at', toIso).order('watched_at').limit(3000),
  );
}

// Episodes marked as watched since a date (for the viewing pace).
export async function fetchRecentEpisodes(since) {
  return unwrap(await supabase.from('watched_episodes').select('tmdb_id, watched_at').gte('watched_at', since).order('watched_at').limit(3000));
}

export async function fetchProgress(tmdbId) {
  const [progress, episodes] = await Promise.all([
    supabase.from('series_progress').select('tmdb_id, next_up_season, next_up_episode, created_at').eq('tmdb_id', tmdbId).maybeSingle(),
    supabase.from('watched_episodes').select('season_number, episode_number, watched_at').eq('tmdb_id', tmdbId),
  ]);
  return { tracking: Boolean(unwrap(progress)), episodes: unwrap(episodes) };
}

export async function fetchSeason(tmdbId, seasonNumber) {
  return invokeFunction('tmdb', { action: 'season', tmdb_id: Number(tmdbId), season_number: seasonNumber });
}

// Creates the progress row (once) with what the detail page already knows about the series.
export async function startTracking(details) {
  unwrap(
    await supabase.from('series_progress').upsert(
      {
        tmdb_id: details.tmdb_id,
        tmdb_status: details.tmdb_status ?? null,
        number_of_seasons: details.number_of_seasons ?? null,
        number_of_episodes: details.number_of_episodes ?? null,
        last_episode_to_air: details.last_episode_to_air ?? null,
        next_episode_to_air: details.next_episode_to_air ?? null,
      },
      { onConflict: 'user_id,tmdb_id', ignoreDuplicates: true },
    ),
  );
}

export async function markEpisodes(tmdbId, episodes) {
  if (!episodes.length) return;
  unwrap(
    await supabase.from('watched_episodes').upsert(
      episodes.map((e) => ({ tmdb_id: tmdbId, season_number: e.season_number, episode_number: e.episode_number })),
      { onConflict: 'user_id,tmdb_id,season_number,episode_number', ignoreDuplicates: true },
    ),
  );
}

export async function unmarkEpisodes(tmdbId, episodes) {
  for (const season of new Set(episodes.map((e) => e.season_number))) {
    const numbers = episodes.filter((e) => e.season_number === season).map((e) => e.episode_number);
    unwrap(await supabase.from('watched_episodes').delete().eq('tmdb_id', tmdbId).eq('season_number', season).in('episode_number', numbers));
  }
}

export async function saveNextUp(tmdbId, next) {
  unwrap(
    await supabase
      .from('series_progress')
      .update({ next_up_season: next?.season_number ?? null, next_up_episode: next?.episode_number ?? null })
      .eq('tmdb_id', tmdbId),
  );
}

export async function stopTracking(tmdbId) {
  unwrap(await supabase.from('series_progress').delete().eq('tmdb_id', tmdbId));
}
