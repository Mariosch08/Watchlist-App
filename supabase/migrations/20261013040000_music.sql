-- Phase 8: music (Last.fm, optional Spotify, MusicBrainz releases, concerts in Switzerland).
grant update (lastfm_username) on public.user_settings to authenticated;

-- Merged top artists of all music sources, written by discovery-music (service role); read-only for the user.
create table public.music_artists (
  user_id    uuid not null references auth.users (id) on delete cascade,
  artist_key text not null check (char_length(artist_key) between 1 and 200),
  name       text not null check (char_length(name) between 1 and 200),
  mbid       uuid,
  spotify_id text check (spotify_id ~ '^[A-Za-z0-9]{1,40}$'),
  sources    text[] not null check (sources <@ array['lastfm', 'spotify']),
  rank       int not null check (rank > 0),
  playcount  int,
  followed   boolean not null default false,
  image_url  text check (char_length(image_url) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, artist_key)
);

-- Spotify (OAuth PKCE): the refresh token is AES-GCM encrypted by the edge function and never readable by clients.
create table public.spotify_connections (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  spotify_user_id   text not null check (char_length(spotify_user_id) <= 100),
  display_name      text check (char_length(display_name) <= 100),
  refresh_token_enc text not null check (char_length(refresh_token_enc) <= 2000),
  connected_at      timestamptz not null default now()
);

-- Upcoming concerts of the user's artists in Switzerland (Ticketmaster), replaced on every run.
create table public.concerts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  event_id   text not null check (char_length(event_id) <= 100),
  artist     text not null check (char_length(artist) <= 200),
  name       text not null check (char_length(name) <= 300),
  venue      text check (char_length(venue) <= 200),
  city       text check (char_length(city) <= 100),
  local_date date not null,
  starts_at  timestamptz,
  url        text check (url ~ '^https://' and char_length(url) <= 500),
  image_url  text check (char_length(image_url) <= 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.music_artists enable row level security;
alter table public.spotify_connections enable row level security;
alter table public.concerts enable row level security;
revoke all on public.music_artists, public.spotify_connections, public.concerts from anon, authenticated;
grant select on public.music_artists, public.concerts to authenticated;
grant select (user_id, spotify_user_id, display_name, connected_at) on public.spotify_connections to authenticated;
grant delete on public.spotify_connections to authenticated;
create policy "own rows: read" on public.music_artists for select to authenticated using (user_id = auth.uid());
create policy "own rows: read" on public.concerts for select to authenticated using (user_id = auth.uid());
create policy "own rows: read" on public.spotify_connections for select to authenticated using (user_id = auth.uid());
create policy "own rows: disconnect" on public.spotify_connections for delete to authenticated using (user_id = auth.uid());

-- Notifications for new releases of favourite artists and for concerts.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_season', 'new_episode', 'friend_request', 'list_invite', 'digest', 'available', 'new_release', 'concert', 'other'));

-- Export includes music data (never the Spotify token).
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 5,
    'exported_at', now(),
    'profile', (select to_jsonb(p) - 'is_admin' from public.profiles p where p.id = auth.uid()),
    'settings', (select to_jsonb(s) - 'user_id' - 'unsubscribe_token' - 'calendar_token' from public.user_settings s where s.user_id = auth.uid()),
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
    'availability_alerts', coalesce((select jsonb_agg(to_jsonb(al) - 'user_id')
      from public.availability_alerts al where al.user_id = auth.uid()), '[]'::jsonb),
    'music_artists', coalesce((select jsonb_agg(to_jsonb(m) - 'user_id' order by m.rank)
      from public.music_artists m where m.user_id = auth.uid()), '[]'::jsonb),
    'concerts', coalesce((select jsonb_agg(to_jsonb(co) - 'user_id' order by co.local_date)
      from public.concerts co where co.user_id = auth.uid()), '[]'::jsonb),
    'spotify', (select jsonb_build_object('display_name', sc.display_name, 'connected_at', sc.connected_at)
      from public.spotify_connections sc where sc.user_id = auth.uid()),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

