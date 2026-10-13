-- stats.fm as a music source: public profile name, top artists (with Spotify ids) and listening totals.
alter table public.user_settings add column statsfm_username text check (statsfm_username ~ '^[A-Za-z0-9_.-]{2,40}$');
grant update (statsfm_username) on public.user_settings to authenticated;

alter table public.music_artists drop constraint music_artists_sources_check;
alter table public.music_artists add constraint music_artists_sources_check check (sources <@ array['lastfm', 'spotify', 'statsfm']);

-- Listening totals of the last 6 months (from stats.fm), written by discovery-music; read-only for the user.
create table public.music_stats (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  source     text not null check (source in ('statsfm')),
  streams    int not null check (streams >= 0),
  minutes    int not null check (minutes >= 0),
  tracks     int,
  artists    int,
  albums     int,
  updated_at timestamptz not null default now()
);

alter table public.music_stats enable row level security;
revoke all on public.music_stats from anon, authenticated;
grant select on public.music_stats to authenticated;
create policy "own rows: read" on public.music_stats for select to authenticated using (user_id = auth.uid());

-- Export includes the listening totals.
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 8,
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
    'friend_recommendations', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at)
      from public.friend_recommendations r where auth.uid() in (r.from_user, r.to_user)), '[]'::jsonb),
    'movie_nights', coalesce((select jsonb_agg(to_jsonb(mn) order by mn.created_at)
      from public.movie_nights mn where mn.created_by = auth.uid()), '[]'::jsonb),
    'movie_night_votes', coalesce((select jsonb_agg(to_jsonb(v) - 'user_id')
      from public.movie_night_votes v where v.user_id = auth.uid()), '[]'::jsonb),
    'music_stats', (select to_jsonb(ms) - 'user_id' from public.music_stats ms where ms.user_id = auth.uid()),
    'diary', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by d.watched_on, d.created_at)
      from public.diary_entries d where d.user_id = auth.uid()), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

