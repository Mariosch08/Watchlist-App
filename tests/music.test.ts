import { describe, expect, it, vi } from 'vitest';
import { decryptText, deriveKey, encryptText } from '../supabase/functions/_shared/crypto.ts';
import {
  type Artist,
  artistKey,
  lastfmGet,
  lastfmSimilar,
  lastfmTopArtists,
  mergeArtists,
  mergeSimilar,
  musicBrainzClient,
  normalizeEvents,
  normalizeReleaseGroups,
  rankAlbums,
  releaseQuery,
  spotifyAlbums,
  spotifyArtists,
} from '../supabase/functions/_shared/music.ts';

const RH = '0383dadf-2a4e-4d10-a46a-e9e041da8eb3';
const PJ = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';
const MBX = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';

const artist = (name: string, rank: number, extra: Partial<Artist> = {}): Artist => ({
  key: artistKey(name),
  name,
  mbid: null,
  spotify_id: null,
  sources: ['lastfm'],
  rank,
  playcount: null,
  followed: false,
  image_url: null,
  genres: [],
  ...extra,
});

const rg = (id: string, title: string, artistName: string, artistId: string, date: string, extra: Record<string, unknown> = {}) => ({
  id,
  title,
  'primary-type': 'Album',
  'secondary-types': [],
  'first-release-date': date,
  'artist-credit': [{ name: artistName, artist: { id: artistId, name: artistName } }],
  tags: [{ name: 'Alternative Rock', count: 5 }, { name: 'electronic', count: 2 }],
  ...extra,
});

describe('artistKey', () => {
  it('ignores case, accents, punctuation and "&"', () => {
    expect(artistKey('Beyoncé')).toBe(artistKey('BEYONCE '));
    expect(artistKey('Simon & Garfunkel')).toBe(artistKey('simon and garfunkel'));
    expect(artistKey('AC/DC')).toBe('ac dc');
  });
});

describe('Last.fm', () => {
  it('parses top artists and similar artists defensively', () => {
    const top = lastfmTopArtists({ topartists: { artist: [{ name: 'Radiohead', mbid: RH, playcount: '120', '@attr': { rank: '1' } }, { name: 'Portishead', mbid: '' }, { name: '' }] } });
    expect(top.map((a) => [a.name, a.mbid, a.rank])).toEqual([
      ['Radiohead', RH, 1],
      ['Portishead', null, 2],
    ]);
    expect(lastfmTopArtists({ topartists: { artist: { name: 'Solo' } } })).toHaveLength(1);
    expect(lastfmTopArtists(null)).toEqual([]);
    const similar = lastfmSimilar({ similarartists: { artist: [{ name: 'Thom Yorke', match: '0.9', mbid: PJ }, { name: 'Muse', match: 'x' }] } }, 'Radiohead');
    expect(similar).toEqual([
      { key: 'thom yorke', name: 'Thom Yorke', mbid: PJ, match: 0.9, because: 'Radiohead' },
      { key: 'muse', name: 'Muse', mbid: null, match: 0, because: 'Radiohead' },
    ]);
  });

  it('keeps the best match and drops artists I already know', () => {
    const merged = mergeSimilar(
      [
        [{ key: 'muse', name: 'Muse', mbid: null, match: 0.4, because: 'Radiohead' }],
        [
          { key: 'muse', name: 'Muse', mbid: null, match: 0.7, because: 'Coldplay' },
          { key: 'radiohead', name: 'Radiohead', mbid: null, match: 1, because: 'Coldplay' },
        ],
      ],
      new Set(['radiohead']),
    );
    expect(merged).toEqual([{ key: 'muse', name: 'Muse', mbid: null, match: 0.7, because: 'Coldplay' }]);
  });

  it('maps "user not found" to a clear code and sends the API key only to Last.fm', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 6, message: 'User not found' }), { status: 404 }));
    await expect(lastfmGet('user.gettopartists', { user: 'nobody' }, 'KEY', fetchImpl)).rejects.toMatchObject({ code: 'LASTFM_USER_NOT_FOUND', status: 404 });
    const url = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(url.origin).toBe('https://ws.audioscrobbler.com');
    expect(url.searchParams.get('user')).toBe('nobody');
    expect(url.searchParams.get('api_key')).toBe('KEY');
  });
});

