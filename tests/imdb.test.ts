import { describe, expect, it } from 'vitest';
import { buildImdbCsv, mergeImportRow, parseDate, parseImdbExport, pickFindResult } from '../supabase/functions/_shared/imdb.ts';
import { parseCsv } from '../supabase/functions/_shared/csv.ts';

const RATINGS = `Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors
tt0133093,9,2023-05-01,The Matrix,The Matrix,https://www.imdb.com/title/tt0133093/,Movie,8.7,136,1999,"Action, Sci-Fi",2000000,1999-03-31,"Lana Wachowski, Lilly Wachowski"
tt0944947,8,2022-01-10,Game of Thrones,Game of Thrones,https://www.imdb.com/title/tt0944947/,TV Series,9.2,57,2011,Drama,2200000,2011-04-17,
tt1480055,7,2022-01-11,Winter Is Coming,Winter Is Coming,https://www.imdb.com/title/tt1480055/,TV Episode,8.9,62,2011,Drama,50000,2011-04-17,Tim Van Patten
tt0133093,6,2020-01-01,The Matrix,The Matrix,,Movie,8.7,136,1999,,,,
`;

const WATCHLIST = `Position,Const,Created,Modified,Description,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors,Your Rating,Date Rated
1,tt1160419,2024-01-01,2024-01-01,,Dune,Dune,https://www.imdb.com/title/tt1160419/,Movie,8.0,155,2021,Sci-Fi,800000,2021-09-15,Denis Villeneuve,,
2,tt0475784,2024-01-02,2024-01-02,,Westworld,Westworld,,TV Series,8.5,62,2016,Drama,500000,2016-10-02,,,
`;

describe('parseImdbExport', () => {
  it('detects ratings exports, skips episodes and keeps the newest duplicate', () => {
    const p = parseImdbExport(RATINGS, 'ratings.csv');
    expect(p.kind).toBe('imdb_ratings');
    expect(p.rows.map((r) => [r.imdb_id, r.rating, r.title_type])).toEqual([
      ['tt0133093', 9, 'movie'],
      ['tt0944947', 8, 'tvseries'],
    ]);
    expect(p.rows[0]).toMatchObject({ rated_at: '2023-05-01', runtime: 136, year: 1999 });
    expect(p.skipped).toEqual([{ imdb_id: 'tt1480055', title: 'Winter Is Coming', reason: 'unsupported_type' }]);
  });

  it('detects watchlist and list exports', () => {
    expect(parseImdbExport(WATCHLIST, 'WATCHLIST.csv').kind).toBe('imdb_watchlist');
    const list = parseImdbExport(WATCHLIST, 'my-favourites.csv');
    expect(list.kind).toBe('imdb_list');
    expect(list.rows.every((r) => r.rating === null)).toBe(true);
  });

  it('is tolerant: semicolons, lowercase headers, missing columns', () => {
    const p = parseImdbExport('const;your rating;title\ntt0133093;10;Matrix\nnot-an-id;5;x\n');
    expect(p.rows).toEqual([expect.objectContaining({ imdb_id: 'tt0133093', rating: 10, rated_at: null, runtime: null })]);
    expect(p.skipped[0].reason).toBe('invalid_id');
  });

  it('ignores invalid ratings and rejects non-IMDb files', () => {
    expect(parseImdbExport('Const,Your Rating\ntt0133093,0\n').rows[0].rating).toBeNull();
    expect(parseImdbExport('Const,Your Rating\ntt0133093,11\n').rows[0].rating).toBeNull();
    expect(() => parseImdbExport('Name,Artist\nfoo,bar\n')).toThrow('NOT_IMDB_CSV');
  });

  it('parses date formats', () => {
    expect(parseDate('2023-05-01')).toBe('2023-05-01');
    expect(parseDate('1.5.2023')).toBe('2023-05-01');
    expect(parseDate('')).toBeNull();
    expect(parseDate('nonsense')).toBeNull();
  });
});

describe('pickFindResult', () => {
  const find = { movie_results: [{ id: 1, title: 'M' }], tv_results: [{ id: 2, name: 'S' }] };
  it('prefers series for series types and movies otherwise', () => {
    expect(pickFindResult(find, 'tvseries')).toMatchObject({ media_type: 'tv' });
    expect(pickFindResult(find, 'tvminiseries')).toMatchObject({ media_type: 'tv' });
    expect(pickFindResult(find, 'movie')).toMatchObject({ media_type: 'movie' });
    expect(pickFindResult({ movie_results: [], tv_results: [{ id: 2 }] }, 'movie')).toMatchObject({ media_type: 'tv' });
    expect(pickFindResult({ movie_results: [], tv_results: [] }, 'movie')).toBeNull();
  });
});

