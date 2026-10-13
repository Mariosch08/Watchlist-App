// Score Bridge: films and series whose music was written by artists I listen to, and the other way round,
// albums of composers whose films I love. Pure helpers, used by the Edge Functions and the browser.
import { artistKey } from './music.ts';
import type { Candidate, Kind } from './scoring.ts';
import { COMPOSER_JOBS } from './tmdb.ts';

export const BRIDGE = {
  artists: 40, // my strongest artists that are checked against TMDb composers
  minAffinity: 0.2,
  composers: 6, // matched composers whose works become candidates
  perComposer: 8,
  minVotes: 10,
  boost: 14,
  favouriteRating: 9, // films rated this high lead to their composer's albums
  favourites: 8,
};

export interface ListenedArtist {
  key: string;
  name: string;
  playcount: number | null;
  affinity: number;
}

export interface Composer {
  person_id: number;
  name: string;
  plays: number | null;
  affinity: number;
}

// /search/person → the person only if TMDb knows them for music and the name is the same artist.
export function pickComposer(json: any, artist: Pick<ListenedArtist, 'key'>): { id: number; name: string } | null {
  const hit = (json?.results ?? []).find(
    (p: any) => Number.isInteger(p?.id) && p.known_for_department === 'Sound' && typeof p.name === 'string' && artistKey(p.name) === artist.key,
  );
  return hit ? { id: hit.id, name: hit.name } : null;
}

// /person/{id}/movie_credits or /tv_credits → candidates for the feed, best known first.
export function composerCandidates(json: any, kind: Kind, composer: Composer, n = BRIDGE.perComposer): Candidate[] {
  const seen = new Set<number>();
  return (json?.crew ?? [])
    .filter((c: any) => Number.isInteger(c?.id) && COMPOSER_JOBS.includes(c.job) && !c.adult && (c.vote_count ?? 0) >= BRIDGE.minVotes)
    .filter((c: any) => !seen.has(c.id) && seen.add(c.id))
    .sort((a: any, b: any) => (b.vote_count ?? 0) - (a.vote_count ?? 0))
    .slice(0, n)
    .map((c: any) => ({
      media_type: kind,
      tmdb_id: c.id,
      title: c.title ?? c.name ?? '',
      original_title: c.original_title ?? c.original_name ?? null,
      poster_path: c.poster_path ?? null,
      release_date: c.release_date || c.first_air_date || null,
      vote_average: c.vote_average ?? null,
      vote_count: c.vote_count ?? 0,
      genre_ids: Array.isArray(c.genre_ids) ? c.genre_ids : [],
      popularity: c.popularity ?? 0,
      sources: [`score:${composer.person_id}`],
    }));
}

export const scoreSource = (personId: number) => `score:${personId}`;

const plays = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '’')} Plays`;

// "Soundtrack von Jonny Greenwood – 312 Plays bei dir"
export const scoreReason = (c: Pick<Composer, 'name' | 'plays'>) =>
  `Soundtrack von ${c.name} – ${c.plays ? `${plays(c.plays)} bei dir` : 'läuft bei dir oft'}`;

// The other way: composers of my favourite films whose music I do not know yet.
export interface FavouriteFilm {
  media_type: Kind;
  tmdb_id: number;
  title: string;
  my_rating: number;
  composers: { id: number; name: string }[];
}

export function composersToDiscover(films: FavouriteFilm[], known: Set<string>, max = 6) {
  const out = new Map<string, { name: string; key: string; film: FavouriteFilm; known: boolean }>();
  for (const f of [...films].sort((a, b) => b.my_rating - a.my_rating)) {
    for (const c of f.composers) {
      const key = artistKey(c.name);
      if (!key || out.has(key)) continue;
      out.set(key, { name: c.name, key, film: f, known: known.has(key) });
    }
  }
  return [...out.values()].slice(0, max);
}

export interface BridgeAlbum {
  key: string; // feed external_id
  title: string;
  artist: string;
  image_url: string | null;
  url: string | null;
}

// Last.fm artist.gettopalbums → the soundtrack of the film first, then the best known album.
export function pickComposerAlbums(json: any, artist: string, filmTitle: string, n = 2): BridgeAlbum[] {
  const film = artistKey(filmTitle);
  const albums = (Array.isArray(json?.topalbums?.album) ? json.topalbums.album : [])
    .filter((a: any) => typeof a?.name === 'string' && a.name.trim() && a.name !== '(null)')
    .map((a: any, i: number) => ({ a, i, film: film.length > 2 && artistKey(a.name).includes(film) }));
  albums.sort((x: any, y: any) => Number(y.film) - Number(x.film) || x.i - y.i);
  return albums.slice(0, n).map(({ a }: any) => {
    const image = [...(Array.isArray(a.image) ? a.image : [])].reverse().find((im: any) => typeof im?.['#text'] === 'string' && im['#text'].startsWith('https://'));
    return {
      key: (typeof a.mbid === 'string' && /^[0-9a-f-]{36}$/.test(a.mbid) ? a.mbid : `lfm:${artistKey(artist)}|${artistKey(a.name)}`).slice(0, 100),
      title: a.name.trim().slice(0, 300),
      artist: artist.slice(0, 300),
      image_url: image ? image['#text'].slice(0, 500) : null,
      url: typeof a.url === 'string' && a.url.startsWith('https://www.last.fm/') ? a.url.slice(0, 500) : null,
    };
  });
}

// Detail page: which composers of this title are in my music (artist rows as stored in music_artists).
export function listenedComposers(
  composers: { id: number; name: string }[] | undefined,
  artists: { artist_key: string; name: string; playcount: number | null }[] | undefined,
): Pick<Composer, 'name' | 'plays'>[] {
  const byKey = new Map((artists ?? []).map((a) => [a.artist_key, a]));
  return (composers ?? []).flatMap((c) => {
    const a = byKey.get(artistKey(c.name));
    return a ? [{ name: a.name, plays: a.playcount }] : [];
  });
}
