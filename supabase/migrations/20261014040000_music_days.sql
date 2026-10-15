-- Listening per day for the calendar: plays, minutes and the top artist of each local (Europe/Zurich) day.
-- Filled by the discovery-music Edge Function (stats.fm with real minutes, otherwise Last.fm plays).

create table public.music_days (
  user_id           uuid not null references auth.users (id) on delete cascade,
  day               date not null,
  plays             int not null check (plays >= 0),
  minutes           int check (minutes >= 0),
  minutes_estimated boolean not null default false,
  top_artist        text check (char_length(top_artist) <= 200),
  top_artist_plays  int check (top_artist_plays >= 0),
  source            text not null check (source in ('lastfm', 'statsfm')),
  updated_at        timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.music_days enable row level security;
revoke all on public.music_days from anon, authenticated;
grant select on public.music_days to authenticated;
create policy "own rows: read" on public.music_days for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Export (version 10): listening per day
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 10,
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
    'music_months', coalesce((select jsonb_agg(to_jsonb(mm) - 'user_id' order by mm.month)
      from public.music_months mm where mm.user_id = auth.uid()), '[]'::jsonb),
    'music_days', coalesce((select jsonb_agg(to_jsonb(md) - 'user_id' order by md.day)
      from public.music_days md where md.user_id = auth.uid()), '[]'::jsonb),
    'concert_log', coalesce((select jsonb_agg(to_jsonb(cl) - 'user_id' order by cl.local_date)
      from public.concert_log cl where cl.user_id = auth.uid()), '[]'::jsonb),
    'rotation_plan', (select to_jsonb(rp) - 'user_id' from public.rotation_plans rp where rp.user_id = auth.uid()),
    'catchup_plans', coalesce((select jsonb_agg(to_jsonb(cp) - 'user_id')
      from public.catchup_plans cp where cp.user_id = auth.uid()), '[]'::jsonb),
    'diary', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by d.watched_on, d.created_at)
      from public.diary_entries d where d.user_id = auth.uid()), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;
