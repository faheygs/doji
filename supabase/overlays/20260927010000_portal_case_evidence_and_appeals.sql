-- PREPARATION ONLY. Not in the migration queue; do not deploy without review.
-- Requires the separately approved local employee-avatar-evidence draft first.
-- Execute this entire file in one transaction (including the privilege changes).
-- Additive employee-only reads; no member functions, policies or commands change.

create function public.get_admin_report_case_v3(p_report_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare base jsonb; media jsonb := '[]'::jsonb; avatar_path text;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee'
     or auth.jwt()->>'aal' is distinct from 'aal2'
     or not public.admin_user_has_permission('moderation.read') then
    raise exception 'Approved employee moderator and MFA required' using errcode='42501';
  end if;
  -- The existing read checks the exact report/restricted queue and emits one
  -- evidence-view audit. Do not duplicate it or bypass its authorization.
  base := public.get_admin_report_case_v2(p_report_id);

  if base->>'target_kind' = 'post' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'slot', asset.slot, 'kind', asset.kind,
      'availability', case when parsed.path is null then 'invalid_reference'
        when stored.id is null then 'object_missing' else 'available' end,
      'bucket', 'post-media', 'path', parsed.path
    ) order by asset.ordinal), '[]'::jsonb) into media
    from public.reports report
    join public.posts post on post.id=report.post_id
    cross join lateral (values
      (1, 'photo', 'image', post.photo_url),
      (2, 'front_photo', 'image', post.front_photo_url),
      (3, 'video', 'video', post.video_url)
    ) asset(ordinal,slot,kind,url)
    cross join lateral (select public.public_storage_object_path(asset.url,'post-media') as path) parsed
    left join storage.objects stored on stored.bucket_id='post-media' and stored.name=parsed.path
    where report.id=p_report_id and nullif(btrim(asset.url),'') is not null;
  elsif base->>'target_kind' = 'profile_photo' and
      coalesce((base#>>'{evidence,has_profile_photo}')::boolean,false) then
    avatar_path := public.public_storage_object_path(base#>>'{evidence,profile_photo_url}','avatars');
    media := jsonb_build_array(jsonb_build_object('slot','profile_photo','kind','image',
      'availability',case when avatar_path is null then 'invalid_reference'
        when not public.employee_can_read_avatar_evidence_v1(avatar_path) then 'staff_storage_not_authorized'
        when not exists(select 1 from storage.objects where bucket_id='avatars' and name=avatar_path) then 'object_missing'
        else 'available' end,
      'bucket','avatars','path',case when public.employee_can_read_avatar_evidence_v1(avatar_path) then avatar_path else null end));
  end if;
  -- Do not offer a public-URL fallback around employee Storage authorization.
  if base->'evidence' ? 'profile_photo_url' then
    base := jsonb_set(base,'{evidence}',(base->'evidence')-'profile_photo_url');
  end if;

  return base || jsonb_build_object('case_contract_version',3,
    'media_manifest',jsonb_build_object('source','current_content','items',media,
      'historical_snapshot',false,
      'content_available',coalesce((base#>>'{evidence,exists}')::boolean,false)));
end;
$$;
revoke all on function public.get_admin_report_case_v3(uuid) from public,anon,authenticated,service_role,doji_employee;
grant execute on function public.get_admin_report_case_v3(uuid) to doji_employee;
comment on function public.get_admin_report_case_v3(uuid) is
  'Employee-only audited case read with at most three current post assets; paths require existing Storage authorization and are not signed URLs or historical snapshots.';

create function public.get_admin_appeal_case_v1(p_appeal_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  appeal public.moderation_appeals%rowtype;
  decision public.moderation_decisions%rowtype;
  consequence public.moderation_account_actions%rowtype;
  report_case jsonb;
  reviewer jsonb;
  original_decider jsonb;
  blocker text;
  original_evidence jsonb;
  avatar_path text;
  avatar_availability text;
begin
  if auth.jwt()->>'role' is distinct from 'doji_employee'
     or auth.jwt()->>'aal' is distinct from 'aal2'
     or not public.admin_user_has_permission('moderation.read') then
    raise exception 'Approved employee moderator and MFA required' using errcode='42501';
  end if;
  select * into appeal from public.moderation_appeals where id=p_appeal_id;
  if not found then raise exception 'Appeal not found' using errcode='P0002'; end if;
  select * into strict decision from public.moderation_decisions where id=appeal.decision_id;
  -- decision_id has a unique index: one authoritative account consequence.
  select * into consequence from public.moderation_account_actions where decision_id=decision.id;
  if consequence.action in ('temporary_restriction','permanent_ban')
     and not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required' using errcode='42501';
  end if;
  report_case := public.get_admin_report_case_v3(decision.report_id);
  -- Never confuse the appealed decision with a newer decision on this report.
  -- Current evidence is separate, and callers must render original_decision.
  report_case := report_case - 'current_decision' - 'decision_summary';
  select jsonb_build_object('id',id,'display_name',display_name,'username',username)
    into original_decider from public.admin_actor_directory where id=decision.decided_by;
  select jsonb_build_object('id',id,'display_name',display_name,'username',username)
    into reviewer from public.admin_actor_directory where id=appeal.reviewed_by;
  blocker := case
    when appeal.status <> 'pending' then 'appeal_closed'
    when not public.admin_user_has_permission('moderation.write') then 'read_only'
    when decision.decided_by=auth.uid() and public.admin_current_operator_role()<>'super_admin'
      then 'independent_reviewer_required'
    else null end;
  -- Existing decisions retain moderation state, not post/comment/poll bodies.
  -- Never return the opaque payload or substitute current text as original text.
  original_evidence := jsonb_build_object('historical_content_snapshot',false,
    'prior_moderation_status',decision.original_payload->>'moderation_status',
    'avatar_reference_retained',decision.content_kind='profile_photo'
      and nullif(decision.original_payload->>'avatar_url','') is not null,
    'availability',case when decision.content_kind='profile_photo'
      and nullif(decision.original_payload->>'avatar_url','') is not null
        then 'pending_authorization' else 'content_snapshot_not_retained' end);
  if (original_evidence->>'avatar_reference_retained')::boolean then
    avatar_path := public.public_storage_object_path(decision.original_payload->>'avatar_url','avatars');
    avatar_availability := case when avatar_path is null then 'invalid_reference'
      when not public.employee_can_read_avatar_evidence_v1(avatar_path) then 'staff_storage_not_authorized'
      when not exists(select 1 from storage.objects where bucket_id='avatars' and name=avatar_path) then 'object_missing'
      else 'available' end;
    original_evidence := original_evidence || jsonb_build_object('availability',avatar_availability,
      'media_manifest',jsonb_build_object('source','original_decision_reference','historical_snapshot',false,
        'items',jsonb_build_array(jsonb_build_object('slot','original_profile_photo','kind','image',
          'availability',avatar_availability,'bucket','avatars',
          'path',case when avatar_availability in ('available','object_missing') then avatar_path else null end))));
  end if;
  insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,metadata)
    values(auth.uid(),public.admin_current_operator_role(),'appeal.case_viewed','moderation_appeal',appeal.id::text,
      jsonb_build_object('decisionId',decision.id,'reportId',decision.report_id));
  return jsonb_build_object('case_contract_version',1,
    'appeal',jsonb_build_object('id',appeal.id,'decision_id',appeal.decision_id,
      'report_id',decision.report_id,'status',appeal.status,'statement',appeal.statement,
      'submitted_at',appeal.submitted_at,'reviewed_at',appeal.reviewed_at,
      'review_reason',appeal.review_reason,'reviewed_by',reviewer,'member_deleted',appeal.user_id is null),
    'original_decision',jsonb_build_object('id',decision.id,'action',decision.action,
      'policy_code',decision.policy_code,'severity',decision.severity,'state',decision.state,
      'content_kind',decision.content_kind,'content_id',decision.content_id,
      'rationale',decision.rationale,'member_notice',decision.user_notice,
      'decided_at',decision.decided_at,'decided_by',original_decider,
      'original_decider_id',decision.decided_by,'decider_deleted',decision.decided_by is null,
      'reversed_at',decision.reversed_at,'reversal_reason',decision.reversal_reason,
      'account_action',consequence.action,'account_action_state',consequence.state,
      'restriction_starts_at',consequence.starts_at,'restriction_ends_at',consequence.ends_at),
    'original_evidence',original_evidence,'report_case',report_case,
    'review_eligibility',jsonb_build_object('can_review',blocker is null,'blocked_reason',blocker,
      'super_admin_override_required',blocker is null and coalesce(decision.decided_by=auth.uid(),false)));
end;
$$;
revoke all on function public.get_admin_appeal_case_v1(uuid) from public,anon,authenticated,service_role,doji_employee;
grant execute on function public.get_admin_appeal_case_v1(uuid) to doji_employee;
comment on function public.get_admin_appeal_case_v1(uuid) is
  'Employee-only audited appeal detail bound to its original decision and consequence, preserving restricted evidence and independent-review requirements. Eligibility is advisory; existing commands remain authoritative.';
