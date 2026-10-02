-- Make the account-level outcome explicit in the member Account Status read.
-- Content enforcement and account enforcement remain separate: a removal can
-- issue a warning without implying a suspension or ban.

create or replace function public.get_my_moderation_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then
    jsonb_build_object('notices', '[]'::jsonb, 'decisions', '[]'::jsonb)
  else jsonb_build_object(
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', notice.id,
        'decision_id', notice.decision_id,
        'kind', notice.kind,
        'title', notice.title,
        'body', notice.body,
        'created_at', notice.created_at,
        'read_at', notice.read_at
      ) order by notice.created_at desc, notice.id desc)
      from (
        select * from public.moderation_notices
        where user_id = auth.uid()
        order by created_at desc, id desc
        limit 50
      ) notice
    ), '[]'::jsonb),
    'decisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', decision.id,
        'content_kind', decision.content_kind,
        'action', decision.action,
        'policy_code', decision.policy_code,
        'severity', decision.severity,
        'user_notice', decision.user_notice,
        'appeal_eligible', decision.appeal_eligible,
        'state', decision.state,
        'decided_at', decision.decided_at,
        'account_action', case when account_action.id is null then null else jsonb_build_object(
          'action', account_action.action,
          'state', account_action.state,
          'starts_at', account_action.starts_at,
          'ends_at', account_action.ends_at
        ) end,
        'appeal', case when appeal.id is null then null else jsonb_build_object(
          'id', appeal.id,
          'status', appeal.status,
          'statement', appeal.statement,
          'submitted_at', appeal.submitted_at,
          'reviewed_at', appeal.reviewed_at,
          'review_reason', appeal.review_reason
        ) end
      ) order by decision.decided_at desc, decision.id desc)
      from (
        select * from public.moderation_decisions
        where affected_user_id = auth.uid()
        order by decided_at desc, id desc
        limit 50
      ) decision
      left join public.moderation_appeals appeal on appeal.decision_id = decision.id
      left join lateral (
        select action_row.id, action_row.action, action_row.state,
          action_row.starts_at, action_row.ends_at
        from public.moderation_account_actions action_row
        where action_row.decision_id = decision.id
        order by action_row.created_at desc, action_row.id desc
        limit 1
      ) account_action on true
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.get_my_moderation_status() from public, anon;
grant execute on function public.get_my_moderation_status() to authenticated;

comment on function public.get_my_moderation_status() is
  'Returns the signed-in member''s private moderation notices, content decisions, explicit account outcomes, and appeals.';
