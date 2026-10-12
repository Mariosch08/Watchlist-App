// "Was schauen wir heute?": one suggestion from the own watchlist (pure).
// TMDb genre ids for movies and series.
export const MOODS = [
  { id: 'light', label: 'Leicht & lustig', genres: [35, 16, 10751, 10749, 10402] },
  { id: 'tense', label: 'Spannend', genres: [53, 28, 80, 9648, 27, 10759] },
  { id: 'deep', label: 'Tiefgründig', genres: [18, 36, 10752, 99, 10768] },
  { id: 'fantastic', label: 'Fantastisch', genres: [878, 14, 12, 10765] },
];

export const DURATIONS = [
  { id: 'any', label: 'Egal', minutes: null },
  { id: '100', label: 'Unter 100 Min.', minutes: 100 },
  { id: '130', label: 'Unter 130 Min.', minutes: 130 },
];

export function tonightCandidates(items, { kind = 'any', maxMinutes = null, mood = null } = {}) {
  const moodGenres = MOODS.find((m) => m.id === mood)?.genres;
  return (items ?? []).filter((i) => {
    if (kind !== 'any' && i.media_type !== kind) return false;
    if (i.media_type === 'movie' && i.status !== 'planned') return false;
    if (i.media_type === 'tv' && !['planned', 'watching'].includes(i.status)) return false;
    if (maxMinutes && i.media_type === 'movie' && i.runtime && i.runtime > maxMinutes) return false;
    if (moodGenres && !(i.genre_ids ?? []).some((g) => moodGenres.includes(g))) return false;
    return true;
  });
}

// Weighted pick among the best candidates, skipping ones shown before ("Nochmal").
export function pickTonight(items, options = {}, { shown = [], weights = {}, random = Math.random } = {}) {
  const pool = tonightCandidates(items, options).filter((i) => !shown.includes(`${i.media_type}:${i.tmdb_id}`));
  if (!pool.length) return null;
  const score = (i) => {
    const genre = (i.genre_ids ?? []).reduce((s, g) => s + (weights[i.media_type]?.[String(g)] ?? 0), 0) / Math.max(1, i.genre_ids?.length ?? 1);
    const tvBonus = i.media_type === 'tv' && i.status === 'watching' ? 1 : 0;
    return (Number(i.vote_average) || 6) + genre * 3 + tvBonus;
  };
  const top = [...pool].sort((a, b) => score(b) - score(a)).slice(0, 6);
  const total = top.reduce((s, i, idx) => s + (top.length - idx), 0);
  let r = random() * total;
  for (let idx = 0; idx < top.length; idx++) {
    r -= top.length - idx;
    if (r <= 0) return top[idx];
  }
  return top[top.length - 1];
}
