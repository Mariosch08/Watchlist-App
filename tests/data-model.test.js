import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asUser, createDb, signUp } from './db.js';

let db;
let a;
let b;
let c;

const rows = async (userId, sql, params) => (await asUser(db, userId, sql, params)).rows;

beforeEach(async () => {
  db = await createDb();
  a = await signUp(db, 'a@example.com');
  await asAdmin(db, "insert into public.invites (code, max_uses) values ('INVITE123456', 5)");
  b = await signUp(db, 'b@example.com', { invite_code: 'INVITE123456' });
  c = await signUp(db, 'c@example.com', { invite_code: 'INVITE123456' });
});

describe('sign-up creates profile rows', () => {
  it('taste profile and settings exist with defaults', async () => {
    expect(await rows(a, 'select genre_weights_movie, rejected_ids from public.taste_profile')).toEqual([
      { genre_weights_movie: {}, rejected_ids: [] },
    ]);
    expect(await rows(a, 'select email_digest, share_ratings_with_friends from public.user_settings')).toEqual([
      { email_digest: true, share_ratings_with_friends: true },
    ]);
  });

  it('settings validate the Last.fm username and protect the unsubscribe token', async () => {
    await asUser(db, a, "update public.user_settings set lastfm_username = 'mario_08', streaming_providers = '{8,337}'");
    expect(await rows(a, 'select lastfm_username, streaming_providers from public.user_settings')).toEqual([
      { lastfm_username: 'mario_08', streaming_providers: [8, 337] },
    ]);
    await expect(asUser(db, a, "update public.user_settings set lastfm_username = 'bad name!'")).rejects.toThrow(/check constraint/);
    await expect(asUser(db, a, 'update public.user_settings set unsubscribe_token = gen_random_uuid()')).rejects.toThrow(/permission denied/);
  });
});

describe('watchlist ratings and status', () => {
  beforeEach(async () => {
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id, title, imdb_id) values ('movie', 603, 'Matrix', 'tt0133093')");
  });

  it('rating 1-10 sets rated_at, clearing the rating clears it', async () => {
    await asUser(db, a, 'update public.watchlist set my_rating = 9 where tmdb_id = 603');
    let [w] = await rows(a, 'select my_rating, rated_at from public.watchlist');
    expect(w.my_rating).toBe(9);
    expect(w.rated_at).toBeInstanceOf(Date);
    await asUser(db, a, 'update public.watchlist set my_rating = null where tmdb_id = 603');
    [w] = await rows(a, 'select rated_at from public.watchlist');
    expect(w.rated_at).toBeNull();
    await expect(asUser(db, a, 'update public.watchlist set my_rating = 11')).rejects.toThrow(/check constraint/);
    await expect(asUser(db, a, 'update public.watchlist set my_rating = 0')).rejects.toThrow(/check constraint/);
  });

  it('an explicit rated_at (e.g. from IMDb) is kept', async () => {
    await asUser(db, a, "update public.watchlist set my_rating = 8, rated_at = '2020-01-02' where tmdb_id = 603");
    const [w] = await rows(a, "select to_char(rated_at at time zone 'UTC', 'YYYY-MM-DD') as d from public.watchlist");
    expect(w.d).toBe('2020-01-02');
  });

  it('completed sets watched_at; status values are validated', async () => {
    await asUser(db, a, "update public.watchlist set status = 'completed' where tmdb_id = 603");
    const [w] = await rows(a, 'select watched_at from public.watchlist');
    expect(w.watched_at).toBeInstanceOf(Date);
    await expect(asUser(db, a, "update public.watchlist set status = 'loved'")).rejects.toThrow(/check constraint/);
  });

  it('title and ownership cannot be changed by the client', async () => {
    await expect(asUser(db, a, "update public.watchlist set title = 'x'")).rejects.toThrow(/permission denied/);
    await expect(asUser(db, a, 'update public.watchlist set user_id = $1', [b])).rejects.toThrow(/permission denied/);
  });

  it('imdb ids are validated', async () => {
    await expect(asUser(db, a, "insert into public.watchlist (media_type, tmdb_id, imdb_id) values ('movie', 1, 'nm123')")).rejects.toThrow(/check constraint/);
  });
});

describe('tombstones', () => {
  it('deleting creates a tombstone, re-adding manually lifts it', async () => {
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id) values ('movie', 603)");
    await asUser(db, a, "delete from public.watchlist where tmdb_id = 603");
    expect(await rows(a, 'select tmdb_id from public.watchlist_tombstones')).toEqual([{ tmdb_id: 603 }]);
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id) values ('movie', 603)");
    expect(await rows(a, 'select * from public.watchlist_tombstones')).toEqual([]);
  });

  it('imported entries do not lift tombstones', async () => {
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id) values ('movie', 603)");
    await asUser(db, a, 'delete from public.watchlist where tmdb_id = 603');
    await asAdmin(db, "insert into public.watchlist (user_id, media_type, tmdb_id, source) values ($1, 'movie', 603, 'imdb')", [a]);
    expect((await rows(a, 'select * from public.watchlist_tombstones')).length).toBe(1);
  });

  it('account deletion with watchlist entries still works', async () => {
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id) values ('movie', 603)");
    await asUser(db, a, 'select public.delete_my_account()');
    expect((await asAdmin(db, 'select count(*)::int as n from public.watchlist_tombstones')).rows[0].n).toBe(0);
  });
});

