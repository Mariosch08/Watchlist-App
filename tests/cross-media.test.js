import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asUser, createDb, signUp } from './db.js';

let db;
let a;
let b;
let c;

const rows = async (userId, sql, params) => (await asUser(db, userId, sql, params)).rows;
const befriend = (x, y) => asAdmin(db, "insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')", [x, y]);
const settings = (user, sql) => asAdmin(db, `update public.user_settings set ${sql} where user_id = $1`, [user]);

beforeEach(async () => {
  db = await createDb();
  a = await signUp(db, 'anna@example.com', {}, new Date().toISOString());
  await asAdmin(db, "insert into public.invites (code, max_uses) values ('INVITE123456', 5)");
  b = await signUp(db, 'ben@example.com', { invite_code: 'INVITE123456' });
  c = await signUp(db, 'carla@example.com', { invite_code: 'INVITE123456' });
  for (const [id, name] of [[a, 'Anna'], [b, 'Ben'], [c, 'Carla']]) {
    await asAdmin(db, 'update public.profiles set username = lower($2), display_name = $2 where id = $1', [id, name]);
  }
});

describe('settings for the cross-media features', () => {
  it('lets me switch the mood, choose what I share and keep my own prices', async () => {
    const [s] = await rows(a, 'select music_mood, share_music_with_friends, share_services_with_friends, streaming_prices from public.user_settings');
    expect(s).toEqual({ music_mood: true, share_music_with_friends: false, share_services_with_friends: false, streaming_prices: {} });
    await asUser(db, a, `update public.user_settings set music_mood = false, share_music_with_friends = true, streaming_prices = '{"8": 18.9}' where user_id = $1`, [a]);
    await expect(asUser(db, a, `update public.user_settings set streaming_prices = '[1]' where user_id = $1`, [a])).rejects.toThrow(/check constraint/);
    expect((await rows(a, 'select streaming_prices from public.user_settings'))[0].streaming_prices).toEqual({ 8: 18.9 });
  });
});

describe('rotation plan', () => {
  it('is saved and replaced in one call and stays private', async () => {
    const plan = [{ month: '2026-11', provider_id: 8, provider: 'Netflix', price: 18.9, titles: ['movie:1'] }];
    await asUser(db, a, 'select public.save_rotation_plan($1)', [JSON.stringify(plan)]);
    await asUser(db, a, 'select public.save_rotation_plan($1)', [JSON.stringify([...plan, { ...plan[0], month: '2026-12' }])]);
    expect((await rows(a, 'select months from public.rotation_plans'))[0].months).toHaveLength(2);
    expect(await rows(b, 'select * from public.rotation_plans')).toEqual([]);
    await expect(asUser(db, a, "select public.save_rotation_plan('{}')")).rejects.toThrow(/check constraint/);
    await expect(asUser(db, a, "select public.save_rotation_plan('[]')")).rejects.toThrow(/check constraint/);
    const exported = (await asUser(db, a, 'select public.export_my_data() as e')).rows[0].e;
    expect(exported.version).toBe(9);
    expect(exported.rotation_plan.months).toHaveLength(2);
  });
});

describe('catch-up plans', () => {
  beforeEach(async () => {
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id, title, status, runtime) values ('tv', 95396, 'Severance', 'watching', 50)");
    await asUser(db, a, 'insert into public.series_progress (tmdb_id) values (95396)');
    await asAdmin(db, "update public.series_progress set season_episodes = '{9,10}' where user_id = $1", [a]);
    await asAdmin(db, "insert into public.catchup_plans (user_id, tmdb_id, season_number, premiere, behind_at_start, per_week) values ($1, 95396, 3, '2027-01-17', 6, 1)", [a]);
  });

  it('can be read and dismissed, but not changed otherwise', async () => {
    expect(await rows(a, 'select season_number, per_week, dismissed from public.catchup_plans')).toEqual([{ season_number: 3, per_week: 1, dismissed: false }]);
    await asUser(db, a, 'update public.catchup_plans set dismissed = true');
    await expect(asUser(db, a, 'update public.catchup_plans set per_week = 5')).rejects.toThrow(/permission denied/);
    await expect(asUser(db, a, "insert into public.catchup_plans (user_id, tmdb_id, season_number, premiere, behind_at_start, per_week) values ($1, 95396, 4, '2028-01-01', 1, 1)", [a])).rejects.toThrow(/permission denied/);
    expect(await rows(b, 'select * from public.catchup_plans')).toEqual([]);
  });

  it('shows episodes per season and the episode length in the series overview', async () => {
    expect(await rows(a, 'select tmdb_id, season_episodes, runtime from public.series_overview()')).toEqual([{ tmdb_id: 95396, season_episodes: [9, 10], runtime: 50 }]);
  });
});

