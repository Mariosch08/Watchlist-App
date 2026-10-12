import { describe, expect, it } from 'vitest';
import { parseShared } from '../src/lib/share.js';

describe('parseShared', () => {
  it('reads IMDb, TMDb and Letterboxd links', () => {
    expect(parseShared({ url: 'https://m.imdb.com/title/tt0133093/?ref_=x' })).toEqual({ kind: 'imdb', imdbId: 'tt0133093' });
    expect(parseShared({ text: 'Look: https://www.imdb.com/de/title/tt1160419/' })).toEqual({ kind: 'imdb', imdbId: 'tt1160419' });
    expect(parseShared({ url: 'https://www.themoviedb.org/tv/1399-game-of-thrones' })).toEqual({ kind: 'tmdb', media_type: 'tv', tmdb_id: 1399 });
    expect(parseShared({ url: 'https://letterboxd.com/film/the-thing-1982/' })).toEqual({ kind: 'query', query: 'the thing' });
    expect(parseShared({ url: 'https://letterboxd.com/mario/film/heat/' })).toEqual({ kind: 'query', query: 'heat' });
  });

  it('finds the title in shared texts (Netflix & co.)', () => {
    expect(parseShared({ text: 'Schau dir „Dark“ auf Netflix an: https://www.netflix.com/title/80100172' })).toEqual({ kind: 'query', query: 'Dark' });
    expect(parseShared({ text: 'Watch "The Bear" on Disney+ https://disneyplus.com/x' })).toEqual({ kind: 'query', query: 'The Bear' });
    expect(parseShared({ title: 'Severance', text: 'https://tv.apple.com/show/severance' })).toEqual({ kind: 'query', query: 'Severance' });
    expect(parseShared({ text: 'https://example.com' })).toEqual({ kind: 'none' });
  });
});