describe('mergeImportRow', () => {
  const row = { imdb_id: 'tt0133093', title: 'Matrix', title_type: 'movie', year: 1999, rating: 9, rated_at: '2023-05-01', runtime: 136 };
  const plain = { ...row, rating: null, rated_at: null };
  const existing = (over = {}) => ({ status: 'planned', my_rating: null, rated_at: null, imdb_id: null, runtime: null, ...over });

  it('inserts rated titles as completed and watchlist titles as planned', () => {
    expect(mergeImportRow(row, null, false)).toEqual({
      action: 'insert',
      values: { imdb_id: 'tt0133093', status: 'completed', my_rating: 9, rated_at: '2023-05-01', watched_at: '2023-05-01', runtime: 136, source: 'imdb' },
    });
    expect(mergeImportRow(plain, null, false)).toMatchObject({ action: 'insert', values: { status: 'planned', my_rating: null } });
  });

  it('never re-creates deleted titles (tombstones)', () => {
    expect(mergeImportRow(row, null, true)).toEqual({ action: 'skip', reason: 'tombstoned' });
  });

  it('overwrites ratings only when newer', () => {
    const older = existing({ status: 'completed', my_rating: 7, rated_at: '2024-01-01T10:00:00Z', imdb_id: 'tt0133093', runtime: 136 });
    expect(mergeImportRow(row, older, false)).toEqual({ action: 'skip', reason: 'unchanged' });
    const newer = existing({ status: 'completed', my_rating: 7, rated_at: '2020-01-01T10:00:00Z', imdb_id: 'tt0133093', runtime: 136 });
    expect(mergeImportRow(row, newer, false)).toEqual({ action: 'update', values: { my_rating: 9, rated_at: '2023-05-01' } });
  });

  it('marks a planned entry as completed when the import has a rating, fills missing ids', () => {
    expect(mergeImportRow(row, existing(), false)).toEqual({
      action: 'update',
      values: { imdb_id: 'tt0133093', runtime: 136, my_rating: 9, rated_at: '2023-05-01', status: 'completed', watched_at: '2023-05-01' },
    });
  });

  it('does not touch status/rating for plain watchlist rows of existing entries', () => {
    expect(mergeImportRow(plain, existing({ status: 'watching', imdb_id: 'tt0133093', runtime: 136 }), false)).toEqual({
      action: 'skip',
      reason: 'unchanged',
    });
  });

  it('is idempotent: applying the result again changes nothing', () => {
    const first = mergeImportRow(row, null, false);
    const after = existing({ ...(first as any).values });
    expect(mergeImportRow(row, after, false)).toEqual({ action: 'skip', reason: 'unchanged' });
  });
});

describe('buildImdbCsv', () => {
  it('writes IMDb-compatible columns and skips entries without IMDb id', () => {
    const csv = buildImdbCsv([
      { imdb_id: 'tt0133093', title: 'Matrix, The', media_type: 'movie', release_date: '1999-03-31', my_rating: 9, rated_at: '2023-05-01T08:00:00Z' },
      { imdb_id: 'tt0944947', title: 'Game of Thrones', media_type: 'tv', release_date: '2011-04-17', my_rating: null, rated_at: null },
      { imdb_id: null, title: 'Unknown', media_type: 'movie', release_date: null, my_rating: 5, rated_at: null },
    ]);
    expect(parseCsv(csv)).toEqual([
      ['Const', 'Your Rating', 'Date Rated', 'Title', 'URL', 'Title Type', 'Year'],
      ['tt0133093', '9', '2023-05-01', 'Matrix, The', 'https://www.imdb.com/title/tt0133093/', 'Movie', '1999'],
      ['tt0944947', '', '', 'Game of Thrones', 'https://www.imdb.com/title/tt0944947/', 'TV Series', '2011'],
    ]);
  });

  it('can be re-imported by our own parser', () => {
    const csv = buildImdbCsv([{ imdb_id: 'tt0133093', title: 'Matrix', media_type: 'movie', release_date: '1999-03-31', my_rating: 9, rated_at: '2023-05-01' }]);
    expect(parseImdbExport(csv).rows[0]).toMatchObject({ imdb_id: 'tt0133093', rating: 9, rated_at: '2023-05-01' });
  });
});
