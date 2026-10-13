// Subscription rotation: which single service to have in each of the next months, based on where the
// watchlist streams in Switzerland, how long the titles are and how much I really watch. Pure, used by the
// Streaming page (plan) and the calendar function (reminders).
import type { CalendarEvent } from './ics.ts';

// Monthly prices in CHF (standard plan, as a starting point – everybody can set their own).
export const DEFAULT_PRICES: Record<number, number> = {
  8: 18.9, // Netflix
  337: 13.9, // Disney+
  119: 5.9, // Amazon Prime Video
  350: 12.9, // Apple TV+
  11: 13.9, // MUBI
  283: 7.9, // Crunchyroll
  531: 9.9, // Paramount+
};
export const FALLBACK_PRICE = 12;
export const DEFAULT_PACE = 240; // minutes per week when the diary is too thin
const WEEKS_PER_MONTH = 52 / 12;
const MIN_MONTH_MINUTES = 90; // a month for less than this is not worth it

export function priceOf(id: number, own: Record<string, unknown> = {}) {
  const mine = Number(own[String(id)]);
  if (Number.isFinite(mine) && mine >= 0 && mine <= 200) return { price: mine, estimated: false };
  return id in DEFAULT_PRICES ? { price: DEFAULT_PRICES[id], estimated: false } : { price: FALLBACK_PRICE, estimated: true };
}

// Minutes per week over the last weeks, from what was really watched (diary, finished films, episodes).
export function viewingPace(watched: { date: string; minutes: number }[], today: string, weeks = 12) {
  const from = new Date(Date.parse(today) - weeks * 7 * 86_400_000).toISOString().slice(0, 10);
  const total = watched.filter((w) => w.date >= from && w.date <= today).reduce((sum, w) => sum + Math.max(0, w.minutes), 0);
  if (total < 120) return { minutesPerWeek: DEFAULT_PACE, estimated: true };
  return { minutesPerWeek: Math.round(total / weeks), estimated: false };
}

export interface PlanTitle {
  key: string; // 'movie:603'
  title: string;
  minutes: number;
  providers: number[]; // flatrate in CH
}

export interface PlanMonth {
  month: string; // YYYY-MM
  provider_id: number;
  provider: string;
  price: number;
  minutes: number;
  titles: { key: string; title: string }[];
}

const monthAdd = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const daysIn = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

// Starts this month if enough of it is left, otherwise next month.
export function planStart(today: string) {
  const month = today.slice(0, 7);
  const left = daysIn(month) - Number(today.slice(8, 10)) + 1;
  return left >= 10 ? { month, share: left / daysIn(month) } : { month: monthAdd(month, 1), share: 1 };
}

export function planRotation({
  titles,
  names,
  pace,
  prices = {},
  current = [],
  today,
  months = 3,
}: {
  titles: PlanTitle[]; // in priority order (what I want to watch first)
  names: Record<number, string>;
  pace: number; // minutes per week
  prices?: Record<string, unknown>;
  current?: number[]; // services I pay for now
  today: string;
  months?: number;
}) {
  const start = planStart(today);
  const paid = (id: number) => priceOf(id, prices).price > 0;
  // Titles on a free service need no subscription at all.
  const free = titles.filter((t) => t.providers.some((id) => !paid(id)));
  let open = titles.filter((t) => t.providers.length && !free.includes(t));
  const plan: PlanMonth[] = [];
  for (let i = 0; i < months; i++) {
    const capacity = pace * WEEKS_PER_MONTH * (i === 0 ? start.share : 1);
    const fill = (id: number) => {
      const picked: PlanTitle[] = [];
      let used = 0;
      for (const t of open) {
        if (!t.providers.includes(id)) continue;
        if (picked.length && used + t.minutes > capacity) continue;
        picked.push(t);
        used += t.minutes;
      }
      return { picked, used, value: Math.min(used, capacity) };
    };
    const ids = [...new Set(open.flatMap((t) => t.providers))].filter(paid);
    const best = ids
      .map((id) => ({ id, ...fill(id), price: priceOf(id, prices).price }))
      .filter((x) => x.value >= Math.min(MIN_MONTH_MINUTES, capacity))
      .sort((a, b) => b.value - a.value || a.price - b.price || a.id - b.id)[0];
    if (!best) break;
    plan.push({
      month: monthAdd(start.month, i),
      provider_id: best.id,
      provider: names[best.id] ?? `Dienst ${best.id}`,
      price: best.price,
      minutes: Math.round(best.used),
      titles: best.picked.slice(0, 40).map((t) => ({ key: t.key, title: t.title.slice(0, 120) })),
    });
    open = open.filter((t) => !best.picked.includes(t));
  }
  const cost = round2(plan.reduce((sum, m) => sum + m.price, 0));
  // Compared to keeping what I pay for now – or, without subscriptions, to having all planned services at once.
  const keep = current.filter(paid).length ? current.filter(paid) : [...new Set(plan.map((m) => m.provider_id))];
  const baseline = round2(keep.reduce((sum, id) => sum + priceOf(id, prices).price, 0) * plan.length);
  return {
    months: plan,
    cost,
    baseline,
    savings: round2(baseline - cost),
    free: free.map((t) => t.key),
    later: open.map((t) => t.key),
    start: start.month,
  };
}

