import { describe, expect, it } from 'vitest';
import {
  composerCandidates,
  composersToDiscover,
  listenedComposers,
  pickComposer,
  pickComposerAlbums,
  scoreReason,
} from '../supabase/functions/_shared/bridge.ts';
import { rankCandidates } from '../supabase/functions/_shared/scoring.ts';
import { normalizeComposers, normalizeDetails } from '../supabase/functions/_shared/tmdb.ts';

const JG = { person_id: 13, name: 'Jonny Greenwood', plays: 312, affinity: 0.8 };

describe('Score Bridge: artists → films', () => {
  it('accepts a TMDb person only if known for music and named like the artist', () => {
    const res = { results: [{ id: 1, name: 'Jonny Greenwood', known_for_department: 'Acting' }, { id: 13, name: 'Jonny Greenwood', known_for_department: 'Sound' }] };
    expect(pickComposer(res, { key: 'jonny greenwood' })).toEqual({ id: 13, name: 'Jonny Greenwood' });
    expect(pickComposer({ results: [{ id: 2, name: 'Phoenix Jones', known_for_department: 'Sound' }] }, { key: 'phoenix' })).toBeNull();
    expect(pickComposer(null, { key: 'x' })).toBeNull();
  });

  it('turns composer credits into candidates, best known first, without duplicates', () => {
    const credits = {
      crew: [
        { id: 400617, title: 'Phantom Thread', job: 'Original Music Composer', vote_count: 4000, genre_ids: [18], release_date: '2017-12-25' },
        { id: 400617, title: 'Phantom Thread', job: 'Music', vote_count: 4000 },
        { id: 7345, title: 'There Will Be Blood', job: 'Original Music Composer', vote_count: 7000, genre_ids: [18] },
        { id: 1, title: 'Obscure short', job: 'Original Music Composer', vote_count: 2 },
        { id: 2, title: 'Edited it', job: 'Editor', vote_count: 900 },
      ],
    };
    const list = composerCandidates(credits, 'movie', JG);
    expect(list.map((c) => [c.tmdb_id, c.sources])).toEqual([
      [7345, ['score:13']],
      [400617, ['score:13']],
    ]);
  });

  it('ranks such titles higher and says why', () => {
    const ctx = {
      weights: { movie: {}, tv: {} },
      excluded: new Set<string>(),
      becauseTitles: new Map(),
      providerNames: [],
      genreNames: { movie: {}, tv: {} },
      today: '2026-10-14',
      composers: new Map([['score:13', { name: 'Jonny Greenwood', plays: 1312 }]]),
    };
    const base = { media_type: 'movie' as const, poster_path: null, release_date: '2017-12-25', vote_average: 7.3, vote_count: 4000, genre_ids: [18] };
    const ranked = rankCandidates(
      [
        { ...base, tmdb_id: 1, title: 'Other', sources: ['discover'] },
        { ...base, tmdb_id: 400617, title: 'Phantom Thread', sources: ['score:13'] },
      ],
      ctx,
    );
    expect(ranked[0]).toMatchObject({ reason: 'Soundtrack von Jonny Greenwood – 1’312 Plays bei dir', composer: { name: 'Jonny Greenwood' } });
    expect(ranked[0].score - ranked[1].score).toBe(14);
    expect(ranked[1].composer).toBeNull();
    expect(scoreReason({ name: 'X', plays: null })).toBe('Soundtrack von X – läuft bei dir oft');
  });
});

describe('Score Bridge: details and favourite films → music', () => {
  it('reads composers from movie credits and TV aggregate credits', () => {
    expect(normalizeComposers({ credits: { crew: [{ id: 13, name: 'Jonny Greenwood', job: 'Original Music Composer' }, { id: 5, name: 'PTA', job: 'Director' }] } }, 'movie')).toEqual([
      { id: 13, name: 'Jonny Greenwood' },
    ]);
    expect(normalizeComposers({ aggregate_credits: { crew: [{ id: 9, name: 'Theodore Shapiro', jobs: [{ job: 'Original Music Composer' }] }] } }, 'tv')).toEqual([
      { id: 9, name: 'Theodore Shapiro' },
    ]);
    const d = normalizeDetails({ id: 1, title: 'X', credits: { crew: [{ id: 13, name: 'Jonny Greenwood', job: 'Music' }] } }, 'movie');
    expect(d.composers).toEqual([{ id: 13, name: 'Jonny Greenwood' }]);
    expect(d.crew).toContainEqual({ job: 'Musik', names: ['Jonny Greenwood'] });
  });

  it('matches composers with the artists I listen to', () => {
    const artists = [{ artist_key: 'jonny greenwood', name: 'Jonny Greenwood', playcount: 312 }];
    expect(listenedComposers([{ id: 13, name: 'Jonny Greenwood' }, { id: 1, name: 'Hans Zimmer' }], artists)).toEqual([{ name: 'Jonny Greenwood', plays: 312 }]);
    expect(listenedComposers(undefined, artists)).toEqual([]);
  });

  it('picks one composer per name, from the best rated films first', () => {
    const film = (title: string, rating: number, composers: string[]) => ({ media_type: 'movie' as const, tmdb_id: rating, title, my_rating: rating, composers: composers.map((name, id) => ({ id, name })) });
    const picks = composersToDiscover([film('Arrival', 9, ['Jóhann Jóhannsson']), film('Phantom Thread', 10, ['Jonny Greenwood', 'Jóhann Jóhannsson'])], new Set(['jonny greenwood']));
    expect(picks.map((p) => [p.name, p.film.title, p.known])).toEqual([
      ['Jonny Greenwood', 'Phantom Thread', true],
      ['Jóhann Jóhannsson', 'Phantom Thread', false],
    ]);
  });

  it('prefers the soundtrack of the film among the top albums', () => {
    const json = {
      topalbums: {
        album: [
          { name: 'Junun', mbid: '', url: 'https://www.last.fm/music/Jonny+Greenwood/Junun', image: [{ '#text': 'https://lastfm.freetls.fastly.net/s.png' }, { '#text': 'https://lastfm.freetls.fastly.net/l.png' }] },
          { name: 'Phantom Thread (Original Motion Picture Soundtrack)', mbid: '0383dadf-2a4e-4d10-a46a-e9e041da8eb3', image: [] },
          { name: '(null)' },
        ],
      },
    };
    expect(pickComposerAlbums(json, 'Jonny Greenwood', 'Phantom Thread')).toEqual([
      { key: '0383dadf-2a4e-4d10-a46a-e9e041da8eb3', title: 'Phantom Thread (Original Motion Picture Soundtrack)', artist: 'Jonny Greenwood', image_url: null, url: null },
      { key: 'lfm:jonny greenwood|junun', title: 'Junun', artist: 'Jonny Greenwood', image_url: 'https://lastfm.freetls.fastly.net/l.png', url: 'https://www.last.fm/music/Jonny+Greenwood/Junun' },
    ]);
    expect(pickComposerAlbums(null, 'X', 'Y')).toEqual([]);
  });
});
