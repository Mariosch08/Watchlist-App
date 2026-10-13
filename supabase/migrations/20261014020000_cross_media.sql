-- Cross-media features (D61–D67): Score Bridge, tonight's mood from listening, subscription rotation,
-- catch-up countdown, Life Reel, and overlaps with friends (concert buddies, shared screen).

-- ---------------------------------------------------------------------------
-- Settings: mood toggle, what I share with friends, my own streaming prices
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column music_mood boolean not null default true,
  add column share_music_with_friends boolean not null default false,
  add column share_services_with_friends boolean not null default false,
  add column streaming_prices jsonb not null default '{}'
    check (jsonb_typeof(streaming_prices) = 'object' and pg_column_size(streaming_prices) <= 4000);
grant update (music_mood, share_music_with_friends, share_services_with_friends, streaming_prices) on public.user_settings to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_season', 'new_episode', 'friend_request', 'friend_accepted', 'list_invite', 'recommendation',
                  'movie_night', 'digest', 'available', 'new_release', 'concert', 'catchup', 'other'));

-- ---------------------------------------------------------------------------
-- Subscription rotation: the plan I saved (the calendar turns it into reminders)
-- ---------------------------------------------------------------------------
create table public.rotation_plans (
  user_id  uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  months   jsonb not null check (jsonb_typeof(months) = 'array' and jsonb_array_length(months) between 1 and 6
                                 and pg_column_size(months) <= 20000),
  saved_at timestamptz not null default now()
);

alter table public.rotation_plans enable row level security;
revoke all on public.rotation_plans from anon, authenticated;
grant select, delete on public.rotation_plans to authenticated;
grant insert (months) on public.rotation_plans to authenticated;
grant update (months, saved_at) on public.rotation_plans to authenticated;
create policy "own rows" on public.rotation_plans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create function public.save_rotation_plan(p_months jsonb) returns void
language sql security invoker set search_path = '' as $$
  insert into public.rotation_plans (months) values (p_months)
  on conflict (user_id) do update set months = excluded.months, saved_at = now();
$$;

-- ---------------------------------------------------------------------------
-- Catch-up countdown: episodes per season, and the plan's starting point (for gentle nudges)
-- ---------------------------------------------------------------------------
alter table public.series_progress add column season_episodes int[]; -- [episodes of season 1, season 2, ...]

create table public.catchup_plans (
  user_id         uuid not null references auth.users (id) on delete cascade,
  tmdb_id         int not null,
  season_number   int not null check (season_number >= 1),
  premiere        date not null,
  behind_at_start int not null check (behind_at_start >= 0),
  per_week        int not null check (per_week between 1 and 50),
  started_on      date not null default current_date,
  dismissed       boolean not null default false,
  last_nudged_on  date,
  primary key (user_id, tmdb_id, season_number),
  foreign key (user_id, tmdb_id) references public.series_progress (user_id, tmdb_id) on delete cascade
);

alter table public.catchup_plans enable row level security;
revoke all on public.catchup_plans from anon, authenticated;
grant select on public.catchup_plans to authenticated;
grant update (dismissed) on public.catchup_plans to authenticated;
create policy "own rows: read" on public.catchup_plans for select to authenticated using (user_id = auth.uid());
create policy "own rows: dismiss" on public.catchup_plans for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop function public.series_overview();
create function public.series_overview()
returns table (
  tmdb_id int,
  title text,
  poster_path text,
  watch_status text,
  tmdb_status text,
  number_of_seasons int,
  number_of_episodes int,
  watched_count int,
  last_watched_at timestamptz,
  next_up_season int,
  next_up_episode int,
  next_episode_to_air jsonb,
  last_episode_to_air jsonb,
  started_at timestamptz,
  season_episodes int[],
  runtime int
)
language sql stable security invoker set search_path = '' as $$
  select sp.tmdb_id, w.title, w.poster_path, w.status, sp.tmdb_status, sp.number_of_seasons, sp.number_of_episodes,
         coalesce(e.watched, 0)::int, e.last_watched, sp.next_up_season, sp.next_up_episode,
         sp.next_episode_to_air, sp.last_episode_to_air, sp.created_at, sp.season_episodes, w.runtime
    from public.series_progress sp
    left join public.watchlist w on w.user_id = sp.user_id and w.media_type = 'tv' and w.tmdb_id = sp.tmdb_id
    left join lateral (
      select count(*) as watched, max(we.watched_at) as last_watched
        from public.watched_episodes we
       where we.user_id = sp.user_id and we.tmdb_id = sp.tmdb_id
    ) e on true
   where sp.user_id = auth.uid();
