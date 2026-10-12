import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

// Fresh in-memory Postgres with the Supabase stub and all migrations applied.
export async function createDb() {
  const db = new PGlite();
  await db.exec(readFileSync(join(root, 'tests/supabase-stub.sql'), 'utf8'));
  const dir = join(root, 'supabase/migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8'));
  }
  return db;
}

// Simulates the sign-up done by Supabase Auth (runs as superuser like the auth service).
export async function signUp(db, email, meta = {}, invitedAt = null) {
  await db.exec('reset role');
  const res = await db.query(
    'insert into auth.users (email, raw_user_meta_data, invited_at) values ($1, $2, $3) returning id',
    [email, JSON.stringify(meta), invitedAt],
  );
  return res.rows[0].id;
}

// Runs a query as a logged-in user (role authenticated + JWT sub), like supabase-js would.
export async function asUser(db, userId, sql, params) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? '']);
  await db.exec(userId ? 'set role authenticated' : 'set role anon');
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

export async function asAdmin(db, sql, params) {
  await db.exec('reset role');
  return db.query(sql, params);
}