describe('isolation of user-owned tables', () => {
  beforeEach(async () => {
    await asAdmin(db, "insert into public.series_progress (user_id, tmdb_id) values ($1, 1399)", [a]);
    await asAdmin(db, "insert into public.watched_episodes (user_id, tmdb_id, season_number, episode_number) values ($1, 1399, 1, 1)", [a]);
    await asAdmin(db, "insert into public.feed (user_id, type, external_id, title, source, score) values ($1, 'movie', '603', 'Matrix', 'test', 1)", [a]);
    await asAdmin(db, "insert into public.import_jobs (user_id) values ($1)", [a]);
    await asAdmin(db, "insert into public.notifications (user_id, type, title) values ($1, 'other', 'Hi')", [a]);
    await asAdmin(db, "insert into public.watchlist_tombstones (user_id, media_type, tmdb_id) values ($1, 'tv', 1)", [a]);
  });

  it.each([
    'series_progress', 'watched_episodes', 'feed', 'import_jobs', 'notifications',
    'watchlist_tombstones', 'taste_profile', 'user_settings',
  ])('%s: other users see nothing and cannot modify A', async (table) => {
    expect(await rows(b, `select * from public.${table} where user_id = $1`, [a])).toEqual([]);
    await asUser(db, b, `delete from public.${table} where user_id = $1`, [a]).catch(() => {}); // may lack DELETE grant
    expect((await rows(a, `select * from public.${table}`)).length).toBe(1);
  });

  it('feed: user may react but not create entries or change scores', async () => {
    await asUser(db, a, "update public.feed set status = 'liked'");
    expect(await rows(a, 'select status from public.feed')).toEqual([{ status: 'liked' }]);
    await expect(asUser(db, a, 'update public.feed set score = 99')).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, a, "insert into public.feed (user_id, type, external_id, title, source, score) values (auth.uid(), 'movie', '1', 'x', 'x', 1)"),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, a, "update public.feed set status = 'meh'")).rejects.toThrow(/check constraint/);
  });

  it('series: episodes need a progress row and specials (season 0) are rejected', async () => {
    await expect(
      asUser(db, b, 'insert into public.watched_episodes (tmdb_id, season_number, episode_number) values (1399, 1, 1)'),
    ).rejects.toThrow(/foreign key/);
    await expect(
      asUser(db, a, 'insert into public.watched_episodes (tmdb_id, season_number, episode_number) values (1399, 0, 1)'),
    ).rejects.toThrow(/check constraint/);
  });

  it('tmdb_cache is not accessible to clients', async () => {
    await expect(asUser(db, a, 'select * from public.tmdb_cache')).rejects.toThrow(/permission denied/);
  });

  it('export contains the new tables', async () => {
    const [{ data }] = await rows(a, 'select public.export_my_data() as data');
    expect(data.version).toBe(2);
    expect(data.series_progress).toHaveLength(1);
    expect(data.watched_episodes).toHaveLength(1);
    expect(data.feed).toHaveLength(1);
    expect(data.settings.unsubscribe_token).toBeUndefined();
    const [{ data: other }] = await rows(b, 'select public.export_my_data() as data');
    expect(other.feed).toEqual([]);
  });
});

describe('friendships', () => {
  it('request, visibility and answering rules', async () => {
    await asUser(db, a, 'insert into public.friendships (addressee_id) values ($1)', [b]);
    expect((await rows(b, 'select status from public.friendships'))).toEqual([{ status: 'pending' }]);
    expect(await rows(c, 'select * from public.friendships')).toEqual([]);
    // requester cannot accept own request
    await asUser(db, a, "update public.friendships set status = 'accepted'");
    expect(await rows(a, 'select status from public.friendships')).toEqual([{ status: 'pending' }]);
    await asUser(db, b, "update public.friendships set status = 'accepted', responded_at = now()");
    expect(await rows(a, 'select status from public.friendships')).toEqual([{ status: 'accepted' }]);
  });

  it('no duplicates in reverse direction, no self-friendship, no forged requester', async () => {
    await asUser(db, a, 'insert into public.friendships (addressee_id) values ($1)', [b]);
    await expect(asUser(db, b, 'insert into public.friendships (addressee_id) values ($1)', [a])).rejects.toThrow(/duplicate key/);
    await expect(asUser(db, a, 'insert into public.friendships (addressee_id) values ($1)', [a])).rejects.toThrow(/check constraint/);
    await expect(
      asUser(db, a, 'insert into public.friendships (requester_id, addressee_id) values ($1, $2)', [c, b]),
    ).rejects.toThrow(/permission denied/);
  });

  it('either side can remove the friendship', async () => {
    await asUser(db, a, 'insert into public.friendships (addressee_id) values ($1)', [b]);
    await asUser(db, b, 'delete from public.friendships');
    expect(await rows(a, 'select * from public.friendships')).toEqual([]);
  });
});

