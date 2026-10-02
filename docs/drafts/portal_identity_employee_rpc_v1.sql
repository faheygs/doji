-- Candidate employee-only application bridge. Disabled; not a public API.
-- Existing atomic moderation RPCs remain unchanged. No Auth token is minted.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create role doji_employee_application nologin noinherit;
create table portal_identity_private.employee_rpc_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false
);
insert into portal_identity_private.employee_rpc_settings(singleton) values(true);
alter table portal_identity_private.employee_rpc_settings enable row level security;
revoke all on portal_identity_private.employee_rpc_settings from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_employee_application;

create function portal_identity_private.employee_actor_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean
) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 perform 1 from portal_identity_private.employee_rpc_settings where singleton and enabled for share;
 if not found then raise exception using errcode='42501',message='Independent employee access unavailable';end if;
 select principal_id into strict uid from portal_identity_private.resolve_identity('employee',p_issuer,p_audience,p_subject,p_session,p_mfa);
 -- Serialize authority changes with execution, not just a prior session check.
 perform 1 from public.admin_employees where id=uid for share;
 if not found or not exists(select 1 from public.admin_employees where id=uid and status='active' and cardinality(roles)>0)
  or not exists(select 1 from portal_identity_private.staff_actors where id=uid and employee_principal_id=uid and legacy_auth_id is null)
  or exists(select 1 from public.profiles where id=uid)
  or exists(select 1 from business_private.accounts where id=uid) then
  raise exception using errcode='42501',message='Active separate employee required';end if;
 return uid;
end$$;

