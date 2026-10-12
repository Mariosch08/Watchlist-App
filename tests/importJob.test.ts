import { describe, expect, it, vi } from 'vitest';
import { parseImdbExport } from '../supabase/functions/_shared/imdb.ts';
import { ImportDeps, MatchedTitle, processBatch } from '../supabase/functions/_shared/importJob.ts';

// In-memory fake of the user's watchlist + TMDb mapping.
function fakeDeps(mapping: Record<string, MatchedTitle | null>, tombstones: string[] = []) {
  const store = new Map<string, any>();
  const deps: ImportDeps = {
    lookup: vi.fn(async (row) => mapping[row.imdb_id] ?? null),
    getExisting: async (m, id) => store.get(`${m}:${id}`) ?? null,
    isTombstoned: async (m, id) => tombstones.includes(`${m}:${id}`),
    insert: async (t, values) => {
      store.set(`${t.media_type}:${t.tmdb_id}`, { status: 'planned', my_rating: null, rated_at: null, imdb_id: null, runtime: null, title: t.title, ...values });
    },
    update: async (m, id, values) => {
      store.set(`${m}:${id}`, { ...store.get(`${m}:${id}`), ...values });
    },
  };
  return { deps, store };
}

const title = (media_type: 'movie' | 'tv', tmdb_id: number, name: string): MatchedTitle => ({
  media_type, tmdb_id, title: name, original_title: name, poster_path: null, release_date: null, vote_average: 8,
});

const CSV = `Const,Your Rating,Date Rated,Title,Title Type,Year
tt0133093,9,2023-05-01,The Matrix,Movie,1999
tt0944947,8,2022-01-10,Game of Thrones,TV Series,2011
tt9999999,7,2022-01-10,Obscure,Movie,2001
tt0000001,6,2022-01-10,Deleted,Movie,1990
`;

describe('processBatch', () => {
  const mapping = {
    tt0133093: title('movie', 603, 'Matrix'),
    tt0944947: title('tv', 1399, 'Game of Thrones'),
    tt0000001: title('movie', 1, 'Deleted'),
  };

  it('imports, reports not found titles and respects tombstones', async () => {
    const { deps, store } = fakeDeps(mapping, ['movie:1']);
    const res = await processBatch(parseImdbExport(CSV).rows, deps);
    expect(res).toMatchObject({ processed: 4, imported: 2, updated: 0, skipped: 1 });
    expect(res.not_found.map((r) => r.imdb_id)).toEqual(['tt9999999']);
    expect(store.get('movie:603')).toMatchObject({ status: 'completed', my_rating: 9, source: 'imdb', imdb_id: 'tt0133093' });
    expect(store.get('tv:1399')).toMatchObject({ status: 'completed', my_rating: 8 });
    expect(store.has('movie:1')).toBe(false);
  });

  it('is idempotent: a second run imports nothing new', async () => {
    const { deps, store } = fakeDeps(mapping);
    const rows = parseImdbExport(CSV).rows;
    await processBatch(rows, deps);
    const snapshot = JSON.stringify([...store]);
    const again = await processBatch(rows, deps);
    expect(again).toMatchObject({ imported: 0, updated: 0, skipped: 3 });
    expect(JSON.stringify([...store])).toBe(snapshot);
  });

  it('looks up every row once', async () => {
    const { deps } = fakeDeps(mapping);
    await processBatch(parseImdbExport(CSV).rows, deps);
    expect(deps.lookup).toHaveBeenCalledTimes(4);
  });
});