describe('shared lists', () => {
  let list;
  beforeEach(async () => {
    [{ id: list }] = await rows(a, "insert into public.shared_lists (name) values ('Filmabend') returning id");
  });

  it('creator becomes owner; non-members see nothing', async () => {
    expect(await rows(a, 'select user_id, role from public.list_members')).toEqual([{ user_id: a, role: 'owner' }]);
    expect(await rows(b, 'select * from public.shared_lists')).toEqual([]);
    await asUser(db, b, "insert into public.list_items (list_id, media_type, tmdb_id) values ($1, 'movie', 1)", [list]).catch(() => {});
    expect((await asAdmin(db, 'select count(*)::int as n from public.list_items')).rows[0].n).toBe(0);
  });

  it('roles: viewer reads and votes, editor adds items, only owner manages members', async () => {
    await asUser(db, a, "insert into public.list_members (list_id, user_id, role) values ($1, $2, 'viewer'), ($1, $3, 'editor')", [list, b, c]);
    await expect(
      asUser(db, b, "insert into public.list_items (list_id, media_type, tmdb_id) values ($1, 'movie', 603)", [list]),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, c, "insert into public.list_items (list_id, media_type, tmdb_id, title) values ($1, 'movie', 603, 'Matrix')", [list]);
    expect(await rows(b, 'select title from public.list_items')).toEqual([{ title: 'Matrix' }]);

    await asUser(db, b, "insert into public.list_votes (list_id, media_type, tmdb_id, vote) values ($1, 'movie', 603, 1)", [list]);
    await asUser(db, c, "insert into public.list_votes (list_id, media_type, tmdb_id, vote) values ($1, 'movie', 603, -1)", [list]);
    await asUser(db, b, 'update public.list_votes set vote = -1 where user_id = $1', [c]); // not own -> no effect
    expect(await rows(a, 'select sum(vote)::int as s from public.list_votes')).toEqual([{ s: 0 }]);
    await expect(
      asUser(db, b, "insert into public.list_votes (list_id, media_type, tmdb_id, vote) values ($1, 'movie', 603, 5)", [list]),
    ).rejects.toThrow(/check constraint|duplicate key/);

    await expect(
      asUser(db, c, "insert into public.list_members (list_id, user_id, role) values ($1, gen_random_uuid(), 'viewer')", [list]),
    ).rejects.toThrow(/row-level security/);
    await expect(asUser(db, a, "update public.list_members set role = 'owner' where user_id = $1", [b])).rejects.toThrow(/row-level security/);
  });

  it('members can leave, owner cannot be removed, deleting the list removes everything', async () => {
    await asUser(db, a, "insert into public.list_members (list_id, user_id, role) values ($1, $2, 'viewer')", [list, b]);
    await asUser(db, b, 'delete from public.list_members where user_id = $1', [a]); // try to remove owner
    await asUser(db, b, 'delete from public.list_members where user_id = $1', [b]); // leave
    expect(await rows(a, 'select user_id from public.list_members')).toEqual([{ user_id: a }]);
    await asUser(db, a, 'delete from public.shared_lists where id = $1', [list]);
    expect((await asAdmin(db, 'select count(*)::int as n from public.list_members')).rows[0].n).toBe(0);
  });

  it('a former member loses access', async () => {
    await asUser(db, a, "insert into public.list_members (list_id, user_id, role) values ($1, $2, 'editor')", [list, b]);
    await asUser(db, a, 'delete from public.list_members where user_id = $1', [b]);
    expect(await rows(b, 'select * from public.shared_lists')).toEqual([]);
  });
});

describe('import jobs (phase 3)', () => {
  it('clients cannot create jobs themselves but can read their own', async () => {
    await expect(asUser(db, a, "insert into public.import_jobs (kind) values ('unknown')")).rejects.toThrow(/permission denied/);
    await asAdmin(db, "insert into public.import_jobs (user_id, total, items) values ($1, 2, '[{\"imdb_id\":\"tt0133093\"}]')", [a]);
    expect(await rows(a, 'select total, processed from public.import_jobs')).toEqual([{ total: 2, processed: 0 }]);
    expect(await rows(b, 'select * from public.import_jobs')).toEqual([]);
  });
});
