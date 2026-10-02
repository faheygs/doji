-- The super administrator is Doji's final operational authority. Ordinary
-- moderation operators remain separated from their own original decisions,
-- while a super admin may resolve an otherwise-stuck appeal with AAL2, a fresh
-- rationale, idempotency, and an explicit immutable audit marker.

create or replace function public.admin_review_moderation_appeal_before_account_restrictions_20260924(
  p_appeal_id uuid,
  p_outcome text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  actor_role text;
  appeal_row public.moderation_appeals%rowtype;
  decision_row public.moderation_decisions%rowtype;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  prior_result jsonb;
  final_result jsonb;
  super_admin_override boolean := false;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  actor_role := public.admin_current_operator_role();
  if p_outcome not in ('uphold', 'reverse') then raise exception 'Invalid appeal outcome'; end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'Enter an appeal rationale between 10 and 1000 characters';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_appeal_id::text, 0));
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into appeal_row from public.moderation_appeals
  where id = p_appeal_id for update;
  if not found then raise exception 'Appeal not found'; end if;
  if appeal_row.status <> 'pending' then raise exception 'Appeal is already closed'; end if;

  select * into decision_row from public.moderation_decisions
  where id = appeal_row.decision_id for update;
  super_admin_override := decision_row.decided_by = uid and actor_role = 'super_admin';
  if decision_row.decided_by = uid and not super_admin_override then
    raise exception 'Appeals must be reviewed by a different operator';
  end if;

  if p_outcome = 'reverse' then
    if decision_row.content_kind = 'post' then
      update public.posts set moderation_status = 'visible'
      where id = decision_row.content_id and moderation_status = 'removed';
    elsif decision_row.content_kind = 'comment' then
      update public.comments set moderation_status = 'visible'
      where id = decision_row.content_id and moderation_status = 'removed';
    elsif decision_row.content_kind = 'poll_response' then
      update public.poll_votes set moderation_status = 'visible'
      where id = decision_row.content_id and moderation_status = 'removed';
    elsif decision_row.content_kind = 'profile_photo' then
      update public.profiles
      set avatar_url = decision_row.original_payload ->> 'avatar_url'
      where id = decision_row.affected_user_id and avatar_url is null;
    end if;

    update public.moderation_decisions
    set state = 'reversed', reversed_by = uid, reversed_at = clock_timestamp(),
        reversal_reason = normalized_reason
    where id = decision_row.id;
    update public.moderation_account_actions
    set state = 'reversed'
    where decision_id = decision_row.id and state = 'active';
  end if;

  update public.moderation_appeals
  set status = case when p_outcome = 'reverse' then 'reversed' else 'upheld' end,
      reviewed_by = uid, reviewed_at = clock_timestamp(), review_reason = normalized_reason
  where id = p_appeal_id
  returning * into appeal_row;

  insert into public.moderation_notices (decision_id, user_id, kind, title, body)
  values (
    decision_row.id, appeal_row.user_id,
    case when p_outcome = 'reverse' then 'appeal_reversed' else 'appeal_upheld' end,
    case when p_outcome = 'reverse' then 'Your appeal was approved' else 'Your appeal was reviewed' end,
    case when p_outcome = 'reverse'
      then 'We reversed the original decision and restored the affected content when restoration was possible. ' || normalized_reason
      else 'We upheld the original decision after review. ' || normalized_reason end
  );

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason, request_id, metadata
  ) values (
    uid, actor_role, 'appeal.' || p_outcome,
    'moderation_appeal', p_appeal_id::text, normalized_reason, p_idempotency_key,
    jsonb_build_object(
      'decisionId', decision_row.id,
      'originalDeciderId', decision_row.decided_by,
      'superAdminOverride', super_admin_override
    )
  );

  perform public.enqueue_domain_event(
    'moderation:global', 'moderation.appeal.reviewed', p_appeal_id,
    jsonb_build_object('version', 1, 'appealId', p_appeal_id), null
  );
  perform public.enqueue_domain_event(
    'user:' || appeal_row.user_id::text || ':events', 'moderation.status.changed', decision_row.id,
    jsonb_build_object('version', 1, 'decisionId', decision_row.id), null
  );

  final_result := jsonb_build_object(
    'appeal_id', appeal_row.id,
    'decision_id', appeal_row.decision_id,
    'status', appeal_row.status,
    'reviewed_at', appeal_row.reviewed_at,
    'super_admin_override', super_admin_override
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.admin_review_moderation_appeal_before_account_restrictions_20260924(uuid, text, text, text)
  from public, anon, authenticated;

comment on function public.admin_review_moderation_appeal_before_account_restrictions_20260924(uuid, text, text, text) is
  'Atomically upholds or reverses an appeal. A different operator is required unless the AAL2 reviewer is the super administrator; that override is explicitly audited.';