$$;
revoke execute on function public.series_overview() from public, anon;
grant execute on function public.series_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- Life Reel: listening per month, and concerts I went to
-- ---------------------------------------------------------------------------
create table public.music_months (
  user_id           uuid not null references auth.users (id) on delete cascade,
  month             date not null check (extract(day from month) = 1),
  plays             int not null check (plays >= 0),
  minutes           int check (minutes >= 0),
  minutes_estimated boolean not null default false,
  top_artist        text check (char_length(top_artist) <= 200),
  top_artist_plays  int check (top_artist_plays >= 0),
  top_track         text check (char_length(top_track) <= 300),
  top_track_artist  text check (char_length(top_track_artist) <= 200),
  source            text not null check (source in ('lastfm', 'statsfm')),
  updated_at        timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.music_months enable row level security;
revoke all on public.music_months from anon, authenticated;
grant select on public.music_months to authenticated;
create policy "own rows: read" on public.music_months for select to authenticated using (user_id = auth.uid());

create table public.concert_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_id   text check (char_length(event_id) <= 100),
  artist     text not null check (char_length(artist) between 1 and 200),
  local_date date not null check (local_date >= date '1950-01-01'),
  venue      text check (char_length(venue) <= 200),
  city       text check (char_length(city) <= 100),
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create unique index concert_log_event_idx on public.concert_log (user_id, event_id) where event_id is not null;
create index concert_log_user_date_idx on public.concert_log (user_id, local_date desc);

alter table public.concert_log enable row level security;
revoke all on public.concert_log from anon, authenticated;
grant select, delete on public.concert_log to authenticated;
grant insert (event_id, artist, local_date, venue, city, note) on public.concert_log to authenticated;
grant update (local_date, venue, city, note) on public.concert_log to authenticated;
create policy "own rows" on public.concert_log for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Friends: concert buddies and the shared screen of a movie night
-- ---------------------------------------------------------------------------
alter table public.concerts add column artist_key text check (char_length(artist_key) <= 200);
create index music_artists_key_idx on public.music_artists (artist_key);

-- Friends who also listen to the artist of one of my upcoming concerts. Both sides must share their music.
create function public.concert_buddies()
returns table (event_id text, artist text, local_date date, city text, friend_id uuid, display_name text)
language sql stable security definer set search_path = '' as $$
  select c.event_id, c.artist, c.local_date, c.city, m.user_id, p.display_name
    from public.concerts c
    join public.user_settings me on me.user_id = auth.uid() and me.share_music_with_friends
    join public.music_artists m on m.artist_key = c.artist_key and m.user_id <> auth.uid() and m.affinity >= 0.25
    join public.user_settings fs on fs.user_id = m.user_id and fs.share_music_with_friends
    join public.profiles p on p.id = m.user_id
   where c.user_id = auth.uid() and c.local_date >= current_date and public.is_friend(m.user_id)
   order by c.local_date, p.display_name;
$$;

-- Everybody in the list of a movie night: attending, their services (if shared) and which list titles
-- they have already seen (if they share ratings). Only for members; only friends' data is revealed.
create function public.night_screen(p_night uuid)
returns table (user_id uuid, display_name text, is_me boolean, attending boolean, providers int[], seen text[])
language sql stable security definer set search_path = '' as $$
  with night as (
    select n.id, n.list_id, n.chosen_option from public.movie_nights n
     where n.id = p_night and public.list_role(n.list_id) is not null
  )
  select lm.user_id,
         p.display_name,
         lm.user_id = auth.uid(),
         exists (select 1 from public.movie_night_votes v
                  where v.night_id = night.id and v.user_id = lm.user_id and v.available
                    and (night.chosen_option is null or v.option_index = night.chosen_option)),
         case when lm.user_id = auth.uid() or (s.share_services_with_friends and public.is_friend(lm.user_id))
              then s.streaming_providers end,
         case when lm.user_id = auth.uid() or (s.share_ratings_with_friends and public.is_friend(lm.user_id)) then
           array(select li.media_type || ':' || li.tmdb_id from public.list_items li
                  where li.list_id = night.list_id
                    and (exists (select 1 from public.watchlist w
                                  where w.user_id = lm.user_id and w.media_type = li.media_type and w.tmdb_id = li.tmdb_id
                                    and w.status = 'completed')
                         or exists (select 1 from public.diary_entries d
                                     where d.user_id = lm.user_id and d.media_type = li.media_type and d.tmdb_id = li.tmdb_id)))
         end
    from night
    join public.list_members lm on lm.list_id = night.list_id
    join public.profiles p on p.id = lm.user_id
    left join public.user_settings s on s.user_id = lm.user_id
   order by lm.user_id = auth.uid() desc, p.display_name;
$$;

revoke execute on function public.save_rotation_plan(jsonb), public.concert_buddies(), public.night_screen(uuid) from public, anon;
grant execute on function public.save_rotation_plan(jsonb), public.concert_buddies(), public.night_screen(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Export (version 9): rotation plan, catch-up plans, listening per month, concerts I went to
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 9,
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
