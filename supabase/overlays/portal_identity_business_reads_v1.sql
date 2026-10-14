-- LOCAL ONLY. Requires the disabled portal identity registry candidate.
-- Not exposed through PostgREST, not connected to a portal or provider.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table portal_identity_private.business_read_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into portal_identity_private.business_read_settings(singleton) values(true);
alter table portal_identity_private.business_read_settings enable row level security;
revoke all on portal_identity_private.business_read_settings from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;

-- Internal actor check only. Trust arguments must come from the dedicated
-- server verifier. Neither UUID nor realm is chosen by the browser.
create function portal_identity_private.business_read_actor(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid; account business_private.accounts%rowtype;
begin
 perform 1 from portal_identity_private.business_read_settings where singleton and enabled for share;
 if not found then raise exception using errcode='42501',message='External business reads unavailable'; end if;
 select principal_id into strict uid from portal_identity_private.resolve_identity(
  'business',p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform business_private.assert_enabled();
 -- Registry and application-account restrictions are both required. No Auth
 -- lookup, fake Auth identity, email join, JWT mutation or member conversion.
 if exists(select 1 from public.profiles where id=uid)
    or exists(select 1 from public.admin_employees where id=uid) then
  raise exception using errcode='42501',message='Separate business principal required'; end if;
 select * into account from business_private.accounts where id=uid for share;
 if found and account.disabled then
  raise exception using errcode='42501',message='Business access disabled'; end if;
 return uid;
end$$;

create function portal_identity_private.read_business_application(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; aid uuid;
begin
 uid:=portal_identity_private.business_read_actor(p_issuer,p_audience,p_subject,p_session,p_mfa);
 select id into aid from business_private.applications where applicant_id=uid;
 if aid is null then return null; end if;
 -- Reuse the existing applicant-safe projection, not the employee projection.
 return business_private.item(aid,false);
end$$;

create function portal_identity_private.read_business_workspace(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
begin
 uid:=portal_identity_private.business_read_actor(p_issuer,p_audience,p_subject,p_session,p_mfa);
 if p_mfa is distinct from true then
  raise exception using errcode='42501',message='Business workspace requires MFA'; end if;
 select jsonb_build_object('organization_id',o.id,'role',m.role,'brand_name',s.details->>'brand_name',
  'campaigns_enabled',false,'billing_enabled',false) into result
 from business_private.memberships m join business_private.organizations o on o.id=m.organization_id
 join business_private.applications a on a.id=o.application_id and a.state='approved'
 join business_private.submissions s on s.application_id=o.application_id and s.submission=o.approved_submission
 where m.account_id=uid and o.status='active';
 if result is null then raise exception using errcode='42501',message='Approved organization required'; end if;
 return result;
end$$;

revoke all on function portal_identity_private.business_read_actor(text,text,text,text,boolean),
 portal_identity_private.read_business_application(text,text,text,text,boolean),
 portal_identity_private.read_business_workspace(text,text,text,text,boolean)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
grant execute on function portal_identity_private.read_business_application(text,text,text,text,boolean),
 portal_identity_private.read_business_workspace(text,text,text,text,boolean) to doji_identity_resolver;
commit;