describe('Life Reel data', () => {
  it('keeps listening months read-only and lets me log concerts once per event', async () => {
    await asAdmin(db, "insert into public.music_months (user_id, month, plays, minutes, top_artist, source) values ($1, '2026-03-01', 812, 2842, 'Phoenix', 'lastfm')", [a]);
    await expect(asAdmin(db, "insert into public.music_months (user_id, month, plays, source) values ($1, '2026-03-02', 1, 'lastfm')", [a])).rejects.toThrow(/check constraint/);
    expect(await rows(a, 'select top_artist from public.music_months')).toEqual([{ top_artist: 'Phoenix' }]);
    expect(await rows(b, 'select * from public.music_months')).toEqual([]);
    await expect(asUser(db, a, 'update public.music_months set plays = 1')).rejects.toThrow(/permission denied/);

    await asUser(db, a, "insert into public.concert_log (event_id, artist, local_date, venue, city) values ('tm1', 'Phoenix', '2026-03-12', 'Volkshaus', 'Zürich')");
    await expect(asUser(db, a, "insert into public.concert_log (event_id, artist, local_date) values ('tm1', 'Phoenix', '2026-03-12')")).rejects.toThrow(/duplicate key/);
    await asUser(db, a, "insert into public.concert_log (artist, local_date) values ('Phoenix', '2019-06-01')");
    expect(await rows(b, 'select * from public.concert_log')).toEqual([]);
    await asUser(db, b, 'delete from public.concert_log');
    expect((await rows(a, 'select count(*)::int as n from public.concert_log'))[0].n).toBe(2);
    const exported = (await asUser(db, a, 'select public.export_my_data() as e')).rows[0].e;
    expect(exported.music_months).toHaveLength(1);
    expect(exported.concert_log).toHaveLength(2);
  });
});

describe('concert buddies', () => {
  beforeEach(async () => {
    await befriend(a, b);
    await asAdmin(db, "insert into public.concerts (user_id, event_id, artist, artist_key, name, local_date, city) values ($1, 'tm1', 'Phoenix', 'phoenix', 'Phoenix Live', current_date + 30, 'Zürich')", [a]);
    for (const user of [b, c]) {
      await asAdmin(db, "insert into public.music_artists (user_id, artist_key, name, sources, rank, affinity) values ($1, 'phoenix', 'Phoenix', '{lastfm}', 1, 0.8)", [user]);
    }
  });

  it('needs both sides to share their music, and only friends count', async () => {
    expect(await rows(a, 'select * from public.concert_buddies()')).toEqual([]);
    await settings(a, 'share_music_with_friends = true');
    expect(await rows(a, 'select * from public.concert_buddies()')).toEqual([]);
    await settings(b, 'share_music_with_friends = true');
    await settings(c, 'share_music_with_friends = true'); // Carla is no friend
    expect(await rows(a, 'select artist, city, display_name from public.concert_buddies()')).toEqual([{ artist: 'Phoenix', city: 'Zürich', display_name: 'Ben' }]);
  });

  it('ignores artists a friend hardly listens to and past concerts', async () => {
    await settings(a, 'share_music_with_friends = true');
    await settings(b, 'share_music_with_friends = true');
    await asAdmin(db, 'update public.music_artists set affinity = 0.1 where user_id = $1', [b]);
    expect(await rows(a, 'select * from public.concert_buddies()')).toEqual([]);
    await asAdmin(db, 'update public.music_artists set affinity = 0.8 where user_id = $1', [b]);
    await asAdmin(db, 'update public.concerts set local_date = current_date - 1');
    expect(await rows(a, 'select * from public.concert_buddies()')).toEqual([]);
  });
});

describe('shared screen of a movie night', () => {
  let list;
  let night;
  beforeEach(async () => {
    await befriend(a, b);
    await befriend(a, c);
    [{ id: list }] = await rows(a, "insert into public.shared_lists (name) values ('Filmabend') returning id");
    await asUser(db, a, "insert into public.list_members (list_id, user_id, role) values ($1, $2, 'editor'), ($1, $3, 'viewer')", [list, b, c]);
    await asUser(db, a, "insert into public.list_items (list_id, media_type, tmdb_id, title) values ($1, 'movie', 666277, 'Past Lives'), ($1, 'movie', 603, 'Matrix')", [list]);
    [{ id: night }] = await rows(a, "insert into public.movie_nights (list_id, title, options) values ($1, 'Freitag', '{2026-10-17T18:00:00Z}') returning id", [list]);
    await asUser(db, b, 'select public.set_availability($1, 0::smallint, true)', [night]);
    await settings(a, "streaming_providers = '{8}'");
    await settings(b, "streaming_providers = '{11, 337}'");
    await settings(c, "streaming_providers = '{350}'");
    await asUser(db, b, "insert into public.watchlist (media_type, tmdb_id, title, status) values ('movie', 603, 'Matrix', 'completed')");
  });

  it('shows services and seen titles only for friends who share them', async () => {
    await settings(b, 'share_services_with_friends = true');
    await settings(c, 'share_services_with_friends = true, share_ratings_with_friends = false');
    const screen = await rows(a, 'select display_name, is_me, attending, providers, seen from public.night_screen($1)', [night]);
    expect(screen).toEqual([
      { display_name: 'Anna', is_me: true, attending: false, providers: [8], seen: [] },
      { display_name: 'Ben', is_me: false, attending: true, providers: [11, 337], seen: ['movie:603'] },
      { display_name: 'Carla', is_me: false, attending: false, providers: [350], seen: null },
    ]);
    // Ben and Carla are no friends of each other: nothing of the other is revealed.
    const fromBen = await rows(b, 'select display_name, providers, seen from public.night_screen($1)', [night]);
    expect(fromBen.find((r) => r.display_name === 'Carla')).toEqual({ display_name: 'Carla', providers: null, seen: null });
  });

  it('is empty for people outside the list', async () => {
    const d = await signUp(db, 'dora@example.com', { invite_code: 'INVITE123456' });
    expect(await rows(d, 'select * from public.night_screen($1)', [night])).toEqual([]);
  });
});
