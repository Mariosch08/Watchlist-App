-- Security: no more "first user becomes admin" via public sign-up.
--  * Sign-up always needs a valid invite code, except users invited through the Supabase dashboard.
--  * Admin is granted only to a dashboard-invited user while no admin exists (only the project owner can do that).
--  * An advisory lock serializes sign-ups so two concurrent requests cannot both pass the checks.
create or replace function public.enforce_invite() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
begin
  perform pg_advisory_xact_lock(hashtext('watchlist-signup'));
  if new.invited_at is not null then
    return new;
  end if;
  v_code := public.normalize_invite_code(new.raw_user_meta_data ->> 'invite_code');
  if v_code is null then
    raise exception 'INVITE_REQUIRED';
  end if;
  update public.invites
     set uses = uses + 1, used_by = array_append(used_by, lower(new.email))
   where code = v_code and uses < max_uses and expires_at > now();
  if not found then
    raise exception 'INVITE_INVALID';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code';
  return new;
end;
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name, is_admin)
  values (
    new.id,
    lower(new.email),
    coalesce(nullif(left(split_part(coalesce(new.email, ''), '@', 1), 50), ''), 'Neuer Nutzer'),
    new.invited_at is not null and not exists (select 1 from public.profiles where is_admin)
  );
  insert into public.taste_profile (user_id) values (new.id);
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;
