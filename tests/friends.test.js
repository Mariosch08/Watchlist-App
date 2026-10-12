import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asUser, createDb, signUp } from './db.js';

let db;
let a;
let b;
let c;

const rows = async (userId, sql, params) => (await asUser(db, userId, sql, params)).rows;
const one = async (userId, sql, params) => (await rows(userId, sql, params))[0];
const befriend = (x, y) => asAdmin(db, "insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')", [x, y]);
const rate = (user, tmdbId, rating, title = `Film ${tmdbId}`) =>
  asUser(db, user, "insert into public.watchlist (media_type, tmdb_id, title, status, my_rating) values ('movie', $1, $2, 'completed', $3)", [tmdbId, title, rating]);

beforeEach(async () => {
  db = await createDb();
  a = await signUp(db, 'anna@example.com', {}, new Date().toISOString());
  await asAdmin(db, "insert into public.invites (code, max_uses) values ('INVITE123456', 5)");
  b = await signUp(db, 'ben@example.com', { invite_code: 'INVITE123456' });
  c = await signUp(db, 'carla@example.com', { invite_code: 'INVITE123456' });
  await asAdmin(db, "update public.profiles set username = 'anna', display_name = 'Anna' where id = $1", [a]);
  await asAdmin(db, "update public.profiles set username = 'ben', display_name = 'Ben' where id = $1", [b]);
  await asAdmin(db, "update public.profiles set username = 'carla', display_name = 'Carla' where id = $1", [c]);
});

describe('friend requests', () => {
  it('finds people by username or exact e-mail and notifies them', async () => {
    expect((await one(a, "select public.send_friend_request('@Ben') as r")).r).toBe('sent');
    expect((await one(a, "select public.send_friend_request('ben') as r")).r).toBe('pending');
    expect((await one(a, "select public.send_friend_request('carla@example.com') as r")).r).toBe('sent');
    expect(await rows(b, 'select type, title from public.notifications')).toEqual([{ type: 'friend_request', title: 'Anna möchte mit dir befreundet sein' }]);
    await expect(asUser(db, a, "select public.send_friend_request('nobody')")).rejects.toThrow(/USER_NOT_FOUND/);
    await expect(asUser(db, a, "select public.send_friend_request('anna')")).rejects.toThrow(/USER_NOT_FOUND/);
    await expect(asUser(db, a, "select public.send_friend_request('%')")).rejects.toThrow(/USER_NOT_FOUND/);
  });

  it('asking back accepts; a decline is never revealed to the requester', async () => {
    await asUser(db, a, "select public.send_friend_request('ben')");
    expect((await one(b, "select public.send_friend_request('anna') as r")).r).toBe('accepted');
    expect((await one(a, "select status from public.friends_overview() where user_id = $1", [b])).status).toBe('accepted');
    expect(await rows(a, "select type from public.notifications where type = 'friend_accepted'")).toHaveLength(1);

    await asUser(db, a, "select public.send_friend_request('carla')");
    await asUser(db, c, 'select public.respond_friend_request($1, false)', [a]);
    expect((await one(a, 'select status from public.friends_overview() where user_id = $1', [c])).status).toBe('pending');
    expect(await rows(c, 'select * from public.friends_overview()')).toEqual([]);
    await expect(asUser(db, c, 'select public.respond_friend_request($1, true)', [a])).rejects.toThrow(/REQUEST_NOT_FOUND/);
    // Carla changes her mind and asks herself.
    expect((await one(c, "select public.send_friend_request('anna') as r")).r).toBe('sent');
  });

  it('only the addressee can answer, and nobody can forge an accepted friendship', async () => {
    await asUser(db, a, "select public.send_friend_request('ben')");
    await expect(asUser(db, a, 'select public.respond_friend_request($1, true)', [a])).rejects.toThrow(/REQUEST_NOT_FOUND/);
    await expect(asUser(db, c, 'select public.respond_friend_request($1, true)', [a])).rejects.toThrow(/REQUEST_NOT_FOUND/);
    await expect(asUser(db, c, "insert into public.friendships (addressee_id, status) values ($1, 'accepted')", [a])).rejects.toThrow(/permission denied/);
    await asUser(db, a, "update public.friendships set status = 'accepted'");
    expect((await asAdmin(db, 'select status from public.friendships')).rows[0].status).toBe('pending');
  });
});

describe('what friends can see', () => {
  beforeEach(async () => {
    await befriend(a, b);
    for (const [id, ra, rb] of [
      [1, 10, 9],
      [2, 8, 8],
      [3, 3, 4],
      [4, 7, 1],
    ]) {
      await rate(a, id, ra);
      await rate(b, id, rb);
    }
    await rate(c, 1, 2);
  });

  it('shows names and a taste match, never e-mail addresses', async () => {
    const list = await rows(a, 'select * from public.friends_overview()');
    expect(list).toEqual([
      expect.objectContaining({ user_id: b, display_name: 'Ben', username: 'ben', status: 'accepted', common_rated: 4, match_percent: 78 }),
    ]);
    expect(JSON.stringify(list)).not.toContain('@example.com');
    expect(await rows(a, 'select * from public.profiles where id = $1', [b])).toEqual([]);
  });

  it('hides ratings and the match when either side opts out', async () => {
    await asUser(db, b, 'update public.user_settings set share_ratings_with_friends = false where user_id = $1', [b]);
    expect((await one(a, 'select match_percent from public.friends_overview()')).match_percent).toBeNull();
    expect(await rows(a, "select * from public.friends_on_title('movie', 1)")).toEqual([]);
  });

  it('"Wer hat es gesehen?" lists friends only', async () => {
    expect(await rows(a, "select display_name, my_rating from public.friends_on_title('movie', 1)")).toEqual([{ display_name: 'Ben', my_rating: 9 }]);
    expect(await rows(c, "select * from public.friends_on_title('movie', 1)")).toEqual([]);
  });

  it('activity is opt-in', async () => {
    expect(await rows(a, 'select * from public.friend_activity()')).toEqual([]);
    await asUser(db, b, 'update public.user_settings set share_activity = true where user_id = $1', [b]);
    const activity = await rows(a, 'select display_name, kind, title from public.friend_activity()');
    expect(activity).toHaveLength(4);
    expect(activity[0]).toMatchObject({ display_name: 'Ben', kind: 'rated' });
    expect(await rows(c, 'select * from public.friend_activity()')).toEqual([]);
  });
});

