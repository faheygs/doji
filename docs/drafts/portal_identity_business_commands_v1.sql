-- LOCAL ONLY. Not an automatic migration. No provider/portal activation.
-- Shared command extraction is guarded against source drift and keeps one core.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table portal_identity_private.business_command_settings(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into portal_identity_private.business_command_settings(singleton) values(true);
create table portal_identity_private.command_restore(
 singleton boolean primary key default true check(singleton),
 prior_definition text not null,
 installed_definition text
);
alter table portal_identity_private.business_command_settings enable row level security;
alter table portal_identity_private.command_restore enable row level security;
revoke all on portal_identity_private.business_command_settings,portal_identity_private.command_restore
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;

-- Reuse the existing atomic command body unchanged apart from actor acquisition.
-- No email identity lookup, member token minting or multiple client writes.
do $extract$declare src text; begin
 select replace(p.prosrc,E'\r','') into src from pg_proc p
 where p.oid='public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure
  and p.prosecdef and p.prorettype='jsonb'::regtype
  and p.prolang=(select oid from pg_language where lanname='plpgsql');
 if src is null or md5(src)<>'349e1f822ec537cd63e869e0f70e5a9d' then
  raise exception 'Business command source changed; review before extraction'; end if;
 insert into portal_identity_private.command_restore(singleton,prior_definition)
 values(true,pg_get_functiondef('public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure));
 src:=replace(src,'uid:=business_private.business_actor(true); -- actor row serializes all its commands',
  'uid:=p_actor; -- caller has already authorized and locked this actor');
 execute format('create function portal_identity_private.business_application_core(p_actor uuid,p_action text,p_revision bigint,p_details jsonb,p_terms_version text,p_privacy_version text,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='''' as %L',src);
end$extract$;
revoke all on function portal_identity_private.business_application_core(uuid,text,bigint,jsonb,text,text,uuid)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;

-- Existing users retain their exact Auth checks, account lock and command grants.
create or replace function public.business_application_command_v1(p_action text,p_revision bigint,p_details jsonb,
 p_terms_version text,p_privacy_version text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$declare uid uuid; begin
 uid:=business_private.business_actor(true);
 return portal_identity_private.business_application_core(uid,p_action,p_revision,p_details,p_terms_version,p_privacy_version,p_request_id);
end$$;
update portal_identity_private.command_restore set installed_definition=
 pg_get_functiondef('public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure) where singleton;

-- Dedicated verifier only; browser cannot choose actor UUID or access this schema.
create function portal_identity_private.business_application_command(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,
 p_action text,p_revision bigint,p_details jsonb,p_terms_version text,p_privacy_version text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; account business_private.accounts%rowtype;
begin
 perform 1 from portal_identity_private.business_command_settings where singleton and enabled for share;
 if not found then raise exception using errcode='42501',message='External business commands unavailable'; end if;
 select principal_id into strict uid from portal_identity_private.resolve_identity('business',p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform business_private.assert_enabled();
 if exists(select 1 from public.profiles where id=uid) or exists(select 1 from public.admin_employees where id=uid) then
  raise exception using errcode='42501',message='Separate business principal required'; end if;
 -- Signup/legal integration must have committed a reviewed agreement first.
 if not exists(select 1 from business_private.signup_agreements where account_id=uid) then
  raise exception using errcode='42501',message='Business signup agreement required'; end if;
 insert into business_private.accounts(id) values(uid) on conflict do nothing;
 -- Acquire exclusive actor lock directly; do not upgrade the read bridge's
 -- shared account lock (two simultaneous upgrades could deadlock).
 select * into strict account from business_private.accounts where id=uid for update;
 if account.disabled then raise exception using errcode='42501',message='Business access disabled'; end if;
 return portal_identity_private.business_application_core(uid,p_action,p_revision,p_details,p_terms_version,p_privacy_version,p_request_id);
end$$;
revoke all on function portal_identity_private.business_application_command(text,text,text,text,boolean,text,bigint,jsonb,text,text,uuid)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
grant execute on function portal_identity_private.business_application_command(text,text,text,text,boolean,text,bigint,jsonb,text,text,uuid)
 to doji_identity_resolver;
commit;
