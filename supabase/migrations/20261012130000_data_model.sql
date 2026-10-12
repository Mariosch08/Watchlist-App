-- Phase 2: data model for ratings, series tracking, taste profile, feed, shared lists,
-- friendships, imports, notifications and the TMDb cache.
-- Rules: every user-owned table references auth.users ON DELETE CASCADE and has RLS.
-- Tables written only by server jobs (service role) get no INSERT grant for clients.

-- ---------------------------------------------------------------------------
-- Watchlist: extend (not replace)
-- ---------------------------------------------------------------------------
alter table public.watchlist
  add column imdb_id    text check (imdb_id ~ '^tt[0-9]{5,10}$'),
  add column my_rating  smallint check (my_rating between 1 and 10),
  add column rated_at   timestamptz,
  add column watched_at timestamptz,
  add column runtime    int check (runtime between 0 and 100000), -- minutes
  add column updated_at timestamptz not null default now();

create index watchlist_imdb_idx on public.watchlist (user_id, imdb_id) where imdb_id is not null;

-- Keeps rated_at / watched_at consistent with my_rating / status.
create function public.watchlist_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.my_rating is null then
    new.rated_at := null;
  elsif tg_op = 'INSERT' and new.rated_at is null then
    new.rated_at := now();
  elsif tg_op = 'UPDATE' and new.my_rating is distinct from old.my_rating
        and new.rated_at is not distinct from old.rated_at then
    new.rated_at := now();
  end if;
  if new.status = 'completed' and new.watched_at is null then
    new.watched_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger watchlist_before_write
  before insert or update on public.watchlist
  for each row execute function public.watchlist_before_write();

