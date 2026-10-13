// One agenda for everything with a date: new episodes, film starts, concerts (found and planned), announced
// albums, catch-up sessions before a season premiere and subscription reminders. Used by the Calendar
// page and the ICS subscription, so both always show the same.
import type { CalendarEvent } from './ics.ts';
import { type PlanMonth, rotationEvents } from './rotation.ts';
import { catchUpPlan, type CatchUpSeries, episodeCode, sessionLabel } from './series.ts';

export type AgendaKind = 'episode' | 'movie' | 'concert' | 'album' | 'catchup' | 'rotation';

export interface AgendaItem {
  uid: string;
  date: string; // YYYY-MM-DD
  kind: AgendaKind;
  title: string;
  detail: string;
  path?: string; // in the app
  url?: string; // outside (tickets)
  start?: string; // timed event
}

export interface AgendaInput {
  series?: (CatchUpSeries & { title?: string | null; watch_status?: string | null })[];
  watchlist?: { media_type: string; tmdb_id: number; title: string; status: string; release_date?: string | null }[];
  concerts?: { event_id: string; artist: string; name?: string | null; venue?: string | null; city?: string | null; local_date: string; starts_at?: string | null; url?: string | null }[];
  going?: { event_id?: string | null; artist: string; venue?: string | null; city?: string | null; local_date: string }[]; // concert_log
  albums?: { external_id: string; title: string; subtitle?: string | null; release_date?: string | null }[];
  rotation?: PlanMonth[];
  done?: Set<string>; // title keys already watched (for rotation reminders)
  dismissedCatchUps?: Set<string>; // 'tmdb_id:season'
}

export const KIND_LABEL: Record<AgendaKind, string> = {
  episode: 'Neue Folge',
  movie: 'Filmstart',
  concert: 'Konzert',
  album: 'Album',
  catchup: 'Aufholen',
  rotation: 'Abo',
};

const place = (c: { venue?: string | null; city?: string | null }) => [c.venue, c.city].filter(Boolean).join(', ');

export function buildAgenda(input: AgendaInput, { today, days = 30 }: { today: string; days?: number }): AgendaItem[] {
  const to = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const inRange = (d?: string | null): d is string => Boolean(d) && d! >= today && d! <= to;
  const items: AgendaItem[] = [];

  for (const s of input.series ?? []) {
    if (s.watch_status === 'dropped') continue;
    const title = s.title ?? 'Serie';
    const ep = s.next_episode_to_air;
    if (ep && inRange(ep.air_date)) {
      items.push({
        uid: `ep-${s.tmdb_id}-${ep.season_number}-${ep.episode_number}@watchlist-app`,
        date: ep.air_date,
        kind: 'episode',
        title,
        detail: `${episodeCode(ep)}${ep.name ? ` · ${ep.name}` : ''}${ep.episode_number === 1 ? ' · Staffelstart' : ''}`,
        path: `/title/tv/${s.tmdb_id}`,
      });
    }
    const plan = catchUpPlan(s, today);
    if (plan && !input.dismissedCatchUps?.has(`${s.tmdb_id}:${plan.season}`)) {
      for (const session of plan.sessions) {
        if (!inRange(session.date)) continue;
        items.push({
          uid: `catchup-${s.tmdb_id}-${plan.season}-${session.date}@watchlist-app`,
          date: session.date,
          kind: 'catchup',
          title,
          detail: `${sessionLabel(session)} schauen – Staffel ${plan.season} startet am ${plan.premiere.split('-').reverse().join('.')}`,
          path: `/title/tv/${s.tmdb_id}`,
        });
      }
    }
  }

  for (const m of input.watchlist ?? []) {
    if (m.media_type !== 'movie' || m.status !== 'planned' || !inRange(m.release_date)) continue;
    items.push({ uid: `movie-${m.tmdb_id}@watchlist-app`, date: m.release_date, kind: 'movie', title: m.title, detail: 'Filmstart', path: `/title/movie/${m.tmdb_id}` });
  }

  const going = new Set((input.going ?? []).map((g) => g.event_id).filter(Boolean));
  for (const c of input.concerts ?? []) {
    if (!inRange(c.local_date)) continue;
    items.push({
      uid: `concert-${c.event_id}@watchlist-app`,
      date: c.local_date,
      kind: 'concert',
      title: c.artist,
      detail: [going.has(c.event_id) ? 'Du gehst hin' : null, place(c) || null, c.name && c.name !== c.artist ? c.name : null].filter(Boolean).join(' · '),
      path: '/music',
      url: c.url ?? undefined,
      start: going.has(c.event_id) && c.starts_at ? c.starts_at : undefined,
    });
  }
  const found = new Set((input.concerts ?? []).map((c) => c.event_id));
  for (const g of input.going ?? []) {
    if ((g.event_id && found.has(g.event_id)) || !inRange(g.local_date)) continue;
    items.push({ uid: `going-${g.event_id ?? `${g.artist}-${g.local_date}`}@watchlist-app`, date: g.local_date, kind: 'concert', title: g.artist, detail: ['Du gehst hin', place(g) || null].filter(Boolean).join(' · '), path: '/music' });
  }

  for (const a of input.albums ?? []) {
    if (!inRange(a.release_date)) continue;
    items.push({ uid: `album-${a.external_id}@watchlist-app`, date: a.release_date, kind: 'album', title: a.subtitle ? `${a.subtitle} – ${a.title}` : a.title, detail: 'Erscheint heute', path: '/music' });
  }

  for (const e of rotationEvents(input.rotation ?? [], { today, done: input.done })) {
    if (!inRange(e.date)) continue;
    items.push({ uid: e.uid, date: e.date, kind: 'rotation', title: e.summary, detail: e.description ?? '', path: '/streaming' });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
}

// The same agenda as calendar events (all-day, timed only for concerts I go to).
export function agendaToIcs(items: AgendaItem[], appUrl?: string): CalendarEvent[] {
  return items.map((i) => ({
    uid: i.uid,
    date: i.date,
    start: i.start,
    summary:
      i.kind === 'rotation'
        ? i.title
        : i.kind === 'episode'
          ? `${i.title} ${i.detail.split(' · ')[0]}`
          : i.kind === 'catchup'
            ? `${i.title}: ${i.detail.split(' – ')[0]}`
            : `${KIND_LABEL[i.kind]}: ${i.title}`,
    description: [i.detail, appUrl && i.path ? `${appUrl.replace(/\/$/, '')}${i.path}` : null].filter(Boolean).join('\n'),
    url: i.url,
  }));
}
