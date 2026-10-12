import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asUser, createDb, signUp } from './db.js';

let db;
let a;
let b;

beforeEach(async () => {
  db = await createDb();
  a = await signUp(db, 'a@example.com', {}, new Date().toISOString());
  await asAdmin(db, "insert into public.invites (code, max_uses) values ('INVITE123456', 5)");
  b = await signUp(db, 'b@example.com', { invite_code: 'INVITE123456' });
  await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id, title) values ('movie', 603, 'Matrix')");
  await asUser(db, b, "insert into public.watchlist (media_type, tmdb_id, title) values ('tv', 1399, 'GoT')");
});

describe('user A never sees or changes user B data', () => {
  it('watchlist: select only returns own rows; user_id defaults to the caller', async () => {
    const { rows } = await asUser(db, a, 'select user_id, tmdb_id from public.watchlist');
    expect(rows).toEqual([{ user_id: a, tmdb_id: 603 }]);
  });

  it('watchlist: cannot insert, update or delete for another user', async () => {
    await expect(
      asUser(db, a, "insert into public.watchlist (user_id, media_type, tmdb_id) values ($1, 'movie', 1)", [b]),
    ).rejects.toThrow(/row-level security/);
    await asUser(db, a, "update public.watchlist set status = 'completed' where user_id = $1", [b]);
    await asUser(db, a, 'delete from public.watchlist where user_id = $1', [b]);
    const { rows } = await asAdmin(db, 'select status from public.watchlist where user_id = $1', [b]);
    expect(rows).toEqual([{ status: 'planned' }]);
  });

  it('watchlist: stores TMDb rating and original title', async () => {
    await asUser(db, a, "insert into public.watchlist (media_type, tmdb_id, title, original_title, vote_average) values ('movie', 807, 'Sieben', 'Se7en', 8.4)");
    const { rows } = await asUser(db, a, 'select original_title, vote_average::float as v from public.watchlist where tmdb_id = 807');
    expect(rows[0]).toEqual({ original_title: 'Se7en', v: 8.4 });
    await expect(asUser(db, a, "insert into public.watchlist (media_type, tmdb_id, vote_average) values ('movie', 2, 11)")).rejects.toThrow(/check constraint/);
  });

  it('watchlist: invalid values are rejected', async () => {
    await expect(asUser(db, a, "insert into public.watchlist (media_type, tmdb_id) values ('book', 1)")).rejects.toThrow(/check constraint/);
    await expect(asUser(db, a, "insert into public.watchlist (media_type, tmdb_id) values ('movie', -1)")).rejects.toThrow(/check constraint/);
  });

  it('profiles: only own profile visible; cannot change is_admin or other profiles', async () => {
    const { rows } = await asUser(db, b, 'select id from public.profiles');
    expect(rows).toEqual([{ id: b }]);
    await expect(asUser(db, b, 'update public.profiles set is_admin = true where id = $1', [b])).rejects.toThrow(/permission denied/);
    await asUser(db, b, "update public.profiles set display_name = 'hacked' where id = $1", [a]);
    const a1 = await asAdmin(db, 'select display_name from public.profiles where id = $1', [a]);
    expect(a1.rows[0].display_name).toBe('a');
  });

  it('profiles: usernames are validated and unique', async () => {
    await asUser(db, a, "update public.profiles set username = 'mario' where id = auth.uid()");
    await expect(asUser(db, b, "update public.profiles set username = 'mario' where id = auth.uid()")).rejects.toThrow(/unique/);
    await expect(asUser(db, b, "update public.profiles set username = 'No Spaces' where id = auth.uid()")).rejects.toThrow(/check constraint/);
  });

  it('export only contains own data', async () => {
    const { rows } = await asUser(db, a, 'select public.export_my_data() as data');
    const data = rows[0].data;
    expect(data.profile.id).toBe(a);
    expect(data.profile.is_admin).toBeUndefined();
    expect(data.watchlist.map((w) => w.tmdb_id)).toEqual([603]);
  });

  it('delete account removes only own user and data', async () => {
    await asUser(db, b, 'select public.delete_my_account()');
    const users = await asAdmin(db, 'select email from auth.users order by email');
    expect(users.rows).toEqual([{ email: 'a@example.com' }]);
    const wl = await asAdmin(db, 'select user_id from public.watchlist');
    expect(wl.rows).toEqual([{ user_id: a }]);
    expect((await asAdmin(db, 'select count(*)::int as n from public.profiles')).rows[0].n).toBe(1);
  });

  it('anonymous users cannot read anything or delete accounts', async () => {
    await expect(asUser(db, null, 'select * from public.watchlist')).rejects.toThrow(/permission denied/);
    await expect(asUser(db, null, 'select public.delete_my_account()')).rejects.toThrow(/permission denied/);
  });
});
