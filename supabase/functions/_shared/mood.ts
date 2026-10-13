// Tonight's mood from today's listening: the last hours of scrobbles and the artists' tags, mapped to
// genres, pace and length with a fixed rule table (no AI). Pure, used by the Edge Function and the browser.
import { artistKey } from './music.ts';

export const MOOD_WINDOW_HOURS = 6;
const MIN_PLAYS = 5;
const MIN_SHARE = 0.4; // the winning mood needs this share of the matched listening

export type MoodId = 'calm' | 'mellow' | 'upbeat' | 'energetic' | 'dark' | 'epic';

export interface MoodRule {
  id: MoodId;
  label: string; // what it means for tonight
  tags: string[];
  genres: { movie: number[]; tv: number[] }; // TMDb genre ids that fit
  avoid: { movie: number[]; tv: number[] };
  maxMinutes: number | null;
}

export const MOOD_RULES: MoodRule[] = [
  {
    id: 'calm',
    label: 'ruhige Dramen',
    tags: ['sad', 'melancholic', 'melancholy', 'singer-songwriter', 'indie folk', 'folk', 'acoustic', 'slowcore', 'sadcore', 'ambient', 'chamber pop', 'piano', 'ballad', 'bedroom pop', 'americana'],
    genres: { movie: [18, 10749], tv: [18] },
    avoid: { movie: [28, 27, 53], tv: [10759] },
    maxMinutes: 120,
  },
  {
    id: 'mellow',
    label: 'entspannte Feel-Good-Filme',
    tags: ['jazz', 'soul', 'neo-soul', 'r&b', 'rnb', 'lo-fi', 'lofi', 'chillout', 'chill', 'bossa nova', 'downtempo', 'easy listening'],
    genres: { movie: [35, 10749, 10402, 16], tv: [35] },
    avoid: { movie: [27], tv: [] },
    maxMinutes: 110,
  },
  {
    id: 'upbeat',
    label: 'leichte Komödien',
    tags: ['pop', 'dance', 'disco', 'funk', 'k-pop', 'synthpop', 'electropop', 'indie pop', 'house', 'eurodance', 'schlager'],
    genres: { movie: [35, 10751, 16, 10402, 12], tv: [35, 16] },
    avoid: { movie: [27, 10752], tv: [] },
    maxMinutes: 110,
  },
  {
    id: 'energetic',
    label: 'Action und Thriller mit Tempo',
    tags: ['rock', 'punk', 'metal', 'hardcore', 'hard rock', 'hip-hop', 'hip hop', 'rap', 'trap', 'drum and bass', 'techno', 'edm', 'garage rock', 'grunge', 'metalcore'],
    genres: { movie: [28, 53, 80, 12], tv: [10759, 80] },
    avoid: { movie: [10749], tv: [] },
    maxMinutes: null,
  },
  {
    id: 'dark',
    label: 'düstere Thriller und Mystery',
    tags: ['post-punk', 'darkwave', 'industrial', 'gothic', 'goth', 'doom', 'black metal', 'trip-hop', 'trip hop', 'noise', 'witch house', 'dark ambient', 'coldwave'],
    genres: { movie: [53, 9648, 27, 80], tv: [9648, 80] },
    avoid: { movie: [35, 10751], tv: [35] },
    maxMinutes: null,
  },
  {
    id: 'epic',
    label: 'grosses Kino mit Sci-Fi und Fantasy',
    tags: ['post-rock', 'soundtrack', 'score', 'classical', 'orchestral', 'cinematic', 'shoegaze', 'dream pop', 'psychedelic', 'progressive rock', 'synthwave', 'space rock', 'neoclassical'],
    genres: { movie: [878, 14, 12, 18], tv: [10765] },
    avoid: { movie: [], tv: [] },
    maxMinutes: null,
  },
];

// Longest rule tags first, so "dream pop" wins over "pop" and "dark ambient" over "ambient".
const TAG_INDEX = MOOD_RULES.flatMap((r) => r.tags.map((t) => ({ t, id: r.id }))).sort((a, b) => b.t.length - a.t.length);
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TAG_PATTERNS = TAG_INDEX.map(({ t, id }) => ({ id, re: new RegExp(`(^|[^a-z])${escape(t)}($|[^a-z])`) }));

export function moodOfTag(tag: string): MoodId | null {
  const t = tag.toLowerCase().trim();
  return TAG_PATTERNS.find((p) => p.re.test(t))?.id ?? null;
}

