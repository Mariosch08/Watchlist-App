-- Phase 1: profiles, invite-only sign-up, minimal watchlist, account export/deletion.
-- Every user-owned row is protected by Row Level Security: user_id = auth.uid().

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text not null check (char_length(display_name) between 1 and 50),
  username     text unique check (username ~ '^[a-z0-9_]{3,20}$'),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.invites (
  code       text primary key
             default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
             check (code ~ '^[A-Z0-9]{6,32}$'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  max_uses   int not null default 1 check (max_uses between 1 and 50),
  uses       int not null default 0,
  used_by    text[] not null default '{}',
  note       text check (char_length(note) <= 100)
);

create table public.watchlist (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type   text not null check (media_type in ('movie', 'tv')),
  tmdb_id      int not null check (tmdb_id > 0),
  title        text not null default '' check (char_length(title) <= 300),
  poster_path  text check (char_length(poster_path) <= 200),
  release_date text check (char_length(release_date) <= 20),
  status       text not null default 'planned'
               check (status in ('planned', 'watching', 'completed', 'dropped', 'paused')),
  source       text not null default 'manual' check (source in ('manual', 'imdb')),
  added_at     timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

create function public.normalize_invite_code(raw text) returns text
language sql immutable set search_path = '' as $$
  select nullif(upper(regexp_replace(coalesce(raw, ''), '[\s-]', '', 'g')), '');
$$;

-- Lets the registration form give a clear error before calling sign-up.
create function public.check_invite(code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invites i
    where i.code = public.normalize_invite_code(check_invite.code)
      and i.uses < i.max_uses and i.expires_at > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Sign-up rules (triggers on auth.users)
-- ---------------------------------------------------------------------------
-- Sign-up requires a valid invite code, except:
--  * the very first user (Mario, becomes admin automatically)
--  * users invited via the Supabase dashboard ("Invite user" = admin approval)
create function public.enforce_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  if not exists (select 1 from public.profiles) then
    return new;
  end if;
  if new.invited_at is not null then
    return new;
  end if;
  v_code := public.normalize_invite_code(new.raw_user_meta_data ->> 'invite_code');
  if v_code is null then
    raise exception 'INVITE_REQUIRED';
  end if;
  update public.invites
     set uses = uses + 1, used_by = array_append(used_by, lower(new.email))
   where code = v_code and uses < max_uses and expires_at > now();
  if not found then
    raise exception 'INVITE_INVALID';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code';
  return new;
end;
$$;

create trigger enforce_invite
  before insert on auth.users
  for each row execute function public.enforce_invite();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(left(split_part(coalesce(new.email, ''), '@', 1), 50), ''), 'Neuer Nutzer'),
    not exists (select 1 from public.profiles)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Account functions
-- ---------------------------------------------------------------------------
-- All own data as JSON. Runs with the caller's rights, so RLS applies as well.
create function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 1,
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'is_admin' from public.profiles p where p.id = auth.uid()),
    'watchlist', coalesce((
      select jsonb_agg(to_jsonb(w) - 'user_id' order by w.added_at)
      from public.watchlist w where w.user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

-- Deletes the auth user; profile, watchlist etc. go via ON DELETE CASCADE.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges (Supabase grants everything to anon/authenticated by default)
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.invites, public.watchlist from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, username) on public.profiles to authenticated;
grant select, delete on public.invites to authenticated;
grant insert (max_uses, expires_at, note) on public.invites to authenticated;
grant select, insert, delete on public.watchlist to authenticated;
grant update (status) on public.watchlist to authenticated;

revoke execute on function public.delete_my_account(), public.export_my_data(), public.is_admin(),
  public.enforce_invite(), public.handle_new_user() from public, anon;
grant execute on function public.delete_my_account(), public.export_my_data(), public.is_admin() to authenticated;
grant execute on function public.check_invite(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.watchlist enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "admins: read invites" on public.invites
  for select to authenticated using (public.is_admin());
create policy "admins: create invites" on public.invites
  for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
create policy "admins: delete invites" on public.invites
  for delete to authenticated using (public.is_admin());

create policy "own watchlist: read" on public.watchlist
  for select to authenticated using (user_id = auth.uid());
create policy "own watchlist: insert" on public.watchlist
  for insert to authenticated with check (user_id = auth.uid());
create policy "own watchlist: update" on public.watchlist
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own watchlist: delete" on public.watchlist
  for delete to authenticated using (user_id = auth.uid());