const round2 = (x: number) => Math.round(x * 100) / 100;
const chf = (x: number) => `CHF ${x.toFixed(2).replace(/\.00$/, '')}`;
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}.${Number(iso.slice(5, 7))}.`;

// A saved plan from the database: only well-formed months survive.
export function sanitizePlan(raw: unknown): PlanMonth[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m: any) => /^\d{4}-\d{2}$/.test(m?.month ?? '') && Number.isInteger(m?.provider_id) && typeof m?.provider === 'string')
    .slice(0, 6)
    .map((m: any) => ({
      month: m.month,
      provider_id: m.provider_id,
      provider: m.provider.slice(0, 60),
      price: Number.isFinite(m.price) ? m.price : 0,
      minutes: Number.isFinite(m.minutes) ? m.minutes : 0,
      titles: (Array.isArray(m.titles) ? m.titles : [])
        .filter((t: any) => typeof t?.key === 'string' && typeof t?.title === 'string')
        .slice(0, 40)
        .map((t: any) => ({ key: t.key.slice(0, 40), title: t.title.slice(0, 120) })),
    }));
}

// Calendar reminders: start a service on the 1st, cancel it three days before the month ends
// ("Netflix bis 30.11. kündigen – noch 1 Titel offen"). done: title keys already watched.
export function rotationEvents(months: PlanMonth[], { today, done = new Set<string>() }: { today: string; done?: Set<string> }): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  months.forEach((m, i) => {
    const prev = months[i - 1];
    const next = months[i + 1];
    const first = `${m.month}-01`;
    const last = `${m.month}-${String(daysIn(m.month)).padStart(2, '0')}`;
    const open = m.titles.filter((t) => !done.has(t.key));
    if ((!prev || prev.provider_id !== m.provider_id) && first >= today) {
      events.push({
        uid: `rotation-start-${m.month}-${m.provider_id}@watchlist-app`,
        date: first,
        summary: `Abo starten: ${m.provider} (${m.titles.length} Titel geplant)`,
        description: `${chf(m.price)} für ${m.month.slice(5)}/${m.month.slice(0, 4)}.\n${m.titles.map((t) => t.title).join('\n')}`,
      });
    }
    const remind = new Date(Date.parse(last) - 3 * 86_400_000).toISOString().slice(0, 10);
    if ((!next || next.provider_id !== m.provider_id) && last >= today) {
      events.push({
        uid: `rotation-cancel-${m.month}-${m.provider_id}@watchlist-app`,
        date: remind >= today ? remind : last,
        summary: `${m.provider} bis ${dayMonth(last)} kündigen – ${open.length ? `noch ${open.length} Titel offen` : 'alles geschaut'}`,
        description: open.map((t) => t.title).join('\n') || 'Alles aus dem Plan ist geschaut.',
      });
    }
  });
  return events;
}