describe('"Schau das!"', () => {
  beforeEach(() => befriend(a, b));

  it('goes to friends only; the recipient answers, the sender cannot', async () => {
    await asUser(db, a, "select public.recommend_title($1, 'movie', 603, 'Matrix', null, '1999-03-31', 'Musst du sehen!')", [b]);
    await expect(asUser(db, a, "select public.recommend_title($1, 'movie', 603, 'Matrix', null, null, null)", [c])).rejects.toThrow(/NOT_FRIENDS/);
    expect(await rows(b, 'select title, message, status from public.friend_recommendations')).toEqual([{ title: 'Matrix', message: 'Musst du sehen!', status: 'new' }]);
    expect(await rows(b, "select title from public.notifications where type = 'recommendation'")).toEqual([{ title: 'Anna empfiehlt dir „Matrix“' }]);
    expect(await rows(c, 'select * from public.friend_recommendations')).toEqual([]);

    await asUser(db, a, "update public.friend_recommendations set status = 'added'");
    expect((await one(b, 'select status from public.friend_recommendations')).status).toBe('new');
    await asUser(db, b, "update public.friend_recommendations set status = 'added'");
    expect((await one(a, 'select status from public.friend_recommendations')).status).toBe('added');
    await expect(asUser(db, b, "update public.friend_recommendations set message = 'x'")).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, a, "insert into public.friend_recommendations (from_user, to_user, media_type, tmdb_id, title) values ($1, $2, 'movie', 1, 'x')", [a, b]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('shared lists and movie nights', () => {
  let list;
  beforeEach(async () => {
    await befriend(a, b);
    await befriend(a, c);
    [{ id: list }] = await rows(a, "insert into public.shared_lists (name) values ('Filmabend') returning id");
    await asUser(db, a, "insert into public.list_members (list_id, user_id, role) values ($1, $2, 'editor'), ($1, $3, 'viewer')", [list, b, c]);
  });

  it('invitees are notified and members see each other by name', async () => {
    expect(await rows(b, "select title from public.notifications where type = 'list_invite'")).toEqual([{ title: 'Anna hat dich zur Liste „Filmabend“ hinzugefügt' }]);
    // Ben and Carla are not friends but share the list.
    expect((await rows(c, 'select display_name, role from public.list_people($1)', [list])).map((p) => p.display_name)).toEqual(['Anna', 'Ben', 'Carla']);
    const d = await signUp(db, 'dora@example.com', { invite_code: 'INVITE123456' });
    expect(await rows(d, 'select * from public.list_people($1)', [list])).toEqual([]);
  });

  it('editors plan, everybody votes for themselves, the host fixes the date', async () => {
    const options = ['2026-10-17T18:00:00Z', '2026-10-18T18:00:00Z'];
    await expect(asUser(db, c, "insert into public.movie_nights (list_id, title, options) values ($1, 'Halloween', $2)", [list, options])).rejects.toThrow(
      /row-level security/,
    );
    const { id: night } = await one(b, "insert into public.movie_nights (list_id, title, options) values ($1, 'Halloween', $2) returning id", [list, options]);
    expect(await rows(a, "select title from public.notifications where type = 'movie_night'")).toEqual([{ title: 'Filmabend „Halloween“: Wann hast du Zeit?' }]);

    await asUser(db, c, 'insert into public.movie_night_votes (night_id, option_index, available) values ($1, 1, true)', [night]);
    await asUser(db, a, 'insert into public.movie_night_votes (night_id, option_index, available) values ($1, 1, true), ($1, 0, false)', [night]);
    await asUser(db, c, 'update public.movie_night_votes set available = false where user_id = $1', [a]);
    expect((await one(b, 'select count(*) filter (where available)::int as n from public.movie_night_votes')).n).toBe(2);

    await asUser(db, c, 'update public.movie_nights set chosen_option = 0');
    expect((await one(a, 'select chosen_option from public.movie_nights')).chosen_option).toBeNull();
    await asUser(db, b, 'update public.movie_nights set chosen_option = 1');
    expect(await rows(c, "select title from public.notifications where type = 'movie_night' order by created_at")).toEqual([
      { title: 'Filmabend „Halloween“: Wann hast du Zeit?' },
      { title: 'Filmabend „Halloween“ steht: 18.10.2026 20:00' },
    ]);

    const d = await signUp(db, 'dora@example.com', { invite_code: 'INVITE123456' });
    expect(await rows(d, 'select * from public.movie_nights')).toEqual([]);
    expect(await rows(d, 'select * from public.movie_night_votes')).toEqual([]);
    await expect(asUser(db, d, 'insert into public.movie_night_votes (night_id, option_index, available) values ($1, 0, true)', [night])).rejects.toThrow(
      /row-level security/,
    );
  });
});
