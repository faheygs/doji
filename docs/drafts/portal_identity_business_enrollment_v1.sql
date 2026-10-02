-- LOCAL ONLY: not a migration, public endpoint or production admission switch.
-- Post-verification completion primitive. Provider signup/mail/anti-abuse and
-- reservation orchestration must be qualified separately before exposing it.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create role doji_business_enrollment nologin noinherit;
grant usage on schema portal_identity_private to doji_business_enrollment;
create table portal_identity_private.business_enrollment_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 admission_until timestamptz,
 account_limit integer not null default 0 check(account_limit between 0 and 100),
 accounts_used integer not null default 0 check(accounts_used>=0)
);
insert into portal_identity_private.business_enrollment_settings(singleton) values(true);
create table portal_identity_private.business_enrollment_receipts (
 subject text primary key,
 principal_id uuid not null unique references portal_identity_private.principals(id),
 terms_version text not null,
 privacy_version text not null,
 country text not null check(country='US'),
 completed_at timestamptz not null default clock_timestamp()
);
alter table portal_identity_private.business_enrollment_settings enable row level security;
alter table portal_identity_private.business_enrollment_receipts enable row level security;
revoke all on portal_identity_private.business_enrollment_settings,portal_identity_private.business_enrollment_receipts
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_business_enrollment;

-- Trusted registrar supplies an identity verified by the pinned business verifier.
-- Browser cannot call this schema, select a principal UUID, or map an existing ID.
-- Email is intentionally absent: no member/employee lookup or same-email collision.
create function portal_identity_private.complete_business_enrollment(
 p_issuer text,p_audience text,p_subject text,p_session text,
 p_terms_accepted boolean,p_privacy_acknowledged boolean,
 p_terms_version text,p_privacy_version text,p_country text
) returns uuid language plpgsql security definer set search_path='' as $$
declare cfg portal_identity_private.business_enrollment_settings%rowtype;
 legal business_private.settings%rowtype;
 prior portal_identity_private.business_enrollment_receipts%rowtype;
 principal uuid;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Enrollment requires read committed isolation'; end if;
 if p_subject is null or p_subject !~ '^user_[A-Za-z0-9]{1,80}$'
  or p_session is null or p_session !~ '^session_[A-Za-z0-9]{1,80}$'
  or p_terms_accepted is distinct from true or p_privacy_acknowledged is distinct from true
  or p_country is distinct from 'US' then
  raise exception using errcode='22023',message='Verified US business and explicit agreements required'; end if;
 -- Match bind_identity's realm-first lock order. This small, capped registration
 -- path serializes only this new directory; member Auth is never involved.
 perform 1 from portal_identity_private.realms where realm='business' and enabled
  and issuer=p_issuer and audience=p_audience for update;
 if not found then raise exception using errcode='42501',message='Business directory unavailable'; end if;
 select * into cfg from portal_identity_private.business_enrollment_settings where singleton for update;
 if not found or cfg.enabled is distinct from true then raise exception using errcode='42501',message='Business enrollment unavailable'; end if;
 select * into legal from business_private.settings where singleton for share;
 if not legal.enabled or p_terms_version is distinct from legal.application_terms_version
  or p_privacy_version is distinct from legal.privacy_version
  or legal.application_terms_version is null or legal.privacy_version is null then
  raise exception using errcode='22023',message='Current business agreements required'; end if;
 select * into prior from portal_identity_private.business_enrollment_receipts where subject=p_subject;
 if found then
  if (prior.terms_version,prior.privacy_version,prior.country) is distinct from
    (p_terms_version,p_privacy_version,p_country) then
   raise exception using errcode='PT409',message='Enrollment agreement changed'; end if;
  -- Replays never re-enable a closed identity or overwrite its original consent.
  select principal_id into strict principal from portal_identity_private.resolve_identity(
   'business',p_issuer,p_audience,p_subject,p_session,false);
  perform 1 from business_private.accounts where id=principal and not disabled for share;
  if not found then raise exception using errcode='42501',message='Business account unavailable'; end if;
  return principal;
 end if;
 if cfg.admission_until is null or cfg.admission_until<=clock_timestamp()
  or cfg.accounts_used>=cfg.account_limit then
  raise exception using errcode='42501',message='New business enrollment paused'; end if;
 if exists(select 1 from portal_identity_private.identities where realm='business' and subject=p_subject) then
  raise exception using errcode='42501',message='Existing identity requires reviewed migration'; end if;
 principal:=gen_random_uuid();
 perform portal_identity_private.bind_identity('business',p_subject,principal,'new-business-enrollment');
 insert into business_private.accounts(id) values(principal);
 insert into business_private.signup_agreements(account_id,terms_version,privacy_version)
 values(principal,p_terms_version,p_privacy_version);
 insert into portal_identity_private.business_enrollment_receipts(subject,principal_id,terms_version,privacy_version,country)
 values(p_subject,principal,p_terms_version,p_privacy_version,p_country);
 perform portal_identity_private.set_principal_state(principal,1,'active','verified-business-enrollment');
 update portal_identity_private.business_enrollment_settings set accounts_used=accounts_used+1 where singleton;
 -- Active identity permits an application, not an approved organization/workspace.
 return principal;
end$$;
revoke all on function portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_business_enrollment;
grant execute on function portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)
 to doji_business_enrollment;
do $$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','auth','business_private','portal_identity_private') and p.prokind='f'
    and has_function_privilege('doji_business_enrollment',p.oid,'execute')
    and not has_function_privilege('doji_identity_resolver',p.oid,'execute')
    and p.oid<>'portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)'::regprocedure) then
  raise exception 'Enrollment role has unexpected function access'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('public','storage','auth','business_private','portal_identity_private')
    and c.relkind in('r','v','m','p','f')
    and has_table_privilege('doji_business_enrollment',c.oid,'select,insert,update,delete,truncate,references,trigger')) then
  raise exception 'Enrollment role has unexpected table access'; end if;
end$$;
-- No LOGIN, authenticator membership, seed realms, credentials or enabled flags.
commit;
