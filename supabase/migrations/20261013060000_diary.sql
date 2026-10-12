-- Phase 10: film diary (when, where, with whom, rewatch) and imports from Letterboxd and Trakt.
-- Private collections are shared lists without other members (no extra tables).

create table public.diary_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type  text not null check (media_type in ('movie', 'tv')),
  tmdb_id     int not null check (tmdb_id > 0),
  title       text not null check (char_length(title) between 1 and 300),
  poster_path text check (char_length(poster_path) <= 200),
  watched_on  date not null check (watched_on >= date '1900-01-01'),
  place       text check (place in ('cinema', 'home', 'other')),
  with_whom   text check (char_length(with_whom) <= 200),
  note        text check (char_length(note) <= 2000),
  rating      smallint check (rating between 1 and 10),
  rewatch     boolean not null default false,
  import_ref  text check (import_ref in ('letterboxd')), -- null = entered by hand
  created_at  timestamptz not null default now(),
  -- Re-importing the same Letterboxd diary adds nothing twice; manual entries (null) are never deduplicated.
  unique (user_id, media_type, tmdb_id, watched_on, import_ref)
);

create index diary_user_date_idx on public.diary_entries (user_id, watched_on desc);

alter table public.diary_entries enable row level security;
revoke all on public.diary_entries from anon, authenticated;
grant select, delete on public.diary_entries to authenticated;
grant insert (media_type, tmdb_id, title, poster_path, watched_on, place, with_whom, note, rating, rewatch) on public.diary_entries to authenticated;
grant update (watched_on, place, with_whom, note, rating, rewatch) on public.diary_entries to authenticated;
create policy "own rows" on public.diary_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Imports from Letterboxd (CSV) and Trakt (JSON) use the existing import jobs.
alter table public.watchlist drop constraint watchlist_source_check;
alter table public.watchlist add constraint watchlist_source_check check (source in ('manual', 'imdb', 'letterboxd', 'trakt'));
alter table public.import_jobs drop constraint import_jobs_kind_check;
alter table public.import_jobs add constraint import_jobs_kind_check check (kind in (
  'imdb_watchlist', 'imdb_ratings', 'imdb_list', 'letterboxd_diary', 'letterboxd_ratings', 'letterboxd_watchlist',
  'trakt_ratings', 'trakt_watchlist', 'trakt_watched', 'unknown'));

-- Export includes the diary.
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 7,
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
    'diary', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by d.watched_on, d.created_at)
      from public.diary_entries d where d.user_id = auth.uid()), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