export interface RecentArtist {
  key: string;
  name: string;
  plays: number;
  times: number[]; // ms timestamps of the plays
}

const addPlay = (map: Map<string, RecentArtist>, name: string, at: number) => {
  const key = artistKey(name);
  if (!key) return;
  const a = map.get(key) ?? { key, name: name.trim().slice(0, 200), plays: 0, times: [] };
  a.plays++;
  a.times.push(at);
  map.set(key, a);
};

// Last.fm user.getrecenttracks (from = now − window). The track playing right now has no date.
export function lastfmRecentArtists(json: any, now: number): RecentArtist[] {
  const map = new Map<string, RecentArtist>();
  const tracks = json?.recenttracks?.track;
  for (const t of Array.isArray(tracks) ? tracks : tracks ? [tracks] : []) {
    const name = t?.artist?.['#text'] ?? t?.artist?.name;
    if (typeof name !== 'string') continue;
    const uts = Number(t?.date?.uts);
    addPlay(map, name, Number.isFinite(uts) && uts > 0 ? uts * 1000 : now);
  }
  return [...map.values()].sort((a, b) => b.plays - a.plays);
}

// stats.fm /users/{name}/streams/recent → only plays inside the window count.
export function statsfmRecentArtists(json: any, since: number): RecentArtist[] {
  const map = new Map<string, RecentArtist>();
  for (const s of Array.isArray(json?.items) ? json.items : []) {
    const at = Date.parse(s?.endTime);
    const first = s?.track?.artists?.[0]?.name;
    if (!Number.isFinite(at) || at < since || typeof first !== 'string') continue;
    addPlay(map, first, at);
  }
  return [...map.values()].sort((a, b) => b.plays - a.plays);
}

export interface ListeningMood {
  id: MoodId;
  label: string;
  line: string;
  artists: string[];
  plays: number;
  genres: MoodRule['genres'];
  avoid: MoodRule['avoid'];
  maxMinutes: number | null;
}

const HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: 'numeric', hourCycle: 'h23' });
const zurichHour = (ms: number) => Number(HOUR.formatToParts(ms).find((p) => p.type === 'hour')?.value ?? 12);
const partOfDay = (hour: number) => (hour < 5 ? 'heute Nacht' : hour < 12 ? 'heute Morgen' : hour < 18 ? 'heute Nachmittag' : 'heute Abend');
const lengthText = (minutes: number) => (minutes % 60 === 0 ? `unter ${minutes / 60} h` : `unter ${minutes} Min.`);

// tagsOf: the genre tags of an artist (strongest first), e.g. from Last.fm or Spotify genres.
export function moodFromListening(artists: RecentArtist[], tagsOf: (a: RecentArtist) => string[]): ListeningMood | null {
  const total = artists.reduce((sum, a) => sum + a.plays, 0);
  if (total < MIN_PLAYS) return null;
  const weight = new Map<MoodId, number>();
  for (const a of artists) {
    tagsOf(a)
      .slice(0, 3)
      .forEach((tag, i) => {
        const id = moodOfTag(tag);
        if (id) weight.set(id, (weight.get(id) ?? 0) + a.plays * [1, 0.6, 0.4][i]);
      });
  }
  const matched = [...weight.values()].reduce((x, y) => x + y, 0);
  const [best] = [...weight.entries()].sort((x, y) => y[1] - x[1]);
  if (!best || best[1] / matched < MIN_SHARE) return null;
  const rule = MOOD_RULES.find((r) => r.id === best[0])!;
  const times = artists.flatMap((a) => a.times).sort((x, y) => x - y);
  const when = partOfDay(zurichHour(times[Math.floor(times.length / 2)]));
  const [top, second] = artists;
  const who = top.plays / total > 0.5 ? `lief bei dir ${top.name} in Dauerschleife` : `liefen bei dir ${top.name}${second ? ` und ${second.name}` : ''}`;
  const tonight = rule.maxMinutes ? `${rule.label} ${lengthText(rule.maxMinutes)}` : rule.label;
  return {
    id: rule.id,
    label: rule.label,
    line: `${when.charAt(0).toUpperCase()}${when.slice(1)} ${who} → ${tonight}`,
    artists: artists.slice(0, 3).map((a) => a.name),
    plays: total,
    genres: rule.genres,
    avoid: rule.avoid,
    maxMinutes: rule.maxMinutes,
  };
}
