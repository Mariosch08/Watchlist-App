import { beforeEach, describe, expect, it } from 'vitest';
import { asAdmin, asUser, createDb, signUp } from './db.js';

let db;
let mario;

async function createInvite(code = 'ABCDEF123456', maxUses = 1, expires = "now() + interval '1 day'") {
  await asAdmin(db, `insert into public.invites (code, max_uses, expires_at) values ($1, $2, ${expires})`, [code, maxUses]);
  return code;
}

beforeEach(async () => {
  db = await createDb();
  mario = await signUp(db, 'Mario@Example.com', {}, new Date().toISOString());
});

describe('sign-up rules', () => {
  it('the first dashboard-invited user gets a profile and becomes admin', async () => {
    const { rows } = await asAdmin(db, 'select email, display_name, is_admin from public.profiles where id = $1', [mario]);
    expect(rows[0]).toEqual({ email: 'mario@example.com', display_name: 'Mario', is_admin: true });
  });

  it('later users need an invite code', async () => {
    await expect(signUp(db, 'friend@example.com')).rejects.toThrow(/INVITE_REQUIRED/);
    await expect(signUp(db, 'friend@example.com', { invite_code: 'NOPE123456' })).rejects.toThrow(/INVITE_INVALID/);
  });

  it('a valid code works once (normalised) and is then used up; second user is no admin', async () => {
    await createInvite();
    const friend = await signUp(db, 'friend@example.com', { invite_code: 'abcdef-123456' });
    const { rows } = await asAdmin(db, 'select uses, used_by from public.invites');
    expect(rows[0]).toEqual({ uses: 1, used_by: ['friend@example.com'] });
    const meta = await asAdmin(db, 'select raw_user_meta_data from auth.users where id = $1', [friend]);
    expect(meta.rows[0].raw_user_meta_data).toEqual({});
    const p = await asAdmin(db, 'select is_admin from public.profiles where id = $1', [friend]);
    expect(p.rows[0].is_admin).toBe(false);
    await expect(signUp(db, 'other@example.com', { invite_code: 'ABCDEF123456' })).rejects.toThrow(/INVITE_INVALID/);
  });

  it('expired codes are rejected', async () => {
    await createInvite('EXPIRED12345', 5, "now() - interval '1 minute'");
    await expect(signUp(db, 'x@example.com', { invite_code: 'EXPIRED12345' })).rejects.toThrow(/INVITE_INVALID/);
  });

  it('dashboard invites (admin approval) need no code but do not make further admins', async () => {
    const id = await signUp(db, 'invited@example.com', {}, new Date().toISOString());
    const { rows } = await asAdmin(db, 'select is_admin from public.profiles where id = $1', [id]);
    expect(rows[0].is_admin).toBe(false);
  });

  it('public sign-up never bypasses the invite, not even when the app is empty again', async () => {
    await asUser(db, mario, 'select public.delete_my_account()');
    expect((await asAdmin(db, 'select count(*)::int as n from public.profiles')).rows[0].n).toBe(0);
    await expect(signUp(db, 'stranger@example.com')).rejects.toThrow(/INVITE_REQUIRED/);
  });

  it('an invite-code user is never admin, even without any admin', async () => {
    await asAdmin(db, "update public.profiles set is_admin = false");
    await createInvite('CODE12345678');
    const id = await signUp(db, 'friend@example.com', { invite_code: 'CODE12345678' });
    const { rows } = await asAdmin(db, 'select is_admin from public.profiles where id = $1', [id]);
    expect(rows[0].is_admin).toBe(false);
  });

  it('check_invite is callable anonymously', async () => {
    await createInvite();
    const ok = await asUser(db, null, 'select public.check_invite($1) as ok', ['abcdef-123456']);
    const bad = await asUser(db, null, 'select public.check_invite($1) as ok', ['WRONG12345']);
    expect([ok.rows[0].ok, bad.rows[0].ok]).toEqual([true, false]);
  });
});

describe('invites are admin-only', () => {
  it('non-admins cannot read or create invites', async () => {
    await createInvite();
    const friend = await signUp(db, 'friend@example.com', { invite_code: 'ABCDEF123456' });
    expect((await asUser(db, friend, 'select * from public.invites')).rows).toEqual([]);
    await expect(asUser(db, friend, 'insert into public.invites (max_uses) values (1)')).rejects.toThrow(/row-level security/);
  });

  it('admins create invites with generated codes and cannot fake usage counters', async () => {
    const { rows } = await asUser(db, mario, 'insert into public.invites (max_uses, note) values (3, $1) returning code, created_by, uses', ['Für Anna']);
    expect(rows[0].code).toMatch(/^[A-F0-9]{12}$/);
    expect(rows[0]).toMatchObject({ created_by: mario, uses: 0 });
    await expect(asUser(db, mario, "insert into public.invites (uses) values (0)")).rejects.toThrow(/permission denied/);
  });
});
