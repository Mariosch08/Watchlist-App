import { describe, expect, it, vi } from 'vitest';
import { decryptText, deriveKey, encryptText } from '../supabase/functions/_shared/crypto.ts';
import {
  affinityOf,
  type Artist,
  artistKey,
  blankArtist,
  lastfmArtistInfo,
  lastfmGet,
  lastfmLovedArtists,
  lastfmSimilar,
  lastfmTopArtists,
  mergeArtists,
  mergeSimilar,
  musicBrainzClient,
  nicheOf,
  normalizeEvents,
  normalizeReleaseGroups,
  notifyWorthy,
  pickConcertArtists,
  pickSeeds,
  rankAlbums,
  releaseQuery,
  spotifyAlbums,
  spotifyArtists,
  statsfmGet,
  statsfmStreamStats,
  statsfmTopArtists,
  trendOf,
  weighList,
} from '../supabase/functions/_shared/music.ts';

const RH = '0383dadf-2a4e-4d10-a46a-e9e041da8eb3';
const PJ = '8f6bd1e4-fbe1-4f50-aa9b-94c450ec0f11';
const MBX = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';

const artist = (name: string, rank: number, extra: Partial<Artist> = {}): Artist => ({ ...blankArtist(name, 'lastfm', rank), ...extra });

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
    const similar = lastfmSimilar({ similarartists: { artist: [{ name: 'Thom Yorke', match: '0.9', mbid: PJ }, { name: 'Muse', match: 'x' }] } });
    expect(similar).toEqual([
      { key: 'thom yorke', name: 'Thom Yorke', mbid: PJ, match: 0.9 },
      { key: 'muse', name: 'Muse', mbid: null, match: 0 },
    ]);
    expect(lastfmSimilar(null)).toEqual([]);
  });

  it('counts loved tracks per artist', () => {
    const loved = lastfmLovedArtists({
      lovedtracks: { track: [{ artist: { name: 'Radiohead', mbid: RH } }, { artist: { name: 'radiohead' } }, { artist: { '#text': 'Björk' } }, { artist: {} }] },
    });
    expect(loved.map((a) => [a.key, a.loved, a.mbid])).toEqual([
      ['radiohead', 2, RH],
      ['bjork', 1, null],
    ]);
  });

  it('reads id, size and genre tags of an artist, without noise tags', () => {
    expect(
      lastfmArtistInfo({ artist: { mbid: RH, stats: { listeners: '5123456' }, tags: { tag: [{ name: 'Seen live' }, { name: 'Alternative' }, { name: 'rock' }, { name: 'britpop' }, { name: 'x' }] } } }),
    ).toEqual({ mbid: RH, listeners: 5123456, tags: ['alternative', 'rock', 'britpop'] });
    expect(lastfmArtistInfo(null)).toEqual({ mbid: null, listeners: null, tags: [] });
  });

  it('adds up evidence from several seeds and explains with the strongest ones', () => {
    const hit = (name: string, match: number) => ({ key: artistKey(name), name, mbid: null, match });
    const merged = mergeSimilar(
      [
        { seed: { name: 'Radiohead', affinity: 1 }, similar: [hit('Muse', 0.4), hit('Portishead', 0.9)] },
        { seed: { name: 'Coldplay', affinity: 0.5 }, similar: [hit('Muse', 0.7), hit('Radiohead', 1)] },
        { seed: { name: 'Keane', affinity: 0.4 }, similar: [hit('Muse', 0.5)] },
      ],
      new Set(['radiohead']),
    );
    expect(merged.map((s) => [s.name, s.because])).toEqual([
      ['Muse', ['Radiohead', 'Coldplay']],
      ['Portishead', ['Radiohead']],
    ]);
    // Muse: 0.4 + 0.35 + 0.2 = 0.95 → 1 - e^-1.9; Portishead: 0.9 → 1 - e^-1.8
    expect(merged[0].match).toBeCloseTo(1 - Math.exp(-1.9), 3);
    expect(merged[1].match).toBeCloseTo(1 - Math.exp(-1.8), 3);
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
      `(arid:${RH} OR arid:${PJ}) AND firstreleasedate:[2026-09-12 TO 2026-10-12] AND (primarytype:album OR primarytype:ep OR primarytype:single)`,
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
    await Promise.all([mb('a'), mb('b'), mb('c', 100)]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 1000]);
    expect(fetchImpl.mock.calls[0][0]).not.toContain('offset');
    expect(fetchImpl.mock.calls[2][0]).toContain('&offset=100&');
    expect((fetchImpl.mock.calls[0][1] as RequestInit).headers).toMatchObject({ 'User-Agent': expect.stringContaining('WatchlistApp') });
  });

  it('retries once on 503 and then gives up with a code', async () => {
    const fetchImpl = vi.fn(async () => new Response('busy', { status: 503 }));
    const mb = musicBrainzClient(fetchImpl, async () => {}, () => 0, 0);
    await expect(mb('x')).rejects.toMatchObject({ code: 'MUSICBRAINZ_UNAVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('keeps recent studio albums, EPs and singles, skips live, compilations and vague dates', () => {
    const albums = normalizeReleaseGroups(
      {
        'release-groups': [
          rg('11111111-1111-4111-8111-111111111111', 'New Album', 'Radiohead', RH, '2026-10-01'),
          rg('22222222-2222-4222-8222-222222222222', 'Live at X', 'Radiohead', RH, '2026-10-02', { 'secondary-types': ['Live'] }),
          rg('33333333-3333-4333-8333-333333333333', 'Old', 'Radiohead', RH, '2025-01-01'),
          rg('44444444-4444-4444-8444-444444444444', 'Year only', 'Radiohead', RH, '2026'),
          rg('55555555-5555-4555-8555-555555555555', 'Small', 'Radiohead', RH, '2026-10-05', { 'primary-type': 'EP' }),
          rg('66666666-6666-4666-8666-666666666666', 'Single', 'Radiohead', RH, '2026-10-05', { 'primary-type': 'Single' }),
          rg('77777777-7777-4777-8777-777777777777', 'Other', 'Radiohead', RH, '2026-10-05', { 'primary-type': 'Broadcast' }),
          rg('88888888-8888-4888-8888-888888888888', 'Duet', 'Radiohead', RH, '2026-10-06', {
            'artist-credit': [
              { name: 'Radiohead', joinphrase: ' & ', artist: { id: RH, name: 'Radiohead' } },
              { name: 'Portishead', artist: { id: PJ, name: 'Portishead' } },
            ],
          }),
        ],
      },
      '2026-09-12',
    );
    expect(albums.map((a) => [a.title, a.kind])).toEqual([
      ['New Album', 'Album'],
      ['Small', 'EP'],
      ['Single', 'Single'],
      ['Duet', 'Album'],
    ]);
    expect(albums[3]).toMatchObject({ artist: 'Radiohead & Portishead', artist_key: 'radiohead', credit_mbids: [RH, PJ] });
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
    const top = spotifyArtists({
      items: [{ id: 'abc123', name: 'Radiohead', popularity: 78, genres: ['Art Rock'], images: [{ url: 'https://i/1', width: 640 }, { url: 'https://i/2', width: 160 }] }, { id: 'bad id!', name: 'X' }],
    });
    expect(top).toEqual([expect.objectContaining({ spotify_id: 'abc123', image_url: 'https://i/2', genres: ['art rock'], sources: ['spotify'], popularity: 78 })]);
    expect(spotifyArtists({ items: [{ id: 'z', name: 'Z', popularity: 'high' }] }, { offset: 50 })[0]).toMatchObject({ rank: 51, popularity: null });
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

  it('merges the same artist from Last.fm and Spotify and ranks by affinity', () => {
    const merged = mergeArtists([
      weighList([artist('Radiohead', 1, { mbid: RH }), artist('Muse', 2)], 'mid'),
      weighList([artist('radiohead', 3, { sources: ['spotify'], spotify_id: 'abc', genres: ['art rock'] })], 'mid'),
      [artist('Björk', 1, { sources: ['spotify'], followed: true })],
    ]);
    expect(merged.map((a) => [a.name, a.rank])).toEqual([
      ['Radiohead', 1],
      ['Muse', 2],
      ['Björk', 3],
    ]);
    expect(merged[0]).toMatchObject({ mbid: RH, spotify_id: 'abc', sources: ['lastfm', 'spotify'], genres: ['art rock'], affinity: 1 });
    expect(merged[2].affinity).toBe(0.1); // followed only
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
    artists: [artist('Radiohead', 1, { affinity: 0.9, signals: { mid: { share: 0.2, w: 1 } } }), artist('Muse', 10, { affinity: 0.4, signals: { mid: { share: 0.01, w: 0.4 } } })],
    similar: [{ key: 'thom yorke', name: 'Thom Yorke', mbid: MBX, match: 0.9, because: ['Radiohead', 'Muse'] }],
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
        album('f', 'Far future', 'Radiohead', '2027-06-01'),
      ],
      ctx,
    );
    expect(ranked.map((r) => r.album.key)).toEqual(['c', 'e', 'a', 'b']);
    expect(ranked[0]).toMatchObject({ reason: 'Neues Album von Radiohead – du hörst Radiohead oft', fresh: true, upcoming: false, own: true, rank: 1 });
    expect(ranked[1]).toMatchObject({ upcoming: true, fresh: false });
    expect(ranked[2].reason).toBe('Neues Album von Muse – Muse hörst du ab und zu');
    expect(ranked[3].reason).toBe('Weil du Radiohead und Muse hörst – ähnlicher Sound');
  });

  it('finds my artist in any credit, e.g. a duet', () => {
    const muse = { ...ctx.artists[1], mbid: PJ };
    const [r] = rankAlbums([album('d', 'Duet', 'Nobody & Muse', '2026-10-01', { artist_key: 'nobody', artist_mbid: MBX, credit_mbids: [MBX, PJ] })], {
      ...ctx,
      artists: [ctx.artists[0], muse],
      similar: [],
    });
    expect(r).toMatchObject({ own: true, reason: 'Neues Album von Muse – Muse hörst du ab und zu' });
  });

  it('shows singles and announcements only from favourites and small artists, never from similar ones', () => {
    const casual = artist('Casual', 3, { affinity: 0.2, niche: 0.1 });
    const small = artist('Tiny Band', 4, { affinity: 0.2, niche: 0.8, listeners: 18000 });
    const ranked = rankAlbums(
      [
        album('s1', 'Hit', 'Radiohead', '2026-10-10', { kind: 'Single' }),
        album('s2', 'Meh', 'Casual', '2026-10-10', { kind: 'Single' }),
        album('s3', 'Gem', 'Tiny Band', '2026-10-10', { kind: 'Single' }),
        album('s4', 'Soon', 'Casual', '2026-11-01'),
        album('s5', 'Sim single', 'Thom Yorke', '2026-10-10', { kind: 'Single', artist_mbid: MBX }),
        album('s6', 'Sim soon', 'Thom Yorke', '2026-11-01', { artist_mbid: MBX }),
      ],
      { ...ctx, artists: [...ctx.artists, casual, small] },
    );
    expect(ranked.map((r) => r.album.key).sort()).toEqual(['s1', 's3']);
    expect(ranked.find((r) => r.album.key === 's3')).toMatchObject({ small: true, reason: 'Neue Single von Tiny Band – Geheimtipp aus deiner Sammlung, nur 18’000 Hörer auf Last.fm' });
  });

  it('lifts small artists and explains trends', () => {
    const big = artist('Big', 2, { affinity: 0.5, niche: 0 });
    const tiny = artist('Tiny', 3, { affinity: 0.5, niche: 1 });
    const score = (a: Artist) => rankAlbums([album('x', 'X', a.name, '2026-09-20')], { ...ctx, artists: [a] })[0];
    expect(score(tiny).score - score(big).score).toBe(10);
    expect(score({ ...big, trend: 'rising' }).reason).toBe('Neues Album von Big – läuft bei dir gerade oft');
    expect(score({ ...big, trend: 'core' }).reason).toBe('Neues Album von Big – seit Langem einer deiner Favoriten');
    expect(score({ ...big, trend: 'fading' }).reason).toBe('Neues Album von Big – früher oft gehört, Zeit fürs Wiederhören');
    expect(score({ ...big, loved: 4 }).reason).toBe('Neues Album von Big – 4 Lieblingssongs von Big auf Last.fm');
    expect(score({ ...big, followed: true, sources: ['spotify'], signals: {} }).reason).toBe('Neues Album – du folgst Big auf Spotify');
  });

  it('notifies about fresh releases of favourites and of small artists I like', () => {
    const base = { own: true, fresh: true, small: false, affinity: 0.6 } as Parameters<typeof notifyWorthy>[0];
    expect(notifyWorthy(base)).toBe(true);
    expect(notifyWorthy({ ...base, affinity: 0.4 })).toBe(false);
    expect(notifyWorthy({ ...base, affinity: 0.4, small: true })).toBe(true);
    expect(notifyWorthy({ ...base, fresh: false })).toBe(false);
    expect(notifyWorthy({ ...base, own: false })).toBe(false);
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

describe('listening profile', () => {
  it('weighs play counts on a log scale, so the long tail still counts', () => {
    const list = weighList([artist('A', 1, { playcount: 900 }), artist('B', 2, { playcount: 90 }), artist('C', 3, { playcount: 3 })], 'mid');
    expect(list.map((a) => a.signals.mid!.w)).toEqual([1, 0.66, 0.158]); // a tenth of the plays → 0.66
    expect(list[0].signals.mid!.share).toBeCloseTo(900 / 993, 4);
    expect(list[0].playcount).toBe(900);
    expect(weighList([artist('A', 1, { playcount: 900 })], 'short')[0].playcount).toBeNull();
  });

  it('falls back to Zipf shares when only ranks are known', () => {
    const list = weighList([artist('A', 1), artist('B', 10)], 'long');
    expect(list[1].signals.long!.share / list[0].signals.long!.share).toBeCloseTo(0.1, 3);
    expect(list[1].signals.long!.w).toBe(0.66);
    expect(weighList([], 'mid')).toEqual([]);
  });

  it('combines periods, loved tracks and following into an affinity', () => {
    const sig = (w: number) => ({ share: 0.01, w });
    expect(affinityOf({ signals: { short: sig(1), mid: sig(1), long: sig(1) }, loved: 0, followed: false })).toBe(1);
    expect(affinityOf({ signals: { long: sig(1) }, loved: 0, followed: false })).toBe(0.3);
    expect(affinityOf({ signals: { mid: sig(0.5) }, loved: 2, followed: true }, ['mid'])).toBe(0.66);
    expect(affinityOf({ signals: {}, loved: 20, followed: false })).toBe(0.15);
  });

  it('tells rising, constant and fading artists apart', () => {
    const sig = (short: number, mid: number, long: number) => ({
      signals: Object.fromEntries(Object.entries({ short, mid, long }).filter(([, v]) => v > 0).map(([k, v]) => [k, { share: v, w: 0.5 }])),
    });
    expect(trendOf(sig(0.05, 0.02, 0))).toBe('rising');
    expect(trendOf(sig(0.05, 0.03, 0.01))).toBe('rising');
    expect(trendOf(sig(0, 0.005, 0.04))).toBe('fading');
    expect(trendOf(sig(0.02, 0.02, 0.03))).toBe('core');
    expect(trendOf(sig(0.002, 0.003, 0.002))).toBe('steady');
    expect(trendOf(sig(0.05, 0.02, 0), ['mid'])).toBeNull();
  });

  it('measures how small an artist is from listeners and popularity', () => {
    expect(nicheOf({ listeners: 2_000_000, popularity: null })).toBe(0);
    expect(nicheOf({ listeners: 200_000, popularity: null })).toBe(0.5);
    expect(nicheOf({ listeners: 5_000, popularity: null })).toBe(1);
    expect(nicheOf({ listeners: null, popularity: 45 })).toBe(0.5);
    expect(nicheOf({ listeners: 20_000, popularity: 65 })).toBe(0.5);
    expect(nicheOf({ listeners: null, popularity: null })).toBeNull();
  });

  it('builds a profile from several sources and periods', () => {
    const merged = mergeArtists([
      weighList([artist('Old Love', 1, { playcount: 500 }), artist('Steady', 2, { playcount: 400 })], 'long'),
      weighList([artist('Steady', 1, { playcount: 50 }), artist('New Thing', 2, { playcount: 45 })], 'short'),
      weighList([artist('Steady', 1, { playcount: 200 }), artist('New Thing', 2, { playcount: 100 })], 'mid'),
      lastfmLovedArtists({ lovedtracks: { track: [{ artist: { name: 'Old Love' } }] } }),
    ]);
    expect(merged.map((a) => [a.name, a.trend])).toEqual([
      ['Steady', 'core'],
      ['New Thing', 'rising'],
      ['Old Love', 'fading'],
    ]);
    expect(merged.find((a) => a.name === 'Old Love')).toMatchObject({ loved: 1, playcount: null });
    expect(merged[0].playcount).toBe(200);
  });

  it('picks diverse seeds: favourites, rising and small artists', () => {
    const list = Array.from({ length: 20 }, (_, i) => artist(`A${i}`, i + 1, { affinity: 1 - i / 20 }));
    list[15].trend = 'rising';
    list[18].niche = 0.9;
    const seeds = pickSeeds(list, 8).map((a) => a.name);
    expect(seeds).toHaveLength(8);
    expect(seeds.slice(0, 4)).toEqual(['A0', 'A1', 'A2', 'A3']);
    expect(seeds).toContain('A15');
    expect(seeds).toContain('A18');
  });

  it('checks concerts for favourites and small artists', () => {
    const list = Array.from({ length: 30 }, (_, i) => artist(`A${i}`, i + 1, { affinity: 0.9 - i / 50 }));
    list[25].niche = 0.7;
    const picked = pickConcertArtists(list, 10).map((a) => a.name);
    expect(picked).toHaveLength(10);
    expect(picked.slice(0, 7)).toEqual(['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    expect(picked[7]).toBe('A25');
    expect(pickConcertArtists(list.slice(0, 3), 10)).toHaveLength(3);
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

describe('stats.fm', () => {
  it('reads top artists with Spotify ids, streams and genres', () => {
    const artists = statsfmTopArtists({
      items: [
        { position: 1, streams: 812, indicator: 'SAME', artist: { id: 1, name: 'Radiohead', image: 'https://i.stats.fm/rh.jpg', genres: ['Art Rock', 'Alternative'], externalIds: { spotify: ['4Z8W4fKeB5YxbusRsdQVPb'] } } },
        { position: 2, streams: 400, indicator: 'UP', artist: { id: 2, name: 'Björk', image: 'http://insecure', genres: [], externalIds: { spotify: ['bad id!'] } } },
        { position: 3, streams: 1, artist: { id: 3, name: '' } },
      ],
    });
    expect(artists).toEqual([
      expect.objectContaining({ key: 'radiohead', spotify_id: '4Z8W4fKeB5YxbusRsdQVPb', playcount: 812, rank: 1, sources: ['statsfm'], genres: ['art rock', 'alternative'], image_url: 'https://i.stats.fm/rh.jpg' }),
      expect.objectContaining({ name: 'Björk', spotify_id: null, image_url: null, rank: 2 }),
    ]);
    expect(statsfmTopArtists(null)).toEqual([]);
  });

  it('reads listening totals and tolerates hidden stats', () => {
    expect(statsfmStreamStats({ items: { count: 5321, durationMs: 1_234_567_890, cardinality: { tracks: 900, artists: 310, albums: 420 } } })).toEqual({
      streams: 5321,
      minutes: 20576,
      tracks: 900,
      artists: 310,
      albums: 420,
    });
    expect(statsfmStreamStats({ items: {} })).toBeNull();
    expect(statsfmStreamStats(null)).toBeNull();
  });

  it('calls the public API and explains private or unknown profiles', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ items: [] })));
    await statsfmGet('/users/mario/top/artists?range=months&limit=50', ok);
    expect(ok.mock.calls[0][0]).toBe('https://api.stats.fm/api/v1/users/mario/top/artists?range=months&limit=50');
    await expect(statsfmGet('/users/x', vi.fn(async () => new Response('', { status: 404 })))).rejects.toMatchObject({ code: 'STATSFM_USER_NOT_FOUND' });
    await expect(statsfmGet('/users/x', vi.fn(async () => new Response('', { status: 403 })))).rejects.toMatchObject({ code: 'STATSFM_PRIVATE' });
    await expect(statsfmGet('/users/x', vi.fn(async () => new Response('', { status: 500 })))).rejects.toMatchObject({ code: 'STATSFM_UNAVAILABLE' });
  });

  it('merges stats.fm with Last.fm into one artist with both sources', () => {
    const merged = mergeArtists([
      lastfmTopArtists({ topartists: { artist: [{ name: 'Radiohead', mbid: RH, '@attr': { rank: '2' } }] } }),
      statsfmTopArtists({ items: [{ position: 1, streams: 10, artist: { name: 'Radiohead', externalIds: { spotify: ['abc'] }, genres: [], spotifyPopularity: 80 } }] }),
    ]);
    expect(merged).toEqual([expect.objectContaining({ mbid: RH, spotify_id: 'abc', sources: ['lastfm', 'statsfm'], rank: 1, popularity: 80, niche: 0 })]);
  });

  it('numbers a second page after the first', () => {
    expect(statsfmTopArtists({ items: [{ streams: 3, artist: { name: 'Deep Cut' } }] }, 50)[0].rank).toBe(51);
  });
});
