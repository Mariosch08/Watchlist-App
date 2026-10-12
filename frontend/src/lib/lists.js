import { buildIcs } from '../../../supabase/functions/_shared/ics.ts';

export const voteKey = (t) => `${t.media_type}:${t.tmdb_id}`;

// Items with vote counts, my vote and whether everybody likes it ("Match"); best first.
export function rankItems(items, votes, memberCount, myId) {
  const byItem = new Map();
  for (const v of votes) {
    const k = voteKey(v);
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(v);
  }
  return items
    .map((t) => {
      const vs = byItem.get(voteKey(t)) ?? [];
      const up = vs.filter((v) => v.vote > 0).length;
      const down = vs.filter((v) => v.vote < 0).length;
      return {
        ...t,
        up,
        down,
        score: up - down,
        myVote: vs.find((v) => v.user_id === myId)?.vote ?? 0,
        match: memberCount > 1 && up === memberCount,
      };
    })
    .sort((a, b) => b.score - a.score || b.up - a.up || String(a.added_at).localeCompare(String(b.added_at)));
}

// "Was schauen wir?": the best title nobody vetoed; among equals pick at random.
export function groupPick(ranked, random = Math.random) {
  const pool = ranked.filter((t) => t.down === 0 && t.up > 0);
  const list = pool.length ? pool : ranked.filter((t) => t.score >= 0);
  if (!list.length) return null;
  const best = list.filter((t) => t.score === list[0].score && t.up === list[0].up);
  return best[Math.floor(random() * best.length)];
}

export const swipeQueue = (ranked) => ranked.filter((t) => t.myVote === 0);

// Per date option: who can, who cannot, my answer; the best option has the most "yes".
export function nightSummary(night, myId) {
  const votes = night.movie_night_votes ?? [];
  const options = night.options.map((at, index) => {
    const vs = votes.filter((v) => v.option_index === index);
    return {
      index,
      at,
      yes: vs.filter((v) => v.available).length,
      no: vs.filter((v) => !v.available).length,
      mine: vs.find((v) => v.user_id === myId)?.available ?? null,
    };
  });
  const best = options.reduce((acc, o) => (o.yes > (acc?.yes ?? 0) ? o : acc), null);
  return { options, best, voters: new Set(votes.map((v) => v.user_id)).size };
}

export function nightIcs(night, { listName, item, now } = {}) {
  const at = night.options[night.chosen_option];
  return buildIcs(
    [
      {
        uid: `night-${night.id}@watchlist-app`,
        date: at.slice(0, 10),
        start: at,
        minutes: 180,
        summary: `Filmabend: ${night.title}`,
        description: [item ? `Wir schauen: ${item.title}` : null, listName ? `Liste „${listName}“` : null].filter(Boolean).join('\n'),
      },
    ],
    { name: 'Filmabend', now },
  );
}

export const formatNightOption = (iso) =>
  new Date(iso).toLocaleString('de-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
