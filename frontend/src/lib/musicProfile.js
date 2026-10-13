// Turns the analysed artists into a readable music profile: size of the collection, how far off the
// mainstream it is, genres, and the groups the tracker uses (constant favourites, rising, small, fading).
export const SMALL = 0.5; // same threshold as MUSIC.small in the Edge Function

export const SOURCE_LABEL = { lastfm: 'Last.fm', statsfm: 'stats.fm', spotify: 'Spotify' };

const weight = (a) => Math.max(0.05, a.affinity ?? 0);
const byAffinity = (a, b) => (b.affinity ?? 0) - (a.affinity ?? 0) || a.rank - b.rank;

export function musicProfile(artists = [], groupSize = 8) {
  const list = [...artists].sort(byAffinity);
  const sized = list.filter((a) => a.niche != null);
  const sizedWeight = sized.reduce((sum, a) => sum + weight(a), 0);
  const genreWeights = new Map();
  for (const a of list) for (const g of a.genres ?? []) genreWeights.set(g, (genreWeights.get(g) ?? 0) + weight(a));
  const genreTotal = [...genreWeights.values()].reduce((x, y) => x + y, 0);
  const pick = (fn) => list.filter(fn).slice(0, groupSize);
  return {
    total: list.length,
    small: list.filter((a) => (a.niche ?? 0) >= SMALL).length,
    // Weighted by how much I listen, so one small favourite counts more than ten I barely know.
    offMainstream: sized.length >= 5 ? Math.round((100 * sized.reduce((sum, a) => sum + weight(a) * a.niche, 0)) / sizedWeight) : null,
    loved: list.reduce((sum, a) => sum + (a.loved ?? 0), 0),
    genres: [...genreWeights]
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .slice(0, 8)
      .map(([name, w]) => ({ name, share: Math.round((100 * w) / genreTotal) })),
    groups: {
      core: pick((a) => a.trend === 'core'),
      rising: pick((a) => a.trend === 'rising'),
      hidden: pick((a) => (a.niche ?? 0) >= SMALL),
      fading: pick((a) => a.trend === 'fading'),
    },
    sources: [...new Set(list.flatMap((a) => a.sources ?? []))].filter((s) => SOURCE_LABEL[s]),
    trends: list.some((a) => a.trend),
    all: list,
  };
}

export const formatListeners = (n) => `${n.toLocaleString('de-CH')} Hörer`;
