-- Username discovery must not bypass the safe profile API contract or expose a
-- row identifier. The unique index remains authoritative at account creation.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then false
    when lower(trim(coalesce(p_username, ''))) !~ '^[a-z0-9_]{3,20}$' then false
    else not exists (
      select 1
      from public.profiles profile
      where profile.username = lower(trim(p_username))
        and profile.id <> auth.uid()
    )
  end;
$$;

revoke all on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;

comment on function public.is_username_available(text) is
  'Returns availability only; profile identifiers and private fields are never exposed.';