describe('MusicBrainz', () => {
  it('builds one query for many artists', () => {
    expect(releaseQuery([RH, PJ], '2026-09-12', '2026-10-12')).toBe(
      `(arid:${RH} OR arid:${PJ}) AND firstreleasedate:[2026-09-12 TO 2026-10-12] AND (primarytype:album OR primarytype:ep)`,
    );
  });

  it('waits at least the gap between requests and sends a User-Agent', async () => {
    let t = 0;
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
      t += ms;
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ 'release-groups': [] })));
    const mb = musicBrainzClient(fetchImpl, sleep, () => t, 1000);
    await Promise.all([mb('a'), mb('b'), mb('c')]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 1000]);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'User-Agent': expect.stringContaining('WatchlistApp') });
  });

  it('retries once on 503 and then gives up with a code', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }));
    const mb = musicBrainzClient(fetchImpl, async () => {}, () => 0, 0);
    await expect(mb('x')).rejects.toMatchObject({ code: 'MUSICBRAINZ_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('keeps recent studio albums and EPs, skips live, compilations and vague dates', () => {
    const albums = normalizeReleaseGroups(
      {
        'release-groups': [
          rg('11111111-1111-4111-8111-111111111111', 'New Album', 'Radiohead', RH, '2026-10-01'),
          rg('22222222-2222-4222-8222-222222222222', 'Live at X', 'Radiohead', RH, '2026-10-02', { 'secondary-types': ['Live'] }),
          rg('33333333-3333-4333-8333-333333333333', 'Old', 'Radiohead', RH, '2025-01-01'),
          rg('44444444-4444-4444-8444-444444444444', 'Year only', 'Radiohead', RH, '2026'),
          rg('55555555-5555-4555-8555-555555555555', 'Small', 'Radiohead', RH, '2026-10-05', { 'primary-type': 'EP' }),
          rg('66666666-6666-4666-8666-666666666666', 'Single', 'Radiohead', RH, '2026-10-05', { 'primary-type': 'Single' }),
        ],
      },
      '2026-09-12',
    );
    expect(albums.map((a) => [a.title, a.kind])).toEqual([
      ['New Album', 'Album'],
      ['Small', 'EP'],
    ]);
    expect(albums[0]).toMatchObject({
      artist_key: 'radiohead',
      artist_mbid: RH,
      tags: ['alternative rock', 'electronic'],
      image_url: 'https://coverartarchive.org/release-group/11111111-1111-4111-8111-111111111111/front-250',
      spotify_url: 'https://open.spotify.com/search/Radiohead%20New%20Album',
    });
  });
});

describe('Spotify', () => {
  it('parses top and followed artists and recent releases', () => {
    const top = spotifyArtists({ items: [{ id: 'abc123', name: 'Radiohead', genres: ['Art Rock'], images: [{ url: 'https://i/1', width: 640 }, { url: 'https://i/2', width: 160 }] }, { id: 'bad id!', name: 'X' }] });
    expect(top).toEqual([expect.objectContaining({ spotify_id: 'abc123', image_url: 'https://i/2', genres: ['art rock'], sources: ['spotify'] })]);
    expect(spotifyArtists({ artists: { items: [{ id: 'f1', name: 'Muse' }] } }, { followed: true })[0].followed).toBe(true);

    const albums = spotifyAlbums(
      {
        items: [
          { id: 'al1', name: 'Fresh', album_type: 'album', release_date: '2026-10-03', release_date_precision: 'day', external_urls: { spotify: 'https://open.spotify.com/album/al1' }, artists: [{ name: 'Radiohead' }] },
          { id: 'al2', name: 'Four tracks', album_type: 'single', total_tracks: 4, release_date: '2026-10-04', release_date_precision: 'day', artists: [{ name: 'Radiohead' }] },
          { id: 'al3', name: 'Old', album_type: 'album', release_date: '2020-01-01', release_date_precision: 'day' },
          { id: 'al4', name: 'Month', album_type: 'album', release_date: '2026-10', release_date_precision: 'month' },
          { id: 'al5', name: 'Hits', album_type: 'compilation', release_date: '2026-10-04', release_date_precision: 'day' },
        ],
      },
      top[0],
      '2026-09-12',
    );
    expect(albums.map((a) => [a.key, a.kind, a.tags])).toEqual([
      ['sp:al1', 'Album', ['art rock']],
      ['sp:al2', 'EP', ['art rock']],
    ]);
  });

  it('merges the same artist from Last.fm and Spotify', () => {
    const merged = mergeArtists([
      [artist('Radiohead', 1, { mbid: RH }), artist('Muse', 2)],
      [artist('radiohead', 3, { sources: ['spotify'], spotify_id: 'abc', genres: ['art rock'] }), artist('Björk', 1, { sources: ['spotify'], followed: true })],
    ]);
    expect(merged.map((a) => [a.name, a.rank])).toEqual([
      ['Radiohead', 1],
      ['Björk', 2],
      ['Muse', 3],
    ]);
    expect(merged[0]).toMatchObject({ mbid: RH, spotify_id: 'abc', sources: ['lastfm', 'spotify'], genres: ['art rock'] });
  });
});

