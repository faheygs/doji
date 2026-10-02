-- LOCAL PREPARATION ONLY. Install after the business foundation; no deployment authorization.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.signup_agreements (
 account_id uuid primary key,
 terms_version text not null,
 privacy_version text not null,
 accepted_at timestamptz not null default clock_timestamp()
);
alter table business_private.signup_agreements enable row level security;
revoke all on business_private.signup_agreements from public,anon,authenticated,doji_employee,doji_business,service_role;

create function public.check_business_signup_legal_v1(p_terms_version text,p_privacy_version text)
returns boolean language plpgsql security definer set search_path='' as $$begin
 perform business_private.assert_enabled();
 return exists(select 1 from business_private.settings where singleton
  and application_terms_version=p_terms_version and privacy_version=p_privacy_version);
end$$;

create function business_private.record_signup_agreement() returns trigger
language plpgsql security definer set search_path='' as $$
declare s business_private.settings%rowtype; agreement jsonb; u auth.users%rowtype;
begin
 -- The trigger WHEN clause excludes member/employee accounts entirely.
 -- Read final transactional state: Auth assigns role and app metadata separately.
 select * into u from auth.users where id=new.id;
 if not found or u.role is distinct from 'doji_business' then return new; end if;
 if u.raw_app_meta_data->>'account_type' is distinct from 'business' then
  raise exception using errcode='42501',message='Business account type required'; end if;
 if exists(select 1 from public.profiles where id=new.id) or exists(select 1 from public.admin_employees where id=new.id) then
  raise exception using errcode='42501',message='Separate business identity required'; end if;
 if exists(select 1 from business_private.signup_agreements where account_id=new.id) then return new; end if;
 select * into s from business_private.settings where singleton for share;
 agreement:=u.raw_app_meta_data->'business_signup';
 if not s.enabled or s.application_terms_version is null or s.privacy_version is null
   or agreement->'terms_accepted' is distinct from 'true'::jsonb
   or agreement->'privacy_acknowledged' is distinct from 'true'::jsonb
   or agreement->>'terms_version' is distinct from s.application_terms_version
   or agreement->>'privacy_version' is distinct from s.privacy_version then
  raise exception using errcode='22023',message='Current business signup agreement required'; end if;
 -- Failure rolls back Auth creation too: no partial account/consent pair.
 insert into business_private.signup_agreements(account_id,terms_version,privacy_version)
 values(new.id,s.application_terms_version,s.privacy_version);
 return new;
end$$;
-- Auth may INSERT under its default role then UPDATE to the custom role in the
-- same creation transaction. Cover both without running for ordinary member writes.
create constraint trigger business_signup_agreement after insert or update of role,raw_app_meta_data on auth.users
deferrable initially deferred
for each row when (new.role='doji_business') execute function business_private.record_signup_agreement();
revoke all on function business_private.record_signup_agreement(),public.check_business_signup_legal_v1(text,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role;
grant execute on function public.check_business_signup_legal_v1(text,text) to service_role;
commit;
