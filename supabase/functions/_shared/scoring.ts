// Taste profile and recommendation scoring (pure, testable). Weights range from -1 (avoid) to +1 (love).

export type Kind = 'movie' | 'tv';

export interface RatedItem {
  media_type: Kind;
  tmdb_id: number;
  title: string;
  status: string;
  my_rating: number | null;
  genre_ids: number[] | null;
}

export interface Candidate {
  media_type: Kind;
  tmdb_id: number;
  title: string;
  original_title?: string | null;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  vote_count: number;
  genre_ids: number[];
  popularity?: number;
  sources: string[]; // e.g. 'upcoming', 'now_playing', 'discover', 'providers', 'because:movie:438631'
}

export const SCORING = {
  likeMin: 8, // ratings >= likeMin raise genre weights
  dislikeMax: 4, // ratings <= dislikeMax lower them
  likeDelta: 1,
  dislikeDelta: -1,
  neutralDelta: 0.15, // titles on the list without rating count a little
  topN: 20,
  feedbackLike: 0.1,
  feedbackDislike: -0.15,
};

export const clamp = (x: number, min = -1, max = 1) => Math.max(min, Math.min(max, x));

// Weights from ratings: average signal per genre, damped by how often it occurs.
export function deriveWeights(items: RatedItem[], kind: Kind, cfg = SCORING) {
  const sum = new Map<number, number>();
  const count = new Map<number, number>();
  for (const it of items) {
    if (it.media_type !== kind || !it.genre_ids?.length) continue;
    let signal = 0;
    if (it.my_rating != null && it.my_rating >= cfg.likeMin) signal = cfg.likeDelta;
    else if (it.my_rating != null && it.my_rating <= cfg.dislikeMax) signal = cfg.dislikeDelta;
    else if (it.my_rating == null && it.status !== 'dropped') signal = cfg.neutralDelta;
    else if (it.status === 'dropped') signal = cfg.dislikeDelta / 2;
    for (const g of it.genre_ids) {
      sum.set(g, (sum.get(g) ?? 0) + signal);
      count.set(g, (count.get(g) ?? 0) + 1);
    }
  }
  const out: Record<string, number> = {};
  for (const [g, s] of sum) {
    const n = count.get(g)!;
    out[String(g)] = clamp((s / n) * Math.min(1, n / 3)); // fewer than 3 titles: weaker signal
  }
  return out;
}

// Effective weights = derived from ratings + manual adjustments (feedback, sliders).
export function effectiveWeights(derived: Record<string, number>, adjustments: Record<string, number> = {}) {
  const out: Record<string, number> = { ...derived };
  for (const [g, a] of Object.entries(adjustments)) out[g] = clamp((out[g] ?? 0) + Number(a || 0));
  return out;
}

export const topGenres = (weights: Record<string, number>, n = 3) =>
  Object.entries(weights)
    .filter(([, w]) => w > 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([g]) => Number(g));

export interface ScoreContext {
  weights: Record<Kind, Record<string, number>>;
  excluded: Set<string>; // 'movie:603' – on the list, rejected or removed
  becauseTitles: Map<string, { title: string; rating: number }>; // source key -> title that caused it
  providerNames: string[];
  genreNames: Record<Kind, Record<string, string>>;
  today: string; // YYYY-MM-DD
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

export function scoreCandidate(c: Candidate, ctx: ScoreContext) {
  const weights = ctx.weights[c.media_type] ?? {};
  const genres = c.genre_ids ?? [];
  const genreScore = genres.length ? genres.reduce((s, g) => s + (weights[String(g)] ?? 0), 0) / genres.length : 0;
  const votes = c.vote_count ?? 0;
  const ratingScore = c.vote_average ? (c.vote_average - 6) * (votes >= 100 ? 4 : votes >= 20 ? 2 : 0.5) : 0;
  let recency = 0;
  let fresh = false;
  if (c.release_date) {
    const age = daysBetween(ctx.today, c.release_date);
    if (age >= -120 && age <= 60) {
      recency = 10;
      fresh = true;
    } else if (age > 365 * 8) recency = -4;
  }
  const because = c.sources.map((s) => ctx.becauseTitles.get(s)).find(Boolean);
  const onMyServices = c.sources.includes('providers');
  const score = genreScore * 40 + ratingScore + recency + (because ? 15 : 0) + (onMyServices ? 12 : 0) + Math.min(5, (c.popularity ?? 0) / 40);

  const reasons: string[] = [];
  if (because) reasons.push(`Weil du „${because.title}“ mit ${because.rating} bewertet hast`);
  if (onMyServices && ctx.providerNames.length) reasons.push(`Auf deinen Streaming-Diensten (${ctx.providerNames.slice(0, 2).join(', ')})`);
  if (fresh) reasons.push(c.release_date! > ctx.today ? 'Erscheint bald' : 'Neu erschienen');
  const liked = genres
    .filter((g) => (weights[String(g)] ?? 0) > 0.3)
    .map((g) => ctx.genreNames[c.media_type]?.[String(g)])
    .filter(Boolean)
    .slice(0, 2);
  if (!because && liked.length) reasons.push(`Passt zu deinen Lieblingsgenres: ${liked.join(', ')}`);
  return { score: Math.round(score * 10) / 10, reason: reasons[0] ?? 'Beliebt gerade', reasons, fresh };
}

// Scores, removes excluded titles and keeps genre variety in the top list.
export function rankCandidates(candidates: Candidate[], ctx: ScoreContext, n = SCORING.topN) {
  const merged = new Map<string, Candidate>();
  for (const c of candidates) {
    const key = `${c.media_type}:${c.tmdb_id}`;
    if (ctx.excluded.has(key)) continue;
    const prev = merged.get(key);
    merged.set(key, prev ? { ...prev, sources: [...new Set([...prev.sources, ...c.sources])] } : c);
  }
  const scored = [...merged.values()]
    .map((c) => ({ c, ...scoreCandidate(c, ctx) }))
    .sort((a, b) => b.score - a.score);
  const picked: typeof scored = [];
  const perGenre = new Map<number, number>();
  for (const s of scored) {
    const main = s.c.genre_ids?.[0];
    if (main != null && (perGenre.get(main) ?? 0) >= Math.ceil(n / 4)) continue;
    picked.push(s);
    if (main != null) perGenre.set(main, (perGenre.get(main) ?? 0) + 1);
    if (picked.length >= n) break;
  }
  return picked;
}
