-- Repair whole-command replay only; preserve existing policy, permissions and member contracts.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $guard$ begin
if md5(pg_get_functiondef('public.admin_decide_report_v3(uuid,text,text,text,text,text,text,integer,text)'::regprocedure))<>'a6ffe0d8a6e9c22c3e972e39ce791232' then raise exception 'Moderation function drift';end if;
if md5(pg_get_functiondef('public.admin_review_moderation_appeal(uuid,text,text,text)'::regprocedure))<>'9c69f3f6b20979366b3cf964630f60ff' then raise exception 'Moderation function drift';end if;
end $guard$;
CREATE OR REPLACE FUNCTION public.admin_decide_report_v3(p_report_id uuid, p_action text, p_policy_code text, p_severity text, p_reason text, p_user_notice text, p_account_action text DEFAULT NULL::text, p_restriction_days integer DEFAULT NULL::integer, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  triage_row public.admin_report_triage%rowtype;
  report_row public.reports%rowtype;
  v_result jsonb;
  v_decision_id uuid;
  v_account_action_id uuid;
  v_affected_user_id uuid;
  v_restriction_ends_at timestamptz;
  restricted_case boolean := false;
  delegated_severity text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;


  -- MODERATION_OUTER_REPLAY_V1: serialize the entire wrapper, not only its delegate.
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'Administrator MFA required'; end if;
  if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderation write access required'; end if;
  if p_report_id is null or char_length(coalesce(p_idempotency_key,'')) not between 16 and 160 then
    raise exception 'Invalid command identity'; end if;
  -- Actor/key lock also serializes reuse across the report and appeal wrappers.
  perform pg_advisory_xact_lock(hashtextextended('moderation-command:'||auth.uid()::text||':'||p_idempotency_key,0));
  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text,0));
  if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderation write access required'; end if;
  declare saved jsonb; request_hash text := encode(pg_catalog.sha256(convert_to(jsonb_build_array(
  'report',p_report_id,p_action,p_policy_code,p_severity,btrim(coalesce(p_reason,'')),btrim(coalesce(p_user_notice,'')),p_account_action,p_restriction_days
  )::text,'UTF8')),'hex');
  begin
    select receipt.result into saved from public.admin_portal_command_receipts receipt
      where receipt.user_id=auth.uid() and receipt.idempotency_key=p_idempotency_key;
    if (exists(select 1 from public.admin_report_triage t where t.report_id=p_report_id and t.queue='restricted_safety') or coalesce((saved->>'restricted_review')::boolean,false))
      and not public.admin_user_has_permission('legal.read') then raise exception 'Restricted safety authorization required'; end if;
    if saved is not null then
      if saved->>'report_id' is distinct from p_report_id::text
        or saved->>'action' is distinct from p_action or saved->>'decision_id' is null
        or (saved ? '_moderation_request_sha256' and saved->>'_moderation_request_sha256' is distinct from request_hash) then
        raise exception 'Idempotency key already used for a different command'; end if;
      -- Historical receipts have no request hash. Return their original outcome only;
      -- never re-run side effects or infer that changed fields were applied.
      return saved;
    end if;
  end;

  select * into report_row from public.reports where id = p_report_id;
  if not found then raise exception 'Report not found'; end if;
  select * into triage_row from public.admin_report_triage where report_id = p_report_id;
  restricted_case := coalesce(triage_row.queue, 'moderation') = 'restricted_safety';

  if not restricted_case then
    if p_account_action is not null and p_account_action <> 'warning' then
      raise exception 'Account restrictions require restricted safety review';
    end if;
    v_result := public.admin_decide_report_v2(
      p_report_id, p_action, p_policy_code, p_severity,
      p_reason, p_user_notice, p_idempotency_key
    ) || jsonb_build_object('_moderation_request_sha256',encode(pg_catalog.sha256(convert_to(jsonb_build_array(
  'report',p_report_id,p_action,p_policy_code,p_severity,btrim(coalesce(p_reason,'')),btrim(coalesce(p_user_notice,'')),p_account_action,p_restriction_days
  )::text,'UTF8')),'hex'));
    update public.admin_portal_command_receipts set result=v_result
      where user_id=auth.uid() and idempotency_key=p_idempotency_key;
    return v_result;
  end if;

  if not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required';
  end if;
  if p_action not in ('no_violation', 'remove_content', 'remove_profile_photo') then
    raise exception 'Choose a final restricted-review disposition';
  end if;
  if p_action = 'no_violation' then
    if p_account_action is not null or p_severity <> 'none' or p_policy_code <> 'no_violation' then
      raise exception 'No violation cannot apply an account consequence';
    end if;
  else
    if p_severity not in ('level_2', 'level_3') then
      raise exception 'Restricted review requires Level 2 or Level 3 classification';
    end if;
    if p_account_action not in ('warning', 'temporary_restriction', 'permanent_ban') then
      raise exception 'Choose the account consequence separately from content removal';
    end if;
    if p_account_action = 'temporary_restriction'
       and p_restriction_days not in (1, 3, 7, 30) then
      raise exception 'Temporary restrictions must be 1, 3, 7, or 30 days';
    end if;
    if p_account_action <> 'temporary_restriction' and p_restriction_days is not null then
      raise exception 'Only temporary restrictions have an expiration';
    end if;
  end if;

  if p_action = 'remove_profile_photo' and report_row.target_kind <> 'profile_photo' then
    raise exception 'This report is not for a profile photo';
  end if;
  if p_action = 'remove_content' and report_row.target_kind not in ('post', 'comment', 'poll_response') then
    raise exception 'This report does not contain removable post content';
  end if;

  -- The established command owns locking, idempotency, evidence preservation,
  -- report closure, audit, notice creation, and outbox insertion. It permits a
  -- finalized removal at Level 2; restricted review then records Level 3 and the
  -- distinct account consequence in this same transaction.
  delegated_severity := case when p_action = 'no_violation' then 'none' else 'level_2' end;
  v_result := public.admin_decide_report_v2(
    p_report_id, p_action, p_policy_code, delegated_severity,
    p_reason, p_user_notice, p_idempotency_key
  );

  v_decision_id := nullif(v_result ->> 'decision_id', '')::uuid;
  select decision.affected_user_id into v_affected_user_id
  from public.moderation_decisions decision where decision.id = v_decision_id;

  if p_action <> 'no_violation' then
    update public.moderation_decisions
    set severity = p_severity
    where id = v_decision_id;

    update public.moderation_account_actions
    set action = p_account_action,
        starts_at = clock_timestamp(),
        ends_at = case when p_account_action = 'temporary_restriction'
          then clock_timestamp() + make_interval(days => p_restriction_days)
          else null end,
        state = 'active'
    where moderation_account_actions.decision_id = v_decision_id
    returning id, ends_at into v_account_action_id, v_restriction_ends_at;

    update public.moderation_notices
    set title = case p_account_action
      when 'temporary_restriction' then 'Your account is temporarily restricted'
      when 'permanent_ban' then 'Your account has been suspended'
      else case when p_action = 'remove_profile_photo'
        then 'Your profile photo was removed'
        else 'Your content was removed' end
    end
    where moderation_notices.decision_id = v_decision_id and kind = 'decision';

    update public.admin_audit_log
    set metadata = metadata || jsonb_build_object(
      'accountAction', p_account_action,
      'restrictionDays', p_restriction_days,
      'restrictedReview', true,
      'severity', p_severity
    )
    where request_id = p_idempotency_key
      and entity_type = 'report'
      and entity_id = p_report_id::text;

    update public.domain_event_outbox event
    set payload = event.payload || jsonb_build_object(
      'accountAction', p_account_action,
      'restrictionEndsAt', v_restriction_ends_at,
      'sendEmail', p_severity in ('level_2', 'level_3')
    )
    where event.event_type = 'moderation.status.changed'
      and event.aggregate_id = v_decision_id
      and event.published_at is null;

    if p_account_action = 'permanent_ban' then
      insert into public.moderation_account_content_states (
        account_action_id, content_kind, content_id, prior_status
      )
      select v_account_action_id, 'post', post.id, post.moderation_status
      from public.posts post
      where post.user_id = v_affected_user_id
        and post.id is distinct from case when report_row.post_id is not null then report_row.post_id else null end
      on conflict do nothing;

      insert into public.moderation_account_content_states (
        account_action_id, content_kind, content_id, prior_status
      )
      select v_account_action_id, 'comment', comment.id, comment.moderation_status
      from public.comments comment
      where comment.user_id = v_affected_user_id
        and comment.id is distinct from case when report_row.comment_id is not null then report_row.comment_id else null end
      on conflict do nothing;

      insert into public.moderation_account_content_states (
        account_action_id, content_kind, content_id, prior_status
      )
      select v_account_action_id, 'poll_response', vote.id, vote.moderation_status
      from public.poll_votes vote
      where vote.user_id = v_affected_user_id
        and vote.id is distinct from case when report_row.poll_vote_id is not null then report_row.poll_vote_id else null end
      on conflict do nothing;

      update public.profiles set is_banned = true where id = v_affected_user_id;
    end if;
  end if;

  v_result := v_result || jsonb_build_object(
    '_moderation_request_sha256',encode(pg_catalog.sha256(convert_to(jsonb_build_array(
  'report',p_report_id,p_action,p_policy_code,p_severity,btrim(coalesce(p_reason,'')),btrim(coalesce(p_user_notice,'')),p_account_action,p_restriction_days
  )::text,'UTF8')),'hex'),
    'restricted_review', true,
    'account_action', p_account_action,
    'restriction_ends_at', v_restriction_ends_at
  );
  update public.admin_portal_command_receipts
  set result = v_result
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  return v_result;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_review_moderation_appeal(p_appeal_id uuid, p_outcome text, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  selected_action public.moderation_account_actions%rowtype;
  selected_user_id uuid;
begin

  -- MODERATION_OUTER_REPLAY_V1: serialize the entire wrapper, not only its delegate.
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then raise exception 'Administrator MFA required'; end if;
  if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderation write access required'; end if;
  if p_appeal_id is null or char_length(coalesce(p_idempotency_key,'')) not between 16 and 160 then
    raise exception 'Invalid command identity'; end if;
  -- Actor/key lock also serializes reuse across the report and appeal wrappers.
  perform pg_advisory_xact_lock(hashtextextended('moderation-command:'||auth.uid()::text||':'||p_idempotency_key,0));
  perform pg_advisory_xact_lock(hashtextextended(p_appeal_id::text,0));
  if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderation write access required'; end if;
  declare saved jsonb; request_hash text := encode(pg_catalog.sha256(convert_to(jsonb_build_array(
  'appeal',p_appeal_id,p_outcome,btrim(coalesce(p_reason,''))
  )::text,'UTF8')),'hex');
  begin
    select receipt.result into saved from public.admin_portal_command_receipts receipt
      where receipt.user_id=auth.uid() and receipt.idempotency_key=p_idempotency_key;
    if (exists(select 1 from public.moderation_appeals a join public.moderation_account_actions c
       on c.decision_id=a.decision_id where a.id=p_appeal_id and c.action in ('temporary_restriction','permanent_ban')))
      and not public.admin_user_has_permission('legal.read') then raise exception 'Restricted safety authorization required'; end if;
    if saved is not null then
      if saved->>'appeal_id' is distinct from p_appeal_id::text
        or saved->>'status' is distinct from (case p_outcome when 'uphold' then 'upheld' when 'reverse' then 'reversed' else null end)
        or (saved ? '_moderation_request_sha256' and saved->>'_moderation_request_sha256' is distinct from request_hash) then
        raise exception 'Idempotency key already used for a different command'; end if;
      -- Historical receipts have no request hash. Return their original outcome only;
      -- never re-run side effects or infer that changed fields were applied.
      return saved;
    end if;
  end;

  select appeal.user_id into selected_user_id
  from public.moderation_appeals appeal where appeal.id = p_appeal_id;

  select account_action.* into selected_action
  from public.moderation_appeals appeal
  join public.moderation_account_actions account_action
    on account_action.decision_id = appeal.decision_id
  where appeal.id = p_appeal_id;

  if selected_action.action in ('temporary_restriction', 'permanent_ban')
     and not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required';
  end if;

  v_result := public.admin_review_moderation_appeal_before_account_restrictions_20260924(
    p_appeal_id, p_outcome, p_reason, p_idempotency_key
  );

  if p_outcome = 'reverse' and selected_action.action = 'permanent_ban' then
    if not exists (
      select 1 from public.moderation_account_actions other_action
      where other_action.user_id = selected_user_id
        and other_action.action = 'permanent_ban'
        and other_action.state = 'active'
    ) then
      update public.profiles set is_banned = false where id = selected_user_id;
    end if;

    update public.posts post set moderation_status = prior.prior_status
    from public.moderation_account_content_states prior
    where prior.account_action_id = selected_action.id
      and prior.content_kind = 'post' and prior.content_id = post.id;

    update public.comments comment set moderation_status = prior.prior_status
    from public.moderation_account_content_states prior
    where prior.account_action_id = selected_action.id
      and prior.content_kind = 'comment' and prior.content_id = comment.id;

    update public.poll_votes vote set moderation_status = prior.prior_status
    from public.moderation_account_content_states prior
    where prior.account_action_id = selected_action.id
      and prior.content_kind = 'poll_response' and prior.content_id = vote.id;
  end if;

  v_result := v_result || jsonb_build_object('account_action_reversed',
    p_outcome = 'reverse' and selected_action.id is not null,
    '_moderation_request_sha256',encode(pg_catalog.sha256(convert_to(jsonb_build_array(
  'appeal',p_appeal_id,p_outcome,btrim(coalesce(p_reason,''))
  )::text,'UTF8')),'hex'));
  update public.admin_portal_command_receipts set result=v_result
    where user_id=auth.uid() and idempotency_key=p_idempotency_key;
  return v_result;
end;
$function$
;
commit;

