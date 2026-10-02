-- Resolved evidence remains retained and available only to the same AAL2,
-- permission-scoped moderation readers. Reopening a case is a workflow action;
-- it does not reverse the existing decision or change member-visible content.

create or replace function public.can_read_post_media(
  p_object_path text,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.posts post
    where (
        public.public_storage_object_path(post.photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.front_photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.video_url, 'post-media') = p_object_path
      )
      and (
        (
          post.moderation_status = 'visible'
          and public.can_view_full_post(
            p_viewer,
            post.user_event_id,
            post.daily_event_id,
            post.user_id,
            coalesce(post.is_community_poll, false)
          )
        )
        or (
          p_viewer = auth.uid()
          and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          and public.admin_user_has_permission('moderation.read')
          and exists (
            select 1
            from public.reports report
            left join public.admin_report_triage triage on triage.report_id = report.id
            where report.post_id = post.id
              and report.status in ('pending', 'dismissed', 'actioned')
              and (
                coalesce(triage.queue, 'moderation') = 'moderation'
                or (
                  coalesce(triage.queue, 'moderation') = 'restricted_safety'
                  and public.admin_user_has_permission('legal.read')
                )
              )
          )
        )
      )
  ), false);
$$;

revoke all on function public.can_read_post_media(text, uuid) from public, anon;
grant execute on function public.can_read_post_media(text, uuid) to authenticated;

comment on function public.can_read_post_media(text, uuid) is
  'Authorizes visible member media or retained report evidence for an AAL2 permission-scoped operator, including resolved cases.';

create or replace function public.admin_set_report_review_state_v1(
  p_report_id uuid,
  p_action text,
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
  report_row public.reports%rowtype;
  triage_row public.admin_report_triage%rowtype;
  decision_row public.moderation_decisions%rowtype;
  prior_result jsonb;
  final_result jsonb;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  actor_role text;
  closing_status text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if p_action not in ('reopen', 'reclose') then
    raise exception 'Invalid review-state action';
  end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'Enter a review reason between 10 and 1000 characters';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into report_row
  from public.reports report
  where report.id = p_report_id
  for update;
  if not found then raise exception 'Report not found'; end if;

  select * into triage_row
  from public.admin_report_triage triage
  where triage.report_id = p_report_id
  for update;
  if not found then raise exception 'Report triage state not found'; end if;

  if triage_row.queue = 'restricted_safety'
     and not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required';
  end if;
  if exists (
    select 1 from public.moderation_appeals appeal
    join public.moderation_decisions decision on decision.id = appeal.decision_id
    where decision.report_id = p_report_id
  ) then
    raise exception 'Appealed cases must remain in the independent appeal workflow';
  end if;

  select * into decision_row
  from public.moderation_decisions decision
  where decision.report_id = p_report_id and decision.state = 'active'
  order by decision.decided_at desc, decision.id desc
  limit 1;
  if not found or decision_row.action = 'quarantine' then
    raise exception 'Only a finalized moderation decision can enter a follow-up review';
  end if;

  actor_role := public.admin_current_operator_role();

  if p_action = 'reopen' then
    if report_row.status not in ('dismissed', 'actioned') or triage_row.resolved_at is null then
      raise exception 'Only a resolved case can be reopened';
    end if;
    update public.reports set status = 'pending' where id = p_report_id;
    update public.admin_report_triage
    set assigned_to = uid,
        assigned_at = clock_timestamp(),
        resolved_at = null,
        resolved_by = null,
        updated_at = clock_timestamp()
    where report_id = p_report_id
    returning * into triage_row;
  else
    if report_row.status <> 'pending' or triage_row.resolved_at is not null then
      raise exception 'Only a reopened case can be returned to the archive';
    end if;
    if not exists (
      select 1 from public.admin_audit_log audit
      where audit.entity_type = 'report'
        and audit.entity_id = p_report_id::text
        and audit.action = 'report.reopened'
        and not exists (
          select 1 from public.admin_audit_log later
          where later.entity_type = audit.entity_type
            and later.entity_id = audit.entity_id
            and later.action = 'report.reclosed'
            and (later.occurred_at, later.id) > (audit.occurred_at, audit.id)
        )
    ) then
      raise exception 'This case is not in a reopened review cycle';
    end if;
    closing_status := case when decision_row.action = 'no_violation' then 'dismissed' else 'actioned' end;
    update public.reports set status = closing_status where id = p_report_id;
    update public.admin_report_triage
    set assigned_to = coalesce(assigned_to, uid),
        assigned_at = coalesce(assigned_at, clock_timestamp()),
        resolved_at = clock_timestamp(),
        resolved_by = uid,
        updated_at = clock_timestamp()
    where report_id = p_report_id
    returning * into triage_row;
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason,
    request_id, metadata
  ) values (
    uid, actor_role, 'report.' || case when p_action = 'reopen' then 'reopened' else 'reclosed' end,
    'report', p_report_id::text, normalized_reason, p_idempotency_key,
    jsonb_build_object(
      'decisionId', decision_row.id,
      'decisionAction', decision_row.action,
      'enforcementChanged', false
    )
  );

  perform public.enqueue_domain_event(
    'moderation:global', 'moderation.report.changed', p_report_id,
    jsonb_build_object('version', 3, 'reportId', p_report_id), null
  );

  final_result := jsonb_build_object(
    'report_id', p_report_id,
    'status', case when p_action = 'reopen' then 'pending' else closing_status end,
    'review_state', case when p_action = 'reopen' then 'reopened' else 'resolved' end,
    'assigned_to', triage_row.assigned_to,
    'resolved_at', triage_row.resolved_at,
    'decision_id', decision_row.id,
    'enforcement_changed', false
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.admin_set_report_review_state_v1(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_set_report_review_state_v1(uuid, text, text, text)
  to authenticated;

comment on function public.admin_set_report_review_state_v1(uuid, text, text, text) is
  'Atomically reopens or recloses a finalized report for audited follow-up review without changing the existing moderation decision, account action, member notice, or content state.';
