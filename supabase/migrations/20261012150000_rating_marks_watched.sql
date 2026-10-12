-- Phase 3b: one rule for status, rating and watch date (mirrored by frontend/src/lib/watchlistRules.js).
--  * Rating a planned title marks it as watched (series you are watching stay open).
--  * Moving a title back to "planned" clears its watch date.
create or replace function public.watchlist_before_write() returns trigger
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
  if tg_op = 'UPDATE' and old.my_rating is null and new.my_rating is not null
     and old.status = 'planned' and new.status = 'planned' then
    new.status := 'completed';
  end if;
  if new.status = 'completed' and new.watched_at is null then
    new.watched_at := now();
  end if;
  if tg_op = 'UPDATE' and new.status = 'planned' and old.status <> 'planned' then
    new.watched_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
