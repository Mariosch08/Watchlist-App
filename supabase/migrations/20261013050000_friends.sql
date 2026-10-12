-- Phase 9: friends, shared lists, recommendations between friends, movie nights, activity feed.
-- Other people's profiles stay unreadable (they contain e-mail addresses); the security-definer
-- functions below return only display name and username, and only for friends or list co-members.

alter table public.user_settings add column share_activity boolean not null default false;
grant update (share_activity) on public.user_settings to authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('new_season', 'new_episode', 'friend_request', 'friend_accepted', 'list_invite', 'recommendation',
                  'movie_night', 'digest', 'available', 'new_release', 'concert', 'other'));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function public.is_friend(p_other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = auth.uid() and f.addressee_id = p_other) or (f.requester_id = p_other and f.addressee_id = auth.uid()))
  );
$$;

create function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_data jsonb, p_dedupe text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, data, dedupe_key)
  values (p_user, p_type, left(p_title, 200), left(p_body, 2000), coalesce(p_data, '{}'), p_dedupe)
  on conflict (user_id, dedupe_key) do nothing;
$$;

create function public.my_display_name() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(p.display_name, 'Jemand') from public.profiles p where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Friendships
-- ---------------------------------------------------------------------------
-- Send a request by username ("@mario" or "mario") or exact e-mail. Answers 'sent', 'pending',
-- 'accepted' (they had already asked me) or 'already_friends'. A decline is never revealed.
create function public.send_friend_request(p_handle text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_handle text := lower(trim(coalesce(p_handle, '')));
  v_other uuid;
  v_row public.friendships;
begin
  if v_me is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_handle = '' or char_length(v_handle) > 320 then raise exception 'USER_NOT_FOUND'; end if;
  select p.id into v_other from public.profiles p
   where p.username = ltrim(v_handle, '@') or (position('@' in v_handle) > 1 and p.email = v_handle)
   limit 1;
  if v_other is null or v_other = v_me then raise exception 'USER_NOT_FOUND'; end if;

  select * into v_row from public.friendships f
   where (f.requester_id = v_me and f.addressee_id = v_other) or (f.requester_id = v_other and f.addressee_id = v_me);
  if found then
    if v_row.status = 'accepted' then return 'already_friends'; end if;
    if v_row.requester_id = v_me then return 'pending'; end if;
    if v_row.status = 'pending' then
      update public.friendships set status = 'accepted', responded_at = now()
       where requester_id = v_other and addressee_id = v_me;
      perform public.notify(v_other, 'friend_accepted', public.my_display_name() || ' ist jetzt mit dir befreundet', null,
        jsonb_build_object('path', '/friends'), 'friend:' || v_me);
      return 'accepted';
    end if;
    -- I declined them earlier and now ask myself: start over in my direction.
    delete from public.friendships where requester_id = v_other and addressee_id = v_me;
  end if;

  if (select count(*) from public.friendships where requester_id = v_me and status = 'pending') >= 20 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  insert into public.friendships (requester_id, addressee_id) values (v_me, v_other);
  perform public.notify(v_other, 'friend_request', public.my_display_name() || ' möchte mit dir befreundet sein', null,
    jsonb_build_object('path', '/friends'), 'friend-request:' || v_me || ':' || extract(epoch from now())::bigint);
  return 'sent';
end;
$$;

create function public.respond_friend_request(p_requester uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.friendships
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where requester_id = p_requester and addressee_id = auth.uid() and status = 'pending';
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if p_accept then
    perform public.notify(p_requester, 'friend_accepted', public.my_display_name() || ' hat deine Freundschaftsanfrage angenommen', null,
      jsonb_build_object('path', '/friends'), 'friend:' || auth.uid());
  end if;
end;
$$;

-- Friends and open requests with names and taste match (only when both share their ratings).
create function public.friends_overview()
returns table (user_id uuid, display_name text, username text, status text, incoming boolean, since timestamptz,
               common_rated int, match_percent int)
language sql stable security definer set search_path = '' as $$
  with rel as (
    select case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end as other,
           f.status, f.addressee_id = auth.uid() as incoming, coalesce(f.responded_at, f.created_at) as since
      from public.friendships f
     where auth.uid() in (f.requester_id, f.addressee_id)
  ),
  sharing as (
    select coalesce((select s.share_ratings_with_friends from public.user_settings s where s.user_id = auth.uid()), false) as me
  )
  select r.other, p.display_name, p.username,
         case when r.status = 'declined' then 'pending' else r.status end,
         r.incoming, r.since, m.common, m.pct
    from rel r
    join public.profiles p on p.id = r.other
    cross join sharing
    left join lateral (
      select count(*)::int as common,
             case when count(*) >= 3 then round(100 * (1 - avg(abs(a.my_rating - b.my_rating)) / 9.0))::int end as pct
        from public.watchlist a
        join public.watchlist b on b.user_id = r.other and b.media_type = a.media_type and b.tmdb_id = a.tmdb_id
       where a.user_id = auth.uid() and a.my_rating is not null and b.my_rating is not null
    ) m on r.status = 'accepted' and sharing.me
       and coalesce((select s.share_ratings_with_friends from public.user_settings s where s.user_id = r.other), false)
   where not (r.status = 'declined' and r.incoming)
   order by r.status = 'accepted', p.display_name;
$$;

-- "Wer hat es gesehen?" on the detail page: friends who share their ratings.
create function public.friends_on_title(p_media_type text, p_tmdb_id int)
returns table (user_id uuid, display_name text, status text, my_rating int, watched_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.user_id, p.display_name, w.status, w.my_rating::int, w.watched_at
    from public.watchlist w
    join public.profiles p on p.id = w.user_id
    join public.user_settings s on s.user_id = w.user_id and s.share_ratings_with_friends
   where w.media_type = p_media_type and w.tmdb_id = p_tmdb_id and public.is_friend(w.user_id)
   order by w.my_rating desc nulls last, p.display_name;
$$;

-- Recent activity of friends who opted in (added, watched, rated in the last 30 days).
create function public.friend_activity(p_limit int default 30)
returns table (user_id uuid, display_name text, kind text, media_type text, tmdb_id int, title text,
               poster_path text, my_rating int, at timestamptz)
language sql stable security definer set search_path = '' as $$
  select w.user_id, p.display_name,
         case when w.rated_at is not null and w.rated_at >= greatest(w.added_at, coalesce(w.watched_at, w.added_at)) then 'rated'
              when w.watched_at is not null and w.watched_at >= w.added_at then 'watched'
              else 'added' end,
         w.media_type, w.tmdb_id, w.title, w.poster_path, w.my_rating::int,
         greatest(w.added_at, coalesce(w.rated_at, w.added_at), coalesce(w.watched_at, w.added_at))
    from public.watchlist w
    join public.profiles p on p.id = w.user_id
    join public.user_settings s on s.user_id = w.user_id and s.share_activity
   where public.is_friend(w.user_id)
     and greatest(w.added_at, coalesce(w.rated_at, w.added_at), coalesce(w.watched_at, w.added_at)) > now() - interval '30 days'
   order by 9 desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

-- ---------------------------------------------------------------------------
-- "Schau das!" – recommend a title to a friend
-- ---------------------------------------------------------------------------
create table public.friend_recommendations (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  media_type   text not null check (media_type in ('movie', 'tv')),
  tmdb_id      int not null check (tmdb_id > 0),
  title        text not null check (char_length(title) between 1 and 300),
  poster_path  text check (char_length(poster_path) <= 200),
  release_date text check (char_length(release_date) <= 20),
  message      text check (char_length(message) <= 280),
  status       text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  created_at   timestamptz not null default now(),
  unique (from_user, to_user, media_type, tmdb_id)
);

alter table public.friend_recommendations enable row level security;
revoke all on public.friend_recommendations from anon, authenticated;
grant select, delete on public.friend_recommendations to authenticated;
grant update (status) on public.friend_recommendations to authenticated;
create policy "parties: read" on public.friend_recommendations for select to authenticated
  using (auth.uid() in (from_user, to_user));
create policy "recipient: answer" on public.friend_recommendations for update to authenticated
  using (to_user = auth.uid()) with check (to_user = auth.uid());
create policy "parties: remove" on public.friend_recommendations for delete to authenticated
  using (auth.uid() in (from_user, to_user));

create function public.recommend_title(p_friend uuid, p_media_type text, p_tmdb_id int, p_title text,
                                       p_poster_path text, p_release_date text, p_message text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_friend(p_friend) then raise exception 'NOT_FRIENDS'; end if;
  if (select count(*) from public.friend_recommendations r
       where r.from_user = auth.uid() and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'TOO_MANY_REQUESTS';
  end if;
  insert into public.friend_recommendations (from_user, to_user, media_type, tmdb_id, title, poster_path, release_date, message)
  values (auth.uid(), p_friend, p_media_type, p_tmdb_id, p_title, p_poster_path, p_release_date, nullif(trim(p_message), ''))
  on conflict (from_user, to_user, media_type, tmdb_id)
  do update set message = excluded.message, status = 'new', created_at = now();
  perform public.notify(p_friend, 'recommendation', public.my_display_name() || ' empfiehlt dir „' || p_title || '“',
    nullif(trim(p_message), ''), jsonb_build_object('media_type', p_media_type, 'tmdb_id', p_tmdb_id),
    'rec:' || auth.uid() || ':' || p_media_type || ':' || p_tmdb_id || ':' || extract(epoch from now())::bigint);
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared lists: only friends can be added; members see each other's names; invitees are notified
-- ---------------------------------------------------------------------------
drop policy "owner: add" on public.list_members;
create policy "owner: add friends" on public.list_members for insert to authenticated
  with check (public.list_role(list_id) = 'owner' and role <> 'owner' and public.is_friend(user_id));

create function public.list_people(p_list_id uuid)
returns table (user_id uuid, display_name text, username text, role text)
language sql stable security definer set search_path = '' as $$
  select m.user_id, p.display_name, p.username, m.role
    from public.list_members m join public.profiles p on p.id = m.user_id
   where m.list_id = p_list_id and public.list_role(p_list_id) is not null
   order by m.role = 'owner' desc, p.display_name;
$$;

create function public.list_member_added() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role <> 'owner' then
    perform public.notify(new.user_id, 'list_invite',
      public.my_display_name() || ' hat dich zur Liste „' || (select l.name from public.shared_lists l where l.id = new.list_id) || '“ hinzugefügt',
      null, jsonb_build_object('path', '/lists/' || new.list_id), 'list:' || new.list_id);
  end if;
  return new;
end;
$$;

create trigger list_member_added after insert on public.list_members
  for each row execute function public.list_member_added();

-- ---------------------------------------------------------------------------
-- Movie nights: date poll inside a shared list; the title comes from the list's votes
-- ---------------------------------------------------------------------------
create table public.movie_nights (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references public.shared_lists (id) on delete cascade,
  created_by        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title             text not null check (char_length(title) between 1 and 80),
  options           timestamptz[] not null check (cardinality(options) between 1 and 6),
  chosen_option     smallint check (chosen_option between 0 and 5),
  chosen_media_type text check (chosen_media_type in ('movie', 'tv')),
  chosen_tmdb_id    int check (chosen_tmdb_id > 0),
  created_at        timestamptz not null default now()
);

create table public.movie_night_votes (
  night_id     uuid not null references public.movie_nights (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  option_index smallint not null check (option_index between 0 and 5),
  available    boolean not null,
  primary key (night_id, user_id, option_index)
);

create function public.night_list(p_night uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select n.list_id from public.movie_nights n where n.id = p_night;
$$;

alter table public.movie_nights enable row level security;
alter table public.movie_night_votes enable row level security;
revoke all on public.movie_nights, public.movie_night_votes from anon, authenticated;
grant select, delete on public.movie_nights to authenticated;
grant insert (list_id, title, options) on public.movie_nights to authenticated;
grant update (chosen_option, chosen_media_type, chosen_tmdb_id) on public.movie_nights to authenticated;
grant select, delete on public.movie_night_votes to authenticated;
grant insert (night_id, option_index, available) on public.movie_night_votes to authenticated;
grant update (available) on public.movie_night_votes to authenticated;

create policy "members: read" on public.movie_nights for select to authenticated
  using (public.list_role(list_id) is not null);
create policy "editors: plan" on public.movie_nights for insert to authenticated
  with check (created_by = auth.uid() and public.list_role(list_id) in ('owner', 'editor'));
create policy "host or owner: decide" on public.movie_nights for update to authenticated
  using (created_by = auth.uid() or public.list_role(list_id) = 'owner')
  with check (created_by = auth.uid() or public.list_role(list_id) = 'owner');
create policy "host or owner: delete" on public.movie_nights for delete to authenticated
  using (created_by = auth.uid() or public.list_role(list_id) = 'owner');

create policy "members: read" on public.movie_night_votes for select to authenticated
  using (public.list_role(public.night_list(night_id)) is not null);
create policy "members: own vote" on public.movie_night_votes for insert to authenticated
  with check (user_id = auth.uid() and public.list_role(public.night_list(night_id)) is not null);
create policy "members: change own vote" on public.movie_night_votes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.list_role(public.night_list(night_id)) is not null);
create policy "members: remove own vote" on public.movie_night_votes for delete to authenticated
  using (user_id = auth.uid());

-- Tell the other members when a movie night is planned and when it is fixed.
create function public.movie_night_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  for m in select lm.user_id from public.list_members lm where lm.list_id = new.list_id and lm.user_id <> auth.uid() loop
    if tg_op = 'INSERT' then
      perform public.notify(m.user_id, 'movie_night', 'Filmabend „' || new.title || '“: Wann hast du Zeit?', null,
        jsonb_build_object('path', '/lists/' || new.list_id), 'night:' || new.id);
    elsif new.chosen_option is not null and new.chosen_option is distinct from old.chosen_option then
      perform public.notify(m.user_id, 'movie_night',
        'Filmabend „' || new.title || '“ steht: ' || to_char(new.options[new.chosen_option + 1] at time zone 'Europe/Zurich', 'DD.MM.YYYY HH24:MI'),
        null, jsonb_build_object('path', '/lists/' || new.list_id), 'night-fixed:' || new.id || ':' || new.chosen_option);
    end if;
  end loop;
  return new;
end;
$$;

create trigger movie_night_changed after insert or update on public.movie_nights
  for each row execute function public.movie_night_changed();

-- Votes as one call (insert or change); runs with the caller's rights, so grants and RLS apply.
create function public.cast_vote(p_list_id uuid, p_media_type text, p_tmdb_id int, p_vote smallint) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if p_vote = 0 then
    delete from public.list_votes
     where list_id = p_list_id and media_type = p_media_type and tmdb_id = p_tmdb_id and user_id = auth.uid();
  else
    insert into public.list_votes (list_id, media_type, tmdb_id, vote) values (p_list_id, p_media_type, p_tmdb_id, p_vote)
    on conflict (list_id, media_type, tmdb_id, user_id) do update set vote = excluded.vote;
  end if;
end;
$$;

create function public.set_availability(p_night_id uuid, p_option smallint, p_available boolean) returns void
language sql security invoker set search_path = '' as $$
  insert into public.movie_night_votes (night_id, option_index, available) values (p_night_id, p_option, p_available)
  on conflict (night_id, user_id, option_index) do update set available = excluded.available;
$$;

-- ---------------------------------------------------------------------------
-- Privileges for the new functions
-- ---------------------------------------------------------------------------
revoke execute on function public.is_friend(uuid), public.notify(uuid, text, text, text, jsonb, text), public.my_display_name(),
  public.send_friend_request(text), public.respond_friend_request(uuid, boolean), public.friends_overview(),
  public.friends_on_title(text, int), public.friend_activity(int),
  public.recommend_title(uuid, text, int, text, text, text, text), public.list_people(uuid), public.night_list(uuid),
  public.list_member_added(), public.movie_night_changed(), public.cast_vote(uuid, text, int, smallint),
  public.set_availability(uuid, smallint, boolean)
  from public, anon;
grant execute on function public.is_friend(uuid), public.send_friend_request(text), public.respond_friend_request(uuid, boolean),
  public.friends_overview(), public.friends_on_title(text, int), public.friend_activity(int),
  public.recommend_title(uuid, text, int, text, text, text, text), public.list_people(uuid), public.night_list(uuid),
  public.cast_vote(uuid, text, int, smallint), public.set_availability(uuid, smallint, boolean)
  to authenticated;

-- Export includes recommendations and movie nights.
create or replace function public.export_my_data() returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'format', 'watchlist-app-export',
    'version', 6,
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
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) - 'user_id')
      from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb)
  );
$$;

