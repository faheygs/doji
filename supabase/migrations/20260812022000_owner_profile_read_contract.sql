-- New clients read the complete account row only through this owner-scoped
-- contract. Public surfaces request an explicit public column allowlist.
create or replace function public.get_own_profile()
returns public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select profile
  from public.profiles profile
  where profile.id = auth.uid();
$$;

revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.get_own_profile() to authenticated;

-- Preserve compatibility for installed builds while preventing this legacy
-- SECURITY DEFINER lookup from returning account-only fields for another user.
create or replace function public.get_profile_by_username(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.profiles%rowtype;
begin
  select profile.* into result
  from public.profiles profile
  where lower(profile.username) = lower(trim(p_username))
  limit 1;

  if result.id is null then return null; end if;
  if result.id = auth.uid() then return to_jsonb(result); end if;
  return to_jsonb(result) - array[
    'notification_token', 'notification_preferences', 'sparks',
    'streak_shields', 'timezone', 'app_theme', 'appearance_mode',
    'onboarding_completed_at'
  ];
end;
$$;

revoke all on function public.get_profile_by_username(text) from public, anon;
grant execute on function public.get_profile_by_username(text) to authenticated;
