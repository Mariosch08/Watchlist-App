-- Phase 7: availability alerts ("tell me when it's on my services").
create table public.availability_alerts (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  media_type   text not null check (media_type in ('movie', 'tv')),
  tmdb_id      int not null check (tmdb_id > 0),
  title        text not null check (char_length(title) between 1 and 300),
  provider_ids int[], -- null = any of my streaming services
  created_at   timestamptz not null default now(),
  notified_at  timestamptz,
  primary key (user_id, media_type, tmdb_id)
);

alter table public.availability_alerts enable row level security;
revoke all on public.availability_alerts from anon, authenticated;
grant select, delete on public.availability_alerts to authenticated;
grant insert (media_type, tmdb_id, title, provider_ids) on public.availability_alerts to authenticated;
create policy "own rows" on public.availability_alerts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- New notification type for availability alerts.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_season', 'new_episode', 'friend_request', 'list_invite', 'digest', 'available', 'other'));

-- Export includes the alerts.
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 4,
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
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

