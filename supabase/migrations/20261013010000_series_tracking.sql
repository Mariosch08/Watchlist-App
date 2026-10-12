-- Phase 5: series tracking, calendar feed, notification dedupe.

-- Calendar feed token (secret link for calendar apps) and spoiler protection setting.
alter table public.user_settings
  add column calendar_token uuid not null default gen_random_uuid(),
  add column hide_spoilers boolean not null default true;
create unique index user_settings_calendar_token_idx on public.user_settings (calendar_token);
grant update (hide_spoilers) on public.user_settings to authenticated;

create function public.regenerate_calendar_token() returns uuid
language sql volatile security definer set search_path = '' as $$
  update public.user_settings set calendar_token = gen_random_uuid()
   where user_id = auth.uid()
  returning calendar_token;
$$;

-- The daily series check must not create the same notification twice.
alter table public.notifications add column dedupe_key text check (char_length(dedupe_key) <= 200);
create unique index notifications_dedupe_idx on public.notifications (user_id, dedupe_key);

-- One row per tracked series with title, progress and next episode (runs with the caller's rights).
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
  started_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select sp.tmdb_id, w.title, w.poster_path, w.status, sp.tmdb_status, sp.number_of_seasons, sp.number_of_episodes,
         coalesce(e.watched, 0)::int, e.last_watched, sp.next_up_season, sp.next_up_episode,
         sp.next_episode_to_air, sp.last_episode_to_air, sp.created_at
    from public.series_progress sp
    left join public.watchlist w on w.user_id = sp.user_id and w.media_type = 'tv' and w.tmdb_id = sp.tmdb_id
    left join lateral (
      select count(*) as watched, max(we.watched_at) as last_watched
        from public.watched_episodes we
       where we.user_id = sp.user_id and we.tmdb_id = sp.tmdb_id
    ) e on true
   where sp.user_id = auth.uid();
$$;

revoke execute on function public.regenerate_calendar_token(), public.series_overview() from public, anon;
grant execute on function public.regenerate_calendar_token(), public.series_overview() to authenticated;

-- Export: never include the secret calendar token.
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 3,
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
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

