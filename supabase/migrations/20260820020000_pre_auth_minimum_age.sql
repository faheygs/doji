-- Auth can reject an ineligible signup before auth.users is created. The app
-- supplies an ISO birth date only during signup; profile creation performs the
-- final authoritative check and the assurance trigger removes that transient
-- metadata immediately afterward.
create or replace function public.hook_enforce_minimum_signup_age(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  birth_text text := event->'user'->'user_metadata'->>'birth_date';
  birth_date date;
  today_utc date := (clock_timestamp() at time zone 'UTC')::date;
begin
  if birth_text is null or birth_text !~ '^\d{4}-\d{2}-\d{2}$' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Enter a valid birthday before creating an account.'
      )
    );
  end if;

  begin
    birth_date := birth_text::date;
  exception when others then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Enter a valid birthday before creating an account.'
      )
    );
  end;

  if birth_date > today_utc
     or birth_date < (today_utc - interval '120 years')::date then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 400,
        'message', 'Enter a valid birthday before creating an account.'
      )
    );
  end if;

  if birth_date > (today_utc - interval '13 years')::date then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'You must be at least 13 to use Doji.'
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_enforce_minimum_signup_age(jsonb)
  to supabase_auth_admin;
revoke execute on function public.hook_enforce_minimum_signup_age(jsonb)
  from public, anon, authenticated;

create or replace function public.clear_verified_signup_birth_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'birth_date'
  where id = new.user_id
    and raw_user_meta_data->'birth_date' is not null;
  return new;
end;
$$;

revoke all on function public.clear_verified_signup_birth_date()
  from public, anon, authenticated;

drop trigger if exists clear_verified_signup_birth_date on public.age_assurances;
create trigger clear_verified_signup_birth_date
after insert or update of age_band on public.age_assurances
for each row execute function public.clear_verified_signup_birth_date();

comment on function public.hook_enforce_minimum_signup_age(jsonb) is
  'Before-user-created Auth hook: rejects missing, invalid, or under-13 birth dates.';
