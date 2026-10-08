-- Separately approved independent-business privacy bridge. No activation/job.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table portal_identity_private.business_privacy_settings(
 singleton boolean primary key check(singleton),enabled boolean not null default false
);
insert into portal_identity_private.business_privacy_settings values(true,false);
alter table portal_identity_private.business_privacy_settings enable row level security;
revoke all on portal_identity_private.business_privacy_settings from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session,doji_business_enrollment;
alter table business_session_private.records add column business_principal uuid references portal_identity_private.principals(id);
create index business_session_principal on business_session_private.records(business_principal) where kind='session';

-- Serialize session creation with closure/deletion. A callback that began before
-- closure cannot insert a fresh session after erasure has removed old sessions.
create function business_session_private.put_bound_session(
 p_scope text,p_key text,p_value text,p_ttl integer,p_issuer text,p_audience text,p_subject text,p_session text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare principal uuid; result jsonb;
begin
 select principal_id into strict principal from portal_identity_private.resolve_identity('business',p_issuer,p_audience,p_subject,p_session,false);
 perform 1 from business_private.accounts where id=principal and not disabled for share;
 if not found then raise exception using errcode='42501',message='Business account unavailable';end if;
 result:=business_session_private.execute_store(p_scope,'put','session',p_key,p_value,p_ttl,null,null);
 if result->>'state'='ok' then
  update business_session_private.records set business_principal=principal where kind='session' and key_hash=p_key;
 end if;
 return result;
end$$;
revoke all on function business_session_private.put_bound_session(text,text,text,integer,text,text,text,text) from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_enrollment;
grant execute on function business_session_private.put_bound_session(text,text,text,integer,text,text,text,text) to doji_business_session;

-- Operator-only exact-case target. No API role receives this function. No email
-- lookup, user provisioning, employee or member identity fallback is possible.
create function portal_identity_private.business_privacy_target(p_case uuid,p_issuer text,p_audience text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c business_private.privacy_cases%rowtype; subject text;
begin
 perform business_private.privacy_enabled();
 if not exists(select 1 from portal_identity_private.business_privacy_settings where singleton and enabled) then
  raise exception using errcode='55000',message='Independent business privacy disabled';end if;
 select * into c from business_private.privacy_cases where id=p_case;
 if not found then raise exception using errcode='P0002',message='Verified business privacy case required';end if;
 perform 1 from portal_identity_private.realms where realm='business' for share;
 perform 1 from portal_identity_private.identities where realm='business' and principal_id=c.account_id for update;
 perform 1 from portal_identity_private.principals where realm='business' and id=c.account_id for update;
 perform business_private.privacy_target(c.account_id,true);
 select i.subject into subject from portal_identity_private.identities i
 join portal_identity_private.principals p on p.id=i.principal_id and p.realm=i.realm
 join portal_identity_private.realms r on r.realm=i.realm
 where p.id=c.account_id and p.realm='business' and r.issuer=p_issuer and r.audience=p_audience;
 if subject is null or subject !~ '^user_[A-Za-z0-9]{1,80}$'
  or exists(select 1 from auth.users where id=c.account_id) then
  raise exception using errcode='42501',message='Exact independent business directory required';end if;
 return jsonb_build_object('case_id',c.id,'account_id',c.account_id,'subject',subject,'issuer',p_issuer,'audience',p_audience,'kind',c.kind,'state',c.state,'revision',c.revision);
end$$;

create function portal_identity_private.export_business_identity_target(p_case uuid,p_revision bigint,p_issuer text,p_audience text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target jsonb;
begin
 target:=portal_identity_private.business_privacy_target(p_case,p_issuer,p_audience);
 if target->>'kind'<>'access' or target->>'state'<>'open' or (target->>'revision')::bigint is distinct from p_revision then
  raise exception using errcode='PT409',message='Current open access case required';end if;
 return target;
end$$;

create function portal_identity_private.claim_business_identity_erasure(p_case uuid,p_execution uuid,p_issuer text,p_audience text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target jsonb; c business_private.privacy_cases%rowtype; ctl business_private.privacy_controls%rowtype; fresh boolean:=false;
begin
 if p_execution is null then raise exception using errcode='22023',message='Execution ID required';end if;
 target:=portal_identity_private.business_privacy_target(p_case,p_issuer,p_audience);
 perform 1 from business_private.accounts where id=(target->>'account_id')::uuid and disabled for update;
 if not found then raise exception using errcode='42501',message='Closed business account required';end if;
 select * into c from business_private.privacy_cases where id=p_case for update;
 select * into ctl from business_private.privacy_controls where account_id=c.account_id for update;
 if c.kind<>'erasure' or c.state not in('prepared','executing','primary_erased','completed')
  or ctl.erasure_case_id is distinct from c.id or ctl.hold_reference is not null then
  raise exception using errcode='55000',message='Reviewed unheld erasure required';end if;
 if c.state='prepared' then
  update business_private.privacy_cases set state='executing',execution_id=p_execution,revision=revision+1,updated_at=clock_timestamp() where id=c.id;
  insert into business_private.privacy_history values(c.id,c.revision+1,null,'execution_started','system:workos-business-erasure',clock_timestamp());
  fresh:=true;
 elsif c.execution_id is distinct from p_execution then raise exception using errcode='PT409',message='Different execution owns this case';end if;
 return target||jsonb_build_object('state',case when fresh then 'executing' else c.state end,'delete_authorized',fresh);
end$$;

-- p_absence is an operator attestation from a bounded authenticated exact-user
-- WorkOS GET returning 404. Missing Supabase Auth rows are never such evidence.
create function portal_identity_private.finish_business_identity_erasure(
 p_case uuid,p_execution uuid,p_issuer text,p_audience text,p_subject text,p_absence text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target jsonb; c business_private.privacy_cases%rowtype; app uuid;
begin
 target:=portal_identity_private.business_privacy_target(p_case,p_issuer,p_audience);
 if p_subject is distinct from target->>'subject' or p_absence is null or p_absence !~ '^workos-404:[a-f0-9]{64}$' then
  raise exception using errcode='42501',message='Exact provider absence evidence required';end if;
 -- Upgrade registry locks before the account lock, matching resolver ordering.
 perform 1 from portal_identity_private.identities where realm='business' and subject=p_subject for update;
 perform 1 from portal_identity_private.principals where id=(target->>'account_id')::uuid for update;
 perform 1 from business_private.accounts where id=(target->>'account_id')::uuid and disabled for update;
 if not found then raise exception using errcode='42501',message='Closed business account required';end if;
 select * into c from business_private.privacy_cases where id=p_case for update;
 if p_execution is null or c.execution_id is distinct from p_execution or c.kind<>'erasure' then
  raise exception using errcode='42501',message='Exact erasure execution required';end if;
 if exists(select 1 from business_private.privacy_controls where account_id=c.account_id and (hold_reference is not null or erasure_case_id is distinct from c.id)) then
  raise exception using errcode='55000',message='Legal hold or case conflict';end if;
 if c.state in('primary_erased','completed') then return jsonb_build_object('state',c.state);end if;
 if c.state<>'executing' then raise exception using errcode='55000',message='Erasure not executing';end if;
 -- All independent sessions must be attributed before enabling this runtime.
 if exists(select 1 from business_session_private.records where kind='session' and business_principal is null) then
  raise exception using errcode='55000',message='Unattributed business session needs operator review';end if;
 select id into app from business_private.applications where applicant_id=c.account_id for update;
 update business_private.applications set details='{}',response='',revision=revision+1,updated_at=clock_timestamp() where id=app;
 update business_private.submissions set details='{}' where application_id=app;
 update business_private.history set response='',internal_note='' where application_id=app;
 update business_private.receipts set outcome=jsonb_build_object('privacy_erased',true) where application_id=app;
 update public.admin_audit_log set reason='Business privacy erasure: retained decision metadata only' where entity_type='business_application' and entity_id=app::text;
 delete from business_private.memberships where account_id=c.account_id;
 update business_private.organizations set status='suspended' where application_id=app;
 delete from business_session_private.records where kind='session' and business_principal=c.account_id;
 update portal_identity_private.identities set revoked=true where realm='business' and subject=p_subject;
 update portal_identity_private.principals set state='deleted',revision=revision+1 where id=c.account_id and realm='business';
 insert into portal_identity_private.mapping_audit(principal_id,action,review_reference) values(c.account_id,'principal.deleted',p_absence);
 update business_private.privacy_cases set cleanup_email=null,state='primary_erased',revision=revision+1,updated_at=clock_timestamp() where id=c.id;
 insert into business_private.privacy_history values(c.id,c.revision+1,null,'primary_erased',p_absence,clock_timestamp());
 perform business_private.privacy_invalidate(c.account_id);
 return jsonb_build_object('state','primary_erased');
end$$;
revoke all on function portal_identity_private.business_privacy_target(uuid,text,text),
 portal_identity_private.export_business_identity_target(uuid,bigint,text,text),
 portal_identity_private.claim_business_identity_erasure(uuid,uuid,text,text),
 portal_identity_private.finish_business_identity_erasure(uuid,uuid,text,text,text,text)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session,doji_business_enrollment;
-- No executor login, service-role grant, API endpoint, scheduler or enabled flag.
commit;
