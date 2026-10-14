-- LOCAL CANDIDATE. Business-only review/privacy compatibility; no activation.
-- Requires business privacy, registry, enrollment, read and command candidates.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table portal_identity_private.business_review_restore(
 signature text primary key, prior_definition text not null, installed_definition text
);
alter table portal_identity_private.business_review_restore enable row level security;
revoke all on portal_identity_private.business_review_restore
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_business_enrollment;

-- Serialize staff decisions with external revocation in the same lock order as
-- identity resolution, BEFORE acquiring the application's account lock.
create function portal_identity_private.lock_business_identity(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 perform 1 from portal_identity_private.realms r
 join portal_identity_private.identities i on i.realm=r.realm
 join portal_identity_private.principals p on p.id=i.principal_id and p.realm=i.realm
 where p.id=p_id for share of r,i,p;
end$$;

-- Presence in the registry is authoritative: a disabled/revoked/mismatched
-- external identity must NEVER fall back to an old Supabase Auth identity.
create function portal_identity_private.business_approval_eligible(p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$begin
 if p_id is null or exists(select 1 from public.profiles where id=p_id)
  or exists(select 1 from public.admin_employees where id=p_id)
  or not exists(select 1 from business_private.accounts where id=p_id and not disabled) then return false; end if;
 if exists(select 1 from portal_identity_private.principals where id=p_id) then
  return exists(select 1 from portal_identity_private.principals p
   join portal_identity_private.identities i on i.principal_id=p.id and i.realm=p.realm
   join portal_identity_private.realms r on r.realm=p.realm
   join business_private.signup_agreements g on g.account_id=p.id
   where p.id=p_id and p.realm='business' and p.state='active' and not i.revoked and r.enabled)
   and not exists(select 1 from auth.users where id=p_id and
    (role is distinct from 'doji_business' or raw_app_meta_data->>'account_type' is distinct from 'business'));
 end if;
 return exists(select 1 from auth.users u where u.id=p_id and u.role='doji_business'
  and u.raw_app_meta_data->>'account_type'='business' and u.email_confirmed_at is not null
  and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp()));
end$$;

-- Existing privacy cases remain reviewable while business login is frozen.
-- No identity is inferred from an email and no provider/user is provisioned here.
create function portal_identity_private.assert_business_privacy_target(p_id uuid,p_absent_ok boolean)
returns void language plpgsql security definer set search_path='' as $$begin
 perform portal_identity_private.lock_business_identity(p_id);
 if p_id is null or exists(select 1 from public.profiles where id=p_id)
  or exists(select 1 from public.admin_employees where id=p_id)
  or exists(select 1 from auth.users where id=p_id and
   (role is distinct from 'doji_business' or raw_app_meta_data->>'account_type' is distinct from 'business')) then
  raise exception using errcode='42501',message='Exact separate business identity required'; end if;
 if exists(select 1 from portal_identity_private.principals where id=p_id) then
  if not exists(select 1 from portal_identity_private.principals p
    join portal_identity_private.identities i on i.principal_id=p.id and i.realm=p.realm
    join business_private.accounts a on a.id=p.id
    where p.id=p_id and p.realm='business' and
     (p_absent_ok is true or (p.state in ('active','disabled') and not i.revoked))) then
   raise exception using errcode='42501',message='Exact separate business identity required'; end if;
 elsif not p_absent_ok and not exists(select 1 from auth.users where id=p_id and deleted_at is null) then
  raise exception using errcode='42501',message='Exact separate business identity required';
 end if;
end$$;

-- Legacy Auth erasure must never treat a missing Auth row as proof that an
-- independent WorkOS account has been erased. Its own executor is a release gate.
create function portal_identity_private.assert_legacy_business_erasure(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from portal_identity_private.principals where id=p_id) then
  raise exception using errcode='42501',message='Independent business directory erasure required'; end if;
end$$;

revoke all on function portal_identity_private.lock_business_identity(uuid),
 portal_identity_private.business_approval_eligible(uuid),
 portal_identity_private.assert_business_privacy_target(uuid,boolean),
 portal_identity_private.assert_legacy_business_erasure(uuid)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_business_enrollment;

-- Only reviewed bodies may be adapted. Preserve signatures, ACLs, auditing,
-- receipt/revision handling and existing atomic commands, not parallel copies.
do $adapt$declare spec record; src text; definition text; updated text; begin
 for spec in select * from (values
  ('public.admin_business_application_command_v1(uuid,bigint,text,text,text,uuid)','239e3914b077a7c904638bd57db3f564'),
  ('business_private.privacy_target(uuid,boolean)','98140c4c2379bea29b9e6e053089bfc8'),
  ('public.get_admin_business_privacy_access_v1(uuid,bigint)','6d508198bd979d381f4bc5f2ea4e6e03'),
  ('public.claim_business_erasure_v1(uuid,uuid)','56d45d386c17a1711755b2f90793a789'),
  ('public.finish_business_erasure_v1(uuid,uuid)','89833811628f0565734198166f0f4980')
 ) v(signature,fingerprint) loop
  select replace(p.prosrc,E'\r',''),pg_get_functiondef(p.oid) into src,definition
   from pg_proc p where p.oid=spec.signature::regprocedure and p.prosecdef
    and p.prolang=(select oid from pg_language where lanname='plpgsql');
  if src is null or md5(src)<>spec.fingerprint then
   raise exception 'Business review source changed: %',spec.signature; end if;
  insert into portal_identity_private.business_review_restore(signature,prior_definition)
   values(spec.signature,definition);
  updated:=src;
  if spec.signature like 'public.admin_business_application_command%' then
   updated:=replace(updated,'perform 1 from business_private.accounts where id=applicant for update;',
    'perform portal_identity_private.lock_business_identity(applicant); perform 1 from business_private.accounts where id=applicant for update;');
   updated:=regexp_replace(updated,
    'if not exists\(select 1 from auth.users u join business_private.accounts b[\s\S]*?then',
    'if not portal_identity_private.business_approval_eligible(applicant) then');
  elsif spec.signature='business_private.privacy_target(uuid,boolean)' then
   updated:='begin perform portal_identity_private.assert_business_privacy_target(p_id,p_absent_ok); end';
  elsif spec.signature like 'public.get_admin_business_privacy_access%' then
   updated:=replace(updated,
    '''identity'',(select jsonb_build_object(''email'',email,''name'',raw_user_meta_data->>''display_name'') from auth.users where id=c.account_id),',
    '''identity'',case when exists(select 1 from portal_identity_private.principals where id=c.account_id) then null else (select jsonb_build_object(''email'',email,''name'',raw_user_meta_data->>''display_name'') from auth.users where id=c.account_id) end,
     ''identity_source'',case when exists(select 1 from portal_identity_private.principals where id=c.account_id) then ''workos_business'' else ''supabase_business'' end,
     ''provider_export_required'',exists(select 1 from portal_identity_private.principals where id=c.account_id),');
  else
   -- Guard before the account lock, and before even an already-completed replay.
   updated:=replace(updated,'perform 1 from business_private.accounts where id=c.account_id',
    'perform portal_identity_private.assert_legacy_business_erasure(c.account_id); perform 1 from business_private.accounts where id=c.account_id');
  end if;
  if updated=src then raise exception 'Expected business review adaptation missing: %',spec.signature; end if;
  execute replace(definition,(select prosrc from pg_proc where oid=spec.signature::regprocedure),updated);
  update portal_identity_private.business_review_restore set installed_definition=
   pg_get_functiondef(spec.signature::regprocedure) where signature=spec.signature;
 end loop;
end$adapt$;
-- No role grant, flag, Auth/member change, provider request, outbox or cron.
commit;