describe('rankAlbums', () => {
  const today = '2026-10-12';
  const album = (key: string, title: string, artistName: string, date: string, extra = {}) => ({
    key,
    title,
    artist: artistName,
    artist_key: artistKey(artistName),
    artist_mbid: null,
    kind: 'Album' as const,
    release_date: date,
    image_url: null,
    tags: [],
    spotify_url: null,
    source: 'musicbrainz' as const,
    ...extra,
  });
  const ctx = {
    artists: [artist('Radiohead', 1), artist('Muse', 10)],
    similar: [{ key: 'thom yorke', name: 'Thom Yorke', mbid: MBX, match: 0.9, because: 'Radiohead' }],
    weights: {},
    excluded: new Set<string>(),
    today,
  };

  it('prefers my top artists, explains why and links similar artists by MBID', () => {
    const ranked = rankAlbums(
      [
        album('a', 'Muse Album', 'Muse', '2026-09-20'),
        album('b', 'Solo', 'Thom Yorke feat. X', '2026-10-10', { artist_key: 'thom yorke x', artist_mbid: MBX }),
        album('c', 'Radiohead Album', 'Radiohead', '2026-10-08'),
        album('d', 'Unknown', 'Nobody', '2026-10-10'),
        album('e', 'Future', 'Radiohead', '2026-12-01'),
      ],
      ctx,
    );
    expect(ranked.map((r) => r.album.key)).toEqual(['c', 'a', 'b']);
    expect(ranked[0]).toMatchObject({ reason: 'Neues Album von Radiohead – du hörst Radiohead oft', fresh: true, own: true, rank: 1 });
    expect(ranked[2].reason).toBe('Weil du Radiohead hörst – ähnlicher Sound');
  });

  it('merges MusicBrainz and Spotify copies, honours rejections and limits per artist', () => {
    const ranked = rankAlbums(
      [
        album('mb1', 'OK Computer (Deluxe Edition)', 'Radiohead', '2026-10-08', { tags: ['rock'] }),
        album('sp:1', 'OK Computer', 'Radiohead', '2026-10-08', { source: 'spotify', spotify_url: 'https://open.spotify.com/album/1', image_url: 'https://i/cover' }),
        album('mb2', 'Second', 'Radiohead', '2026-10-02'),
        album('mb3', 'Third', 'Radiohead', '2026-10-03'),
        album('mb4', 'Rejected', 'Muse', '2026-10-03'),
      ],
      { ...ctx, excluded: new Set(['mb4']) },
    );
    expect(ranked).toHaveLength(2);
    const ok = ranked.find((r) => r.album.title.startsWith('OK Computer'));
    expect(ok?.album).toMatchObject({ key: 'mb1', spotify_url: 'https://open.spotify.com/album/1', image_url: 'https://i/cover', tags: ['rock'] });
    expect(ranked.some((r) => r.album.key === 'mb4')).toBe(false);
  });

  it('uses 👍/👎 tag weights', () => {
    const liked = rankAlbums([album('x', 'X', 'Muse', '2026-09-20', { tags: ['jazz'] })], { ...ctx, weights: { jazz: 1 } })[0].score;
    const disliked = rankAlbums([album('x', 'X', 'Muse', '2026-09-20', { tags: ['jazz'] })], { ...ctx, weights: { jazz: -1 } })[0].score;
    expect(liked - disliked).toBe(30);
  });
});

describe('Ticketmaster', () => {
  it('only keeps events where the artist performs', () => {
    const ev = (id: string, performer: string, extra = {}) => ({
      id,
      name: `${performer} Live`,
      url: 'https://www.ticketmaster.ch/event/1',
      dates: { start: { localDate: '2027-03-01', dateTime: '2027-03-01T19:00:00Z' }, status: { code: 'onsale' } },
      _embedded: { venues: [{ name: 'Hallenstadion', city: { name: 'Zürich' } }], attractions: [{ name: performer }] },
      ...extra,
    });
    const concerts = normalizeEvents(
      {
        _embedded: {
          events: [
            ev('1', 'Radiohead'),
            ev('2', 'Radiohead Tribute Band'),
            ev('3', 'Radiohead', { dates: { start: { localDate: '2027-03-02' }, status: { code: 'cancelled' } } }),
          ],
        },
      },
      artist('Radiohead', 1),
    );
    expect(concerts).toEqual([
      expect.objectContaining({ event_id: '1', artist: 'Radiohead', venue: 'Hallenstadion', city: 'Zürich', local_date: '2027-03-01', starts_at: '2027-03-01T19:00:00Z' }),
    ]);
    expect(normalizeEvents(null, artist('X', 1))).toEqual([]);
  });
});

describe('token encryption', () => {
  it('round-trips, uses a fresh IV and rejects tampering or another key', async () => {
    const key = await deriveKey('a-long-enough-secret-value');
    const a = await encryptText('refresh-token', key);
    const b = await encryptText('refresh-token', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token');
    expect(await decryptText(a, key)).toBe('refresh-token');
    const [v, iv, data] = a.split('.');
    const flipped = `${v}.${iv}.${data.slice(0, -4)}${data.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
    await expect(decryptText(flipped, key)).rejects.toThrow();
    await expect(decryptText(a, await deriveKey('another-long-secret-value'))).rejects.toThrow();
    await expect(deriveKey('short')).rejects.toThrow();
  });
});
