-- Phase 6: genres on watchlist entries and feedback on recommendations.
alter table public.watchlist add column genre_ids int[];

-- 👍 / 👎 / ＋ on a feed entry. Adjusts the user's genre weights within [-1, 1]
-- (adjustments on top of what the ratings say) and remembers rejected titles.
create function public.feed_feedback(p_id uuid, p_action text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  f public.feed;
  w jsonb;
  g text;
  delta numeric;
begin
  if p_action not in ('like', 'dislike', 'add') then
    raise exception 'INVALID_ACTION';
  end if;
  update public.feed
     set status = case p_action when 'like' then 'liked' when 'dislike' then 'disliked' else 'added' end
   where id = p_id and user_id = auth.uid()
  returning * into f;
  if not found then
    raise exception 'FEED_NOT_FOUND';
  end if;

  delta := case p_action when 'like' then 0.1 when 'dislike' then -0.15 else 0.05 end;
  select case f.type when 'movie' then t.genre_weights_movie when 'tv' then t.genre_weights_tv else t.genre_weights_music end
    into w from public.taste_profile t where t.user_id = auth.uid();
  w := coalesce(w, '{}'::jsonb);
  for g in select jsonb_array_elements_text(coalesce(f.data -> 'genre_ids', '[]'::jsonb)) loop
    w := jsonb_set(w, array[g], to_jsonb(greatest(-1::numeric, least(1::numeric, coalesce((w ->> g)::numeric, 0) + delta))));
  end loop;

  update public.taste_profile t
     set genre_weights_movie = case when f.type = 'movie' then w else t.genre_weights_movie end,
         genre_weights_tv = case when f.type = 'tv' then w else t.genre_weights_tv end,
         genre_weights_music = case when f.type = 'album' then w else t.genre_weights_music end,
         rejected_ids = case
           when p_action = 'dislike' and not ((f.type || ':' || f.external_id) = any (t.rejected_ids))
             then array_append(t.rejected_ids, f.type || ':' || f.external_id)
           else t.rejected_ids end
   where t.user_id = auth.uid();

  return jsonb_build_object('status', f.status, 'weights', w);
end;
$$;

revoke execute on function public.feed_feedback(uuid, text) from public, anon;
grant execute on function public.feed_feedback(uuid, text) to authenticated;