-- ---------------------------------------------------------------------------
-- Tombstones: titles a user removed, so imports do not re-create them
-- ---------------------------------------------------------------------------
create table public.watchlist_tombstones (
  user_id    uuid not null references auth.users (id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  tmdb_id    int not null check (tmdb_id > 0),
  deleted_at timestamptz not null default now(),
  primary key (user_id, media_type, tmdb_id)
);

create function public.watchlist_after_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Skip when the whole account is being deleted (user row already gone).
  if exists (select 1 from auth.users u where u.id = old.user_id) then
    insert into public.watchlist_tombstones (user_id, media_type, tmdb_id)
    values (old.user_id, old.media_type, old.tmdb_id)
    on conflict (user_id, media_type, tmdb_id) do update set deleted_at = now();
  end if;
  return old;
end;
$$;

create trigger watchlist_after_delete
  after delete on public.watchlist
  for each row execute function public.watchlist_after_delete();

-- Adding a title manually again lifts the tombstone. Imports (source = 'imdb') check it instead.
create function public.watchlist_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'manual' then
    delete from public.watchlist_tombstones t
     where t.user_id = new.user_id and t.media_type = new.media_type and t.tmdb_id = new.tmdb_id;
  end if;
  return new;
end;
$$;

create trigger watchlist_after_insert
  after insert on public.watchlist
  for each row execute function public.watchlist_after_insert();

-- ---------------------------------------------------------------------------
-- Series tracking
-- ---------------------------------------------------------------------------
create table public.series_progress (
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id              int not null check (tmdb_id > 0),
  tmdb_status          text check (char_length(tmdb_status) <= 40), -- Returning Series / Ended / Canceled ...
  number_of_seasons    int check (number_of_seasons >= 0),
  number_of_episodes   int check (number_of_episodes >= 0),
  last_episode_to_air  jsonb,
  next_episode_to_air  jsonb,
  next_up_season       int check (next_up_season >= 1),
  next_up_episode      int check (next_up_episode >= 1),
  last_checked_at      timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

-- Season 0 (specials) is not tracked.
create table public.watched_episodes (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tmdb_id        int not null,
  season_number  int not null check (season_number >= 1),
  episode_number int not null check (episode_number >= 1),
  watched_at     timestamptz not null default now(),
  primary key (user_id, tmdb_id, season_number, episode_number),
  foreign key (user_id, tmdb_id) references public.series_progress (user_id, tmdb_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Taste profile and settings (one row per user, created on sign-up)
-- ---------------------------------------------------------------------------
create table public.taste_profile (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  genre_weights_movie jsonb not null default '{}' check (jsonb_typeof(genre_weights_movie) = 'object'),
  genre_weights_tv    jsonb not null default '{}' check (jsonb_typeof(genre_weights_tv) = 'object'),
  genre_weights_music jsonb not null default '{}' check (jsonb_typeof(genre_weights_music) = 'object'),
  favorite_people     int[] not null default '{}',   -- TMDb person ids
  favorite_artists    text[] not null default '{}',  -- artist names / MusicBrainz ids
  rejected_ids        text[] not null default '{}',  -- e.g. 'movie:603', 'tv:1399', 'album:<mbid>'
  updated_at          timestamptz not null default now()
);

create table public.user_settings (
  user_id                     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  streaming_providers         int[] not null default '{}', -- TMDb watch provider ids (CH)
  lastfm_username             text check (lastfm_username ~ '^[A-Za-z][A-Za-z0-9_-]{1,14}$'),
  email_digest                boolean not null default true,
  email_instant               boolean not null default true,
  share_ratings_with_friends  boolean not null default true,
  unsubscribe_token           uuid not null default gen_random_uuid(),
  updated_at                  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recommendation feed (written by server jobs, user can only react)
-- ---------------------------------------------------------------------------
create table public.feed (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         text not null check (type in ('movie', 'tv', 'album')),
  external_id  text not null check (char_length(external_id) <= 100), -- TMDb id or MusicBrainz/Spotify id
  title        text not null check (char_length(title) <= 300),
  subtitle     text check (char_length(subtitle) <= 300),
  image_url    text check (char_length(image_url) <= 500),
  release_date date,
  source       text not null check (char_length(source) <= 50),
  score        numeric not null,
  reason       text check (char_length(reason) <= 300),
  data         jsonb not null default '{}', -- genres, providers, links ...
  status       text not null default 'new' check (status in ('new', 'liked', 'disliked', 'added')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  unique (user_id, type, external_id)
);

create index feed_user_status_idx on public.feed (user_id, status, score desc);

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
create table public.friendships (
  requester_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Only one friendship per pair, regardless of direction.
create unique index friendships_pair_idx on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

-- ---------------------------------------------------------------------------
-- Shared lists with roles and votes
-- ---------------------------------------------------------------------------
create table public.shared_lists (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  created_at  timestamptz not null default now()
);

create table public.list_members (
  list_id  uuid not null references public.shared_lists (id) on delete cascade,
  user_id  uuid not null references auth.users (id) on delete cascade,
  role     text not null check (role in ('owner', 'editor', 'viewer')),
  added_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table public.list_items (
  list_id      uuid not null references public.shared_lists (id) on delete cascade,
  media_type   text not null check (media_type in ('movie', 'tv')),
  tmdb_id      int not null check (tmdb_id > 0),
  title        text not null default '' check (char_length(title) <= 300),
  poster_path  text check (char_length(poster_path) <= 200),
  release_date text check (char_length(release_date) <= 20),
  added_by     uuid default auth.uid() references auth.users (id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (list_id, media_type, tmdb_id)
);

create table public.list_votes (
  list_id    uuid not null,
  media_type text not null,
  tmdb_id    int not null,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  vote       smallint not null check (vote in (-1, 1)),
  voted_at   timestamptz not null default now(),
  primary key (list_id, media_type, tmdb_id, user_id),
  foreign key (list_id, media_type, tmdb_id)
    references public.list_items (list_id, media_type, tmdb_id) on delete cascade
);

-- Role of the current user in a list (null = no member). Security definer avoids RLS recursion.
create function public.list_role(p_list_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.list_members m where m.list_id = p_list_id and m.user_id = auth.uid();
$$;

create function public.shared_list_after_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.list_members (list_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger shared_list_after_insert
  after insert on public.shared_lists
  for each row execute function public.shared_list_after_insert();

-- ---------------------------------------------------------------------------
-- Imports, notifications, TMDb cache
-- ---------------------------------------------------------------------------
create table public.import_jobs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null default 'unknown'
              check (kind in ('imdb_watchlist', 'imdb_ratings', 'imdb_list', 'unknown')),
  file_path   text check (char_length(file_path) <= 300),
  status      text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  total       int not null default 0,
  imported    int not null default 0,
  updated     int not null default 0,
  skipped     int not null default 0,
  not_found   jsonb not null default '[]',
  error       text,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('new_season', 'new_episode', 'friend_request', 'list_invite', 'digest', 'other')),
  title      text not null check (char_length(title) <= 200),
  body       text check (char_length(body) <= 2000),
  data       jsonb not null default '{}',
  read_at    timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Server-side cache (TMDb details with TTL, IMDb -> TMDb mapping without expiry). No client access.
create table public.tmdb_cache (
  cache_key  text primary key check (char_length(cache_key) <= 200), -- e.g. 'details:movie:603:de-CH', 'imdb:tt0133093'
  kind       text not null check (kind in ('details', 'mapping', 'other')),
  data       jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz -- null = never
);

create function public.purge_expired() returns void
language sql security definer set search_path = '' as $$
  delete from public.feed where expires_at < now();
  delete from public.tmdb_cache where expires_at < now();
$$;

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger series_progress_updated_at before update on public.series_progress
  for each row execute function public.touch_updated_at();
create trigger taste_profile_updated_at before update on public.taste_profile
  for each row execute function public.touch_updated_at();
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Sign-up: also create taste profile and settings; backfill existing users
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(left(split_part(coalesce(new.email, ''), '@', 1), 50), ''), 'Neuer Nutzer'),
    not exists (select 1 from public.profiles)
  );
  insert into public.taste_profile (user_id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

insert into public.taste_profile (user_id) select id from public.profiles on conflict do nothing;
insert into public.user_settings (user_id) select id from public.profiles on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Export: all own data
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 2,
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'is_admin' from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) - 'user_id' - 'unsubscribe_token' from public.user_settings s where s.user_id = auth.uid()),
    'taste_profile', (select to_jsonb(t) - 'user_id' from public.taste_profile t where t.user_id = auth.uid()),
    'watchlist', coalesce((select jsonb_agg(to_jsonb(w) - 'user_id' order by w.added_at)
      from public.watchlist w where w.user_id = auth.uid()), '[]'::jsonb),
    'series_progress', coalesce((select jsonb_agg(to_jsonb(s) - 'user_id')
      from public.series_progress s where s.user_id = auth.uid()), '[]'::jsonb),
    'watched_episodes', coalesce((select jsonb_agg(to_jsonb(e) - 'user_id' order by e.tmdb_id, e.season_number, e.episode_number)
      from public.watched_episodes e where e.user_id = auth.uid()), '[]'::jsonb),
    'feed', coalesce((select jsonb_agg(to_jsonb(f) - 'user_id')
      from public.feed f where f.user_id = auth.uid()), '[]'::jsonb),
    'friendships', coalesce((select jsonb_agg(to_jsonb(fr))
      from public.friendships fr where auth.uid() in (fr.requester_id, fr.addressee_id)), '[]'::jsonb),
    'shared_lists', coalesce((select jsonb_agg(to_jsonb(l))
      from public.shared_lists l where l.owner_id = auth.uid()), '[]'::jsonb),
    'import_jobs', coalesce((select jsonb_agg(to_jsonb(j) - 'user_id')
      from public.import_jobs j where j.user_id = auth.uid()), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.watchlist_tombstones, public.series_progress, public.watched_episodes,
  public.taste_profile, public.user_settings, public.feed, public.friendships, public.shared_lists,
  public.list_members, public.list_items, public.list_votes, public.import_jobs, public.notifications,
  public.tmdb_cache
  from anon, authenticated;

grant update (status, my_rating, rated_at, watched_at) on public.watchlist to authenticated;
grant select, delete on public.watchlist_tombstones to authenticated;
grant select, insert, delete on public.series_progress to authenticated;
grant update (next_up_season, next_up_episode) on public.series_progress to authenticated;
grant select, insert, delete on public.watched_episodes to authenticated;
grant select on public.taste_profile to authenticated;
grant update (genre_weights_movie, genre_weights_tv, genre_weights_music, favorite_people, favorite_artists, rejected_ids)
  on public.taste_profile to authenticated;
grant select on public.user_settings to authenticated;
grant update (streaming_providers, lastfm_username, email_digest, email_instant, share_ratings_with_friends)
  on public.user_settings to authenticated;
grant select, delete on public.feed to authenticated;
grant update (status) on public.feed to authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (addressee_id) on public.friendships to authenticated;
grant update (status, responded_at) on public.friendships to authenticated;
grant select, delete on public.shared_lists to authenticated;
grant insert (name, description) on public.shared_lists to authenticated;
grant update (name, description) on public.shared_lists to authenticated;
grant select, delete on public.list_members to authenticated;
grant insert (list_id, user_id, role) on public.list_members to authenticated;
grant update (role) on public.list_members to authenticated;
grant select, delete on public.list_items to authenticated;
grant insert (list_id, media_type, tmdb_id, title, poster_path, release_date) on public.list_items to authenticated;
grant select, delete on public.list_votes to authenticated;
grant insert (list_id, media_type, tmdb_id, vote) on public.list_votes to authenticated;
grant update (vote) on public.list_votes to authenticated;
grant select, delete on public.import_jobs to authenticated;
grant insert (kind, file_path) on public.import_jobs to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- tmdb_cache: no client grants at all.

revoke execute on function public.list_role(uuid), public.purge_expired(),
  public.watchlist_after_delete(), public.watchlist_after_insert(), public.shared_list_after_insert()
  from public, anon;
grant execute on function public.list_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.watchlist_tombstones enable row level security;
alter table public.series_progress enable row level security;
alter table public.watched_episodes enable row level security;
alter table public.taste_profile enable row level security;
alter table public.user_settings enable row level security;
alter table public.feed enable row level security;
alter table public.friendships enable row level security;
alter table public.shared_lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_items enable row level security;
alter table public.list_votes enable row level security;
alter table public.import_jobs enable row level security;
alter table public.notifications enable row level security;
alter table public.tmdb_cache enable row level security;

-- Simple "own rows" tables
create policy "own rows" on public.watchlist_tombstones for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.series_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.watched_episodes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.taste_profile for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.feed for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.import_jobs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on public.notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Friendships: both sides can see and remove; only the requester creates; only the addressee answers.
create policy "parties: read" on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy "requester: create" on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy "addressee: answer" on public.friendships for update to authenticated
  using (addressee_id = auth.uid()) with check (addressee_id = auth.uid() and status in ('accepted', 'declined'));
create policy "parties: remove" on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- Shared lists: members read; owner manages; editors add/remove items; all members vote.
create policy "members: read" on public.shared_lists for select to authenticated
  using (owner_id = auth.uid() or public.list_role(id) is not null);
create policy "anyone: create own" on public.shared_lists for insert to authenticated
  with check (owner_id = auth.uid());
create policy "owner: update" on public.shared_lists for update to authenticated
  using (public.list_role(id) = 'owner') with check (public.list_role(id) = 'owner');
create policy "owner: delete" on public.shared_lists for delete to authenticated
  using (public.list_role(id) = 'owner');

create policy "members: read" on public.list_members for select to authenticated
  using (public.list_role(list_id) is not null);
create policy "owner: add" on public.list_members for insert to authenticated
  with check (public.list_role(list_id) = 'owner' and role <> 'owner');
create policy "owner: change role" on public.list_members for update to authenticated
  using (public.list_role(list_id) = 'owner' and role <> 'owner')
  with check (role <> 'owner');
create policy "owner removes, member leaves" on public.list_members for delete to authenticated
  using (role <> 'owner' and (public.list_role(list_id) = 'owner' or user_id = auth.uid()));

create policy "members: read" on public.list_items for select to authenticated
  using (public.list_role(list_id) is not null);
create policy "editors: add" on public.list_items for insert to authenticated
  with check (public.list_role(list_id) in ('owner', 'editor') and added_by = auth.uid());
create policy "editors: remove" on public.list_items for delete to authenticated
  using (public.list_role(list_id) in ('owner', 'editor'));

create policy "members: read" on public.list_votes for select to authenticated
  using (public.list_role(list_id) is not null);
create policy "members: own vote" on public.list_votes for insert to authenticated
  with check (user_id = auth.uid() and public.list_role(list_id) is not null);
create policy "members: change own vote" on public.list_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.list_role(list_id) is not null);
create policy "members: remove own vote" on public.list_votes for delete to authenticated
  using (user_id = auth.uid());

-- tmdb_cache: RLS on, no policies -> only the service role (bypasses RLS) can use it.
