// Streaming availability across the watchlist (pure, used by the edge function and the browser).

export interface ProviderRef {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface TitleAvailability {
  media_type: 'movie' | 'tv';
  tmdb_id: number;
  title: string;
  poster_path?: string | null;
  flatrate: ProviderRef[]; // incl. free and with ads
}

export const providersCacheKey = (mediaType: string, id: number) => `wp:${mediaType}:${id}:CH`;
export const titleKeyOf = (t: { media_type: string; tmdb_id: number }) => `${t.media_type}:${t.tmdb_id}`;

export interface ProviderSummary extends ProviderRef {
  count: number;
  exclusive: number; // titles that none of my current services has
  mine: boolean;
  titles: string[]; // title keys
}

export function summarize(items: TitleAvailability[], myProviders: number[]) {
  const mine = new Set(myProviders);
  const byProvider = new Map<number, ProviderSummary>();
  let covered = 0;
  for (const it of items) {
    const ids = new Set(it.flatrate.map((p) => p.id));
    const onMine = [...ids].some((id) => mine.has(id));
    if (onMine) covered++;
    for (const p of it.flatrate) {
      const s = byProvider.get(p.id) ?? { ...p, count: 0, exclusive: 0, mine: mine.has(p.id), titles: [] };
      s.count++;
      if (!onMine) s.exclusive++;
      s.titles.push(titleKeyOf(it));
      byProvider.set(p.id, s);
    }
  }
  const providers = [...byProvider.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const nowhere = items.filter((it) => it.flatrate.length === 0).length;
  return { total: items.length, covered, nowhere, providers };
}

// Greedy pick of up to k services that together cover the most titles.
export function bestCombination(providers: ProviderSummary[], k = 2) {
  const chosen: ProviderSummary[] = [];
  const covered = new Set<string>();
  for (let i = 0; i < k; i++) {
    let best: ProviderSummary | null = null;
    let gain = 0;
    for (const p of providers) {
      if (chosen.includes(p)) continue;
      const g = p.titles.filter((t) => !covered.has(t)).length;
      if (g > gain) {
        best = p;
        gain = g;
      }
    }
    if (!best) break;
    chosen.push(best);
    best.titles.forEach((t) => covered.add(t));
  }
  return { providers: chosen, covered: covered.size };
}

// Advice for this month: the service that adds most titles you cannot watch yet, and subscriptions you hardly use.
export function advice(summary: ReturnType<typeof summarize>, { minUseful = 3 } = {}) {
  const add = summary.providers.filter((p) => !p.mine && p.exclusive > 0).sort((a, b) => b.exclusive - a.exclusive)[0] ?? null;
  const unused = summary.providers.filter((p) => p.mine && p.count < minUseful);
  return { add, unused };
}

// Does a title's current flatrate list satisfy an alert? Returns the matching providers.
export function alertMatches(flatrate: ProviderRef[], wanted: number[] | null) {
  if (!flatrate.length) return [];
  if (!wanted || wanted.length === 0) return flatrate;
  const set = new Set(wanted);
  return flatrate.filter((p) => set.has(p.id));
}
