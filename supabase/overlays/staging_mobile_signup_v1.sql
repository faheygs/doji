-- Staging-only admission, not a replacement for normal signup, confirmation or profile creation.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $$begin
 -- Installation identity only: member Auth never reads the portal realm at runtime.
 if not exists(select 1 from portal_identity_private.realms where realm='employee'
  and issuer='https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD'
  and audience='client_01M51GRQJVKXFZ98RG21MK7J64') then
  raise exception 'Verified staging database required';
 end if;
 if to_regprocedure('public.hook_enforce_minimum_signup_age(jsonb)') is null then
  raise exception 'Existing minimum-age hook required';
 end if;
end$$;

create schema staging_mobile_auth_private;
revoke all on schema staging_mobile_auth_private from public,anon,authenticated,service_role;
create table staging_mobile_auth_private.settings (
 id boolean primary key default true check(id),
 enabled boolean not null default false,
 recipient_prefix text check(recipient_prefix ~ '^[a-z0-9][a-z0-9._-]{0,39}[+]doji-stage-$'),
 check(not enabled or recipient_prefix is not null)
);
insert into staging_mobile_auth_private.settings(id) values(true);
alter table staging_mobile_auth_private.settings enable row level security;
revoke all on staging_mobile_auth_private.settings from public,anon,authenticated,service_role;

create function public.hook_staging_mobile_signup_v1(event jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prefix text; email text; suffix text;
 denied constant jsonb := '{"error":{"http_code":403,"message":"This staging environment accepts approved test email addresses only."}}';
begin
 select recipient_prefix into prefix from staging_mobile_auth_private.settings where id and enabled;
 if not found or jsonb_typeof(event->'user'->'email') is distinct from 'string' then
  return denied;
 end if;
 email := lower(event->'user'->>'email');
 if octet_length(email)>254 or octet_length(split_part(email,'@',1))>64
  or left(email,length(prefix))<>prefix
  or right(email,10)<>'@gmail.com' then return denied; end if;
 suffix := substr(email,length(prefix)+1,length(email)-length(prefix)-10);
 if suffix !~ '^[a-z0-9][a-z0-9-]{0,39}$' then return denied; end if;
 -- Preserve the maintained age check; legal acceptance remains enforced by profile creation.
 return public.hook_enforce_minimum_signup_age(event);
end$$;
revoke all on function public.hook_staging_mobile_signup_v1(jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hook_staging_mobile_signup_v1(jsonb) to supabase_auth_admin;
commit;