-- Only the trusted server adapter supplies identity arguments after verifying
-- WorkOS signature, audience, live session and exact-session TOTP receipt.
-- Settings are restored on success and error before returning. Legacy
-- individual claim settings are cleared so they cannot override the resolved ID.
-- The browser chooses neither principal nor claims, SQL, role or schema.
create function portal_identity_private.employee_rpc_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,
 p_name text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; fields text[]; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>16000 then
  raise exception using errcode='22023',message='Invalid employee request';end if;
 fields:=case p_name
  when 'admin_business_application_command_v1' then array['p_id','p_revision','p_action','p_response','p_internal_note','p_request_id']
  when 'admin_business_privacy_command_v1' then array['p_case_id','p_revision','p_action','p_reference','p_request_id','p_details','p_application_revision']
  when 'admin_business_privacy_open_v1' then array['p_account_id','p_kind','p_verification_reference','p_due_at','p_request_id']
  when 'admin_create_safety_report_v1' then array['p_id','p_revision','p_command_id','p_input']
  when 'admin_decide_report_v3' then array['p_report_id','p_action','p_policy_code','p_severity','p_reason','p_user_notice','p_account_action','p_restriction_days','p_idempotency_key']
  when 'admin_editorial_command_v1' then array['p_kind','p_action','p_id','p_version','p_input','p_reason','p_idempotency_key']
  when 'admin_review_moderation_appeal' then array['p_appeal_id','p_outcome','p_reason','p_idempotency_key']
  when 'admin_safety_removal_command_v1' then array['p_id','p_revision','p_command_id','p_input']
  when 'admin_set_employee_role_v1' then array['p_username','p_role','p_active','p_reason','p_idempotency_key']
  when 'admin_set_report_review_state_v1' then array['p_report_id','p_action','p_reason','p_idempotency_key']
  when 'admin_triage_report' then array['p_report_id','p_action','p_priority','p_note','p_idempotency_key']
  when 'get_admin_appeal_case_v1' then array['p_appeal_id']
  when 'get_admin_appeals_snapshot' then array['p_limit']
  when 'get_admin_audit_export_v1' then array['p_category','p_search']
  when 'get_admin_audit_page_v2' then array['p_limit','p_before_occurred_at','p_before_id','p_category','p_search']
  when 'get_admin_business_application_v1' then array['p_id']
  when 'get_admin_business_applications_page_v1' then array['p_state','p_limit','p_after_at','p_after_id']
  when 'get_admin_business_privacy_access_v1' then array['p_case_id','p_after_revision']
  when 'get_admin_business_privacy_case_v1' then array['p_case_id','p_after_revision']
  when 'get_admin_business_privacy_correction_v1' then array['p_case_id']
  when 'get_admin_business_privacy_page_v1' then array['p_state','p_after_due','p_after_id']
  when 'get_admin_command_center_snapshot_v2' then array['p_limit']
  when 'get_admin_editorial_item_v1' then array['p_kind','p_id']
  when 'get_admin_editorial_page_v1' then array['p_kind','p_limit','p_before_at','p_before_id','p_filter']
  when 'get_admin_employee_directory_v1' then array[]::text[]
  when 'get_admin_event_health_history_v1' then array['p_limit']
  when 'get_admin_operational_health_read_v1' then array[]::text[]
  when 'get_admin_portal_session_v3' then array[]::text[]
  when 'get_admin_realtime_token_capabilities' then array[]::text[]
  when 'portal_evidence_authorization_v1' then array['p_bucket','p_path']
  when 'get_admin_report_case_v2' then array['p_report_id']
  when 'get_admin_report_case_v3' then array['p_report_id']
  when 'get_admin_resolved_reports_page_v1' then array['p_limit','p_before_resolved_at','p_before_report_id']
  when 'get_admin_safety_removal_v1' then array['p_id']
  when 'get_admin_safety_removals_v1' then array['p_after_at','p_after_id','p_closed','p_queue']
  when 'get_admin_safety_target_v1' then array['p_case_id','p_kind','p_target_id']
  when 'get_admin_work_queue_page_v1' then array['p_limit','p_queue','p_filter','p_search','p_after_at','p_after_id']
  else null end;
 if fields is null then raise exception using errcode='42501',message='Employee operation not allowed';end if;
 if (select count(*) from jsonb_object_keys(p_args))<>cardinality(fields) or not p_args ?& fields then
  raise exception using errcode='22023',message='Invalid employee arguments';end if;
 if p_args ? 'p_limit' and p_args->'p_limit'<>'null'::jsonb then
  if jsonb_typeof(p_args->'p_limit')<>'number' or (p_args->>'p_limit')!~'^[0-9]{1,2}$'
   or (p_args->>'p_limit')::integer not between 1 and 50 then
   raise exception using errcode='22023',message='Invalid employee page size';end if;
 end if;
 if p_args ? 'p_limit' and p_args->'p_limit'<>'null'::jsonb then
  if jsonb_typeof(p_args->'p_limit')<>'number' or (p_args->>'p_limit')!~'^[0-9]{1,2}$'
   or (p_args->>'p_limit')::integer not between 1 and 50 then
   raise exception using errcode='22023',message='Invalid employee page size';end if;
 end if;
 -- Global access-change lock comes before actor row locks to avoid two owners
 -- changing each other's roles in opposite order. Same key as the legacy command.
 if p_name='admin_set_employee_role_v1' then perform pg_advisory_xact_lock(92610001);end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);
 perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 if not public.admin_user_has_permission('portal.session') then
  raise exception using errcode='42501',message='Employee permission denied';end if;
 -- Fixed calls only. Each reused RPC still checks its own permission/queue,
 -- optimistic revision and idempotency contract inside this same transaction.
 case p_name
  when 'admin_business_application_command_v1' then result:=public.admin_business_application_command_v1((p_args->>'p_id')::uuid,(p_args->>'p_revision')::bigint,(p_args->>'p_action')::text,(p_args->>'p_response')::text,(p_args->>'p_internal_note')::text,(p_args->>'p_request_id')::uuid);
  when 'admin_business_privacy_command_v1' then result:=public.admin_business_privacy_command_v1((p_args->>'p_case_id')::uuid,(p_args->>'p_revision')::bigint,(p_args->>'p_action')::text,(p_args->>'p_reference')::text,(p_args->>'p_request_id')::uuid,p_args->'p_details',(p_args->>'p_application_revision')::bigint);
  when 'admin_business_privacy_open_v1' then result:=public.admin_business_privacy_open_v1((p_args->>'p_account_id')::uuid,(p_args->>'p_kind')::text,(p_args->>'p_verification_reference')::text,(p_args->>'p_due_at')::timestamp with time zone,(p_args->>'p_request_id')::uuid);
  when 'admin_create_safety_report_v1' then result:=public.admin_create_safety_report_v1((p_args->>'p_id')::uuid,(p_args->>'p_revision')::bigint,(p_args->>'p_command_id')::uuid,p_args->'p_input');
  when 'admin_decide_report_v3' then result:=public.admin_decide_report_v3((p_args->>'p_report_id')::uuid,(p_args->>'p_action')::text,(p_args->>'p_policy_code')::text,(p_args->>'p_severity')::text,(p_args->>'p_reason')::text,(p_args->>'p_user_notice')::text,(p_args->>'p_account_action')::text,(p_args->>'p_restriction_days')::integer,(p_args->>'p_idempotency_key')::text);
  when 'admin_editorial_command_v1' then result:=public.admin_editorial_command_v1((p_args->>'p_kind')::text,(p_args->>'p_action')::text,(p_args->>'p_id')::uuid,(p_args->>'p_version')::text,p_args->'p_input',(p_args->>'p_reason')::text,(p_args->>'p_idempotency_key')::text);
  when 'admin_review_moderation_appeal' then result:=public.admin_review_moderation_appeal((p_args->>'p_appeal_id')::uuid,(p_args->>'p_outcome')::text,(p_args->>'p_reason')::text,(p_args->>'p_idempotency_key')::text);
  when 'admin_safety_removal_command_v1' then result:=public.admin_safety_removal_command_v1((p_args->>'p_id')::uuid,(p_args->>'p_revision')::bigint,(p_args->>'p_command_id')::uuid,p_args->'p_input');
  when 'admin_set_employee_role_v1' then result:=portal_identity_private.employee_role_command_v1((p_args->>'p_username')::text,(p_args->>'p_role')::text,(p_args->>'p_active')::boolean,(p_args->>'p_reason')::text,(p_args->>'p_idempotency_key')::text);
  when 'admin_set_report_review_state_v1' then result:=public.admin_set_report_review_state_v1((p_args->>'p_report_id')::uuid,(p_args->>'p_action')::text,(p_args->>'p_reason')::text,(p_args->>'p_idempotency_key')::text);
  when 'admin_triage_report' then result:=public.admin_triage_report((p_args->>'p_report_id')::uuid,(p_args->>'p_action')::text,(p_args->>'p_priority')::text,(p_args->>'p_note')::text,(p_args->>'p_idempotency_key')::text);
  when 'get_admin_appeal_case_v1' then result:=public.get_admin_appeal_case_v1((p_args->>'p_appeal_id')::uuid);
  when 'get_admin_appeals_snapshot' then result:=public.get_admin_appeals_snapshot((p_args->>'p_limit')::integer);
  when 'get_admin_audit_export_v1' then result:=public.get_admin_audit_export_v1((p_args->>'p_category')::text,(p_args->>'p_search')::text);
  when 'get_admin_audit_page_v2' then result:=public.get_admin_audit_page_v2((p_args->>'p_limit')::integer,(p_args->>'p_before_occurred_at')::timestamp with time zone,(p_args->>'p_before_id')::uuid,(p_args->>'p_category')::text,(p_args->>'p_search')::text);
  when 'get_admin_business_application_v1' then result:=public.get_admin_business_application_v1((p_args->>'p_id')::uuid);
  when 'get_admin_business_applications_page_v1' then result:=public.get_admin_business_applications_page_v1((p_args->>'p_state')::text,(p_args->>'p_limit')::integer,(p_args->>'p_after_at')::timestamp with time zone,(p_args->>'p_after_id')::uuid);
  when 'get_admin_business_privacy_access_v1' then result:=public.get_admin_business_privacy_access_v1((p_args->>'p_case_id')::uuid,(p_args->>'p_after_revision')::bigint);
  when 'get_admin_business_privacy_case_v1' then result:=public.get_admin_business_privacy_case_v1((p_args->>'p_case_id')::uuid,(p_args->>'p_after_revision')::bigint);
  when 'get_admin_business_privacy_correction_v1' then result:=public.get_admin_business_privacy_correction_v1((p_args->>'p_case_id')::uuid);
  when 'get_admin_business_privacy_page_v1' then result:=public.get_admin_business_privacy_page_v1((p_args->>'p_state')::text,(p_args->>'p_after_due')::timestamp with time zone,(p_args->>'p_after_id')::uuid);
  when 'get_admin_command_center_snapshot_v2' then result:=public.get_admin_command_center_snapshot_v2((p_args->>'p_limit')::integer);
  when 'get_admin_editorial_item_v1' then result:=public.get_admin_editorial_item_v1((p_args->>'p_kind')::text,(p_args->>'p_id')::uuid);
  when 'get_admin_editorial_page_v1' then result:=public.get_admin_editorial_page_v1((p_args->>'p_kind')::text,(p_args->>'p_limit')::integer,(p_args->>'p_before_at')::timestamp with time zone,(p_args->>'p_before_id')::uuid,(p_args->>'p_filter')::text);
  when 'get_admin_employee_directory_v1' then result:=portal_identity_private.employee_directory_v1();
  when 'get_admin_event_health_history_v1' then result:=public.get_admin_event_health_history_v1((p_args->>'p_limit')::integer);
  when 'get_admin_operational_health_read_v1' then result:=public.get_admin_operational_health_read_v1();
  when 'get_admin_portal_session_v3' then result:=public.get_admin_portal_session_v3();
  when 'get_admin_realtime_token_capabilities' then result:=public.get_admin_realtime_token_capabilities();
  when 'portal_evidence_authorization_v1' then
   if p_args->>'p_path' is null or length(p_args->>'p_path') not between 1 and 1024
    or p_args->>'p_path' ~ '[%?#\\\\]'
    or p_args->>'p_path' ~ '(^|/)(\.|\.\.)?(/|$)'
    or not coalesce(case p_args->>'p_bucket'
     when 'post-media' then public.employee_can_read_report_evidence_v1(p_args->>'p_path')
     when 'avatars' then public.employee_can_read_avatar_evidence_v1(p_args->>'p_path')
     when 'moderation-evidence' then public.employee_can_read_preserved_media_v1(p_args->>'p_path')
     else false end,false) then
    raise exception using errcode='42501',message='Evidence access denied';end if;
   result:=jsonb_build_object('bucket',p_args->>'p_bucket','path',p_args->>'p_path','expiresIn',300);
  when 'get_admin_report_case_v2' then result:=public.get_admin_report_case_v2((p_args->>'p_report_id')::uuid);
  when 'get_admin_report_case_v3' then result:=public.get_admin_report_case_v3((p_args->>'p_report_id')::uuid);
  when 'get_admin_resolved_reports_page_v1' then result:=public.get_admin_resolved_reports_page_v1((p_args->>'p_limit')::integer,(p_args->>'p_before_resolved_at')::timestamp with time zone,(p_args->>'p_before_report_id')::uuid);
  when 'get_admin_safety_removal_v1' then result:=public.get_admin_safety_removal_v1((p_args->>'p_id')::uuid);
  when 'get_admin_safety_removals_v1' then result:=public.get_admin_safety_removals_v1((p_args->>'p_after_at')::timestamp with time zone,(p_args->>'p_after_id')::uuid,(p_args->>'p_closed')::boolean,(p_args->>'p_queue')::text);
  when 'get_admin_safety_target_v1' then result:=public.get_admin_safety_target_v1((p_args->>'p_case_id')::uuid,(p_args->>'p_kind')::text,(p_args->>'p_target_id')::uuid);
  when 'get_admin_work_queue_page_v1' then result:=public.get_admin_work_queue_page_v1((p_args->>'p_limit')::integer,(p_args->>'p_queue')::text,(p_args->>'p_filter')::text,(p_args->>'p_search')::text,(p_args->>'p_after_at')::timestamp with time zone,(p_args->>'p_after_id')::text);
  else raise exception using errcode='42501',message='Employee operation not allowed';
 end case;
 perform set_config('request.jwt.claims',prior_claims,true);
 perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);
 perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);
 perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);
 perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);
 raise;
end$$;
revoke all on function portal_identity_private.employee_actor_v1(text,text,text,text,boolean),
 portal_identity_private.employee_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_employee_application;
grant usage on schema portal_identity_private to doji_employee_application;
grant execute on function portal_identity_private.employee_rpc_v1(text,text,text,text,boolean,text,jsonb) to doji_employee_application;
-- No LOGIN, account provisioning, browser grants or authenticator membership.
commit;
