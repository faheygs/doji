-- Restricted review must remain restricted across triage and appeal paths, while
-- a temporary restriction must never remove the member's reporting/blocking tools.

create or replace function public.reject_banned_actor_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  restriction_kind text;
begin
  if uid is null then return new; end if;

  select case
    when profile.is_banned is true or exists (
      select 1 from public.moderation_account_actions action_row
      where action_row.user_id = uid
        and action_row.action = 'permanent_ban'
        and action_row.state = 'active'
    ) then 'suspended'
    when exists (
      select 1 from public.moderation_account_actions action_row
      where action_row.user_id = uid
        and action_row.action = 'temporary_restriction'
        and action_row.state = 'active'
        and action_row.ends_at > clock_timestamp()
    ) then 'temporarily restricted'
    else null
  end
  into restriction_kind
  from public.profiles profile
  where profile.id = uid;

  -- A temporary participation restriction never removes personal safety controls
  -- or delivery registration. Permanent suspension still uses the locked screen.
  if restriction_kind = 'temporarily restricted'
     and tg_table_name in ('blocks', 'reports', 'device_push_endpoints') then
    return new;
  end if;

  if restriction_kind is not null then
    raise exception using
      errcode = '42501',
      message = case when restriction_kind = 'suspended'
        then 'This account is suspended'
        else 'This account is temporarily restricted' end;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_banned_actor_write()
  from public, anon, authenticated;

alter function public.admin_triage_report(uuid, text, text, text, text)
  rename to admin_triage_report_before_restricted_guard_20260924;

revoke all on function public.admin_triage_report_before_restricted_guard_20260924(uuid, text, text, text, text)
  from public, anon, authenticated;

create function public.admin_triage_report(
  p_report_id uuid,
  p_action text,
  p_priority text,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.admin_report_triage triage
    where triage.report_id = p_report_id and triage.queue = 'restricted_safety'
  ) and not public.admin_user_has_permission('legal.read') then
    raise exception 'Restricted safety authorization required';
  end if;

  return public.admin_triage_report_before_restricted_guard_20260924(
    p_report_id, p_action, p_priority, p_note, p_idempotency_key
  );
end;
$$;

revoke all on function public.admin_triage_report(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.admin_triage_report(uuid, text, text, text, text)
  to authenticated;

create or replace function public.get_admin_appeals_snapshot(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.read') then
    raise exception 'Moderation access required';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', appeal.id,
    'decision_id', appeal.decision_id,
    'report_id', decision.report_id,
    'status', appeal.status,
    'statement', appeal.statement,
    'submitted_at', appeal.submitted_at,
    'policy_code', decision.policy_code,
    'severity', decision.severity,
    'content_kind', decision.content_kind,
    'account_action', account_action.action,
    'original_decider_id', decision.decided_by,
    'user', jsonb_build_object(
      'id', profile.id,
      'username', profile.username,
      'display_name', profile.display_name
    )
  ) order by appeal.submitted_at, appeal.id), '[]'::jsonb)
  into result
  from (
    select * from public.moderation_appeals
    where status = 'pending'
    order by submitted_at, id
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
  ) appeal
  join public.moderation_decisions decision on decision.id = appeal.decision_id
  join public.profiles profile on profile.id = appeal.user_id
  left join public.moderation_account_actions account_action
    on account_action.decision_id = decision.id
  where account_action.action not in ('temporary_restriction', 'permanent_ban')
     or public.admin_user_has_permission('legal.read');
  return result;
end;
$$;

revoke all on function public.get_admin_appeals_snapshot(integer) from public, anon;
grant execute on function public.get_admin_appeals_snapshot(integer) to authenticated;

create or replace function public.admin_review_moderation_appeal(
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
  v_result jsonb;
  selected_action public.moderation_account_actions%rowtype;
  selected_user_id uuid;
begin
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

  return v_result || jsonb_build_object('account_action_reversed',
    p_outcome = 'reverse' and selected_action.id is not null);
end;
$$;

revoke all on function public.admin_review_moderation_appeal(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_review_moderation_appeal(uuid, text, text, text)
  to authenticated;
