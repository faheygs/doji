-- Keep the operator workflow aligned with the hierarchical member-reporting
-- taxonomy. Member selections are allegations and may suggest, but never make,
-- the final operator classification.

alter table public.moderation_decisions
  drop constraint if exists moderation_decisions_policy_code_check;

alter table public.moderation_decisions
  add constraint moderation_decisions_policy_code_check check (policy_code in (
    'no_violation', 'sexual_content', 'sexual_exploitation', 'child_safety',
    'nonconsensual_intimate_imagery', 'harassment_bullying', 'self_harm',
    'hate', 'violence_threats', 'human_exploitation', 'restricted_goods',
    'impersonation', 'spam_scam', 'intellectual_property', 'privacy', 'other'
  ));

alter function public.get_admin_command_center_snapshot_v2(integer)
  rename to get_admin_command_center_snapshot_v2_legacy_20260924;

revoke all on function public.get_admin_command_center_snapshot_v2_legacy_20260924(integer)
  from public, anon, authenticated;

create function public.get_admin_command_center_snapshot_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  patched_work jsonb;
begin
  base := public.get_admin_command_center_snapshot_v2_legacy_20260924(p_limit);

  select coalesce(jsonb_agg(
    case when item ->> 'queue' = 'moderation' and report.id is not null then
      item || jsonb_build_object(
        'queue', case when triage.queue = 'restricted_safety' then 'safety' else 'moderation' end,
        'subject', case report.target_kind
          when 'post' then 'Post report'
          when 'comment' then 'Comment report'
          when 'poll_response' then 'Poll response report'
          when 'profile_photo' then 'Profile photo report'
          when 'account' then 'Account report'
          else 'Content report'
        end,
        'secondary', coalesce(
          initcap(replace(nullif(report.reason_detail, ''), '_', ' ')),
          initcap(replace(report.reason, '_', ' '))
        ),
        'category', case report.reason
          when 'bullying_harassment' then 'Bullying or unwanted contact'
          when 'self_harm' then 'Suicide, self-harm or eating disorders'
          when 'violence_hate_exploitation' then 'Violence, hate or exploitation'
          when 'restricted_goods' then 'Selling or promoting restricted items'
          when 'sexual_content' then 'Nudity or sexual activity'
          when 'spam_scam' then 'Scam, fraud or spam'
          when 'intellectual_property' then 'Intellectual property'
          when 'privacy' then 'Privacy violation'
          when 'impersonation' then 'Impersonation'
          else 'Other concern'
        end,
        'priority', coalesce(triage.priority, item ->> 'priority'),
        'status', case when triage.queue = 'restricted_safety' then 'urgent' else item ->> 'status' end,
        'label', case when triage.queue = 'restricted_safety' then 'Restricted' else item ->> 'label' end,
        'visibility', case when triage.queue = 'restricted_safety'
          then 'Restricted evidence'
          else 'Authorized evidence available'
        end,
        'next_step', case when triage.queue = 'restricted_safety'
          then 'Complete the restricted safety review and record an audited disposition.'
          else 'Review the authorized evidence and confirm the policy classification before deciding.'
        end,
        'target_kind', report.target_kind,
        'reason', report.reason,
        'reason_detail', report.reason_detail
      )
    else item end
    order by item_ordinal
  ), '[]'::jsonb)
  into patched_work
  from jsonb_array_elements(coalesce(base -> 'work_items', '[]'::jsonb))
    with ordinality as work(item, item_ordinal)
  left join public.reports report
    on item ->> 'queue' = 'moderation'
   and report.id::text = item ->> 'id'
  left join public.admin_report_triage triage on triage.report_id = report.id;

  return jsonb_set(base, '{work_items}', patched_work, true);
end;
$$;

revoke all on function public.get_admin_command_center_snapshot_v2(integer)
  from public, anon;
grant execute on function public.get_admin_command_center_snapshot_v2(integer)
  to authenticated;

alter function public.get_admin_report_case_v2(uuid)
  rename to get_admin_report_case_v2_legacy_20260924;

revoke all on function public.get_admin_report_case_v2_legacy_20260924(uuid)
  from public, anon, authenticated;

create function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  reported_user_id uuid;
  related_reports integer := 0;
  open_related_reports integer := 0;
  prior_enforcements integer := 0;
  suggested_policy text;
begin
  base := public.get_admin_report_case_v2_legacy_20260924(p_report_id);
  reported_user_id := nullif(base #>> '{reported_user,id}', '')::uuid;

  suggested_policy := case
    when base ->> 'reason' = 'bullying_harassment' then 'harassment_bullying'
    when base ->> 'reason' = 'self_harm' then 'self_harm'
    when base ->> 'reason' = 'restricted_goods' then 'restricted_goods'
    when base ->> 'reason' = 'spam_scam' then 'spam_scam'
    when base ->> 'reason' = 'intellectual_property' then 'intellectual_property'
    when base ->> 'reason' = 'privacy' then 'privacy'
    when base ->> 'reason' = 'impersonation' then 'impersonation'
    when base ->> 'reason' = 'sexual_content'
      and base ->> 'reason_detail' = 'child_sexual_content' then 'child_safety'
    when base ->> 'reason' = 'sexual_content'
      and base ->> 'reason_detail' = 'nonconsensual_intimate_images' then 'nonconsensual_intimate_imagery'
    when base ->> 'reason' = 'sexual_content'
      and base ->> 'reason_detail' = 'sexual_exploitation' then 'sexual_exploitation'
    when base ->> 'reason' = 'sexual_content' then 'sexual_content'
    when base ->> 'reason' = 'violence_hate_exploitation'
      and base ->> 'reason_detail' = 'hate_content' then 'hate'
    when base ->> 'reason' = 'violence_hate_exploitation'
      and base ->> 'reason_detail' = 'human_exploitation' then 'human_exploitation'
    when base ->> 'reason' = 'violence_hate_exploitation' then 'violence_threats'
    else 'other'
  end;

  if reported_user_id is not null then
    select
      count(*) filter (where report.id <> p_report_id)::integer,
      count(*) filter (where report.id <> p_report_id and report.status = 'pending')::integer
    into related_reports, open_related_reports
    from public.reports report
    where report.reported_user_id = reported_user_id;

    select count(*)::integer into prior_enforcements
    from public.moderation_decisions decision
    where decision.affected_user_id = reported_user_id
      and decision.report_id <> p_report_id
      and decision.state = 'active'
      and decision.action <> 'no_violation';
  end if;

  return base || jsonb_build_object(
    'reason_label', case base ->> 'reason'
      when 'bullying_harassment' then 'Bullying or unwanted contact'
      when 'self_harm' then 'Suicide, self-harm or eating disorders'
      when 'violence_hate_exploitation' then 'Violence, hate or exploitation'
      when 'restricted_goods' then 'Selling or promoting restricted items'
      when 'sexual_content' then 'Nudity or sexual activity'
      when 'spam_scam' then 'Scam, fraud or spam'
      when 'intellectual_property' then 'Intellectual property'
      when 'privacy' then 'Privacy violation'
      when 'impersonation' then 'Impersonation'
      else 'Other concern'
    end,
    'reason_detail_label', initcap(replace(coalesce(base ->> 'reason_detail', 'Not specified'), '_', ' ')),
    'suggested_policy_code', suggested_policy,
    'policy_catalog', jsonb_build_array(
      jsonb_build_object('code', 'sexual_content', 'label', 'Sexual content'),
      jsonb_build_object('code', 'sexual_exploitation', 'label', 'Sexual exploitation'),
      jsonb_build_object('code', 'child_safety', 'label', 'Child safety'),
      jsonb_build_object('code', 'nonconsensual_intimate_imagery', 'label', 'Non-consensual intimate imagery'),
      jsonb_build_object('code', 'harassment_bullying', 'label', 'Harassment or bullying'),
      jsonb_build_object('code', 'self_harm', 'label', 'Suicide, self-harm or eating disorders'),
      jsonb_build_object('code', 'hate', 'label', 'Hate'),
      jsonb_build_object('code', 'violence_threats', 'label', 'Violence or threats'),
      jsonb_build_object('code', 'human_exploitation', 'label', 'Human exploitation'),
      jsonb_build_object('code', 'restricted_goods', 'label', 'Restricted goods'),
      jsonb_build_object('code', 'impersonation', 'label', 'Impersonation'),
      jsonb_build_object('code', 'spam_scam', 'label', 'Spam or scam'),
      jsonb_build_object('code', 'intellectual_property', 'label', 'Intellectual property'),
      jsonb_build_object('code', 'privacy', 'label', 'Privacy'),
      jsonb_build_object('code', 'other', 'label', 'Other policy violation')
    ),
    'related_context', jsonb_build_object(
      'prior_reports', related_reports,
      'open_reports', open_related_reports,
      'prior_enforcements', prior_enforcements
    )
  );
end;
$$;

revoke all on function public.get_admin_report_case_v2(uuid) from public, anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;

alter function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  rename to admin_decide_report_v2_hierarchical_legacy_20260924;

revoke all on function public.admin_decide_report_v2_hierarchical_legacy_20260924(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;

create function public.admin_decide_report_v2(
  p_report_id uuid,
  p_action text,
  p_policy_code text,
  p_severity text,
  p_reason text,
  p_user_notice text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_policy_code text := case
    when p_policy_code in ('sexual_exploitation', 'self_harm', 'human_exploitation', 'restricted_goods')
      then 'other'
    else p_policy_code
  end;
  result jsonb;
  decision_id uuid;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 10 and 1000
     or char_length(btrim(coalesce(p_user_notice, ''))) not between 10 and 1000 then
    raise exception 'Decision rationale and member notice must be between 10 and 1000 characters';
  end if;
  if p_policy_code not in (
    'no_violation', 'sexual_content', 'sexual_exploitation', 'child_safety',
    'nonconsensual_intimate_imagery', 'harassment_bullying', 'self_harm',
    'hate', 'violence_threats', 'human_exploitation', 'restricted_goods',
    'impersonation', 'spam_scam', 'intellectual_property', 'privacy', 'other'
  ) then raise exception 'Choose a valid policy area'; end if;

  result := public.admin_decide_report_v2_hierarchical_legacy_20260924(
    p_report_id, p_action, legacy_policy_code, p_severity,
    p_reason, p_user_notice, p_idempotency_key
  );

  if p_policy_code in ('sexual_exploitation', 'self_harm', 'human_exploitation', 'restricted_goods') then
    decision_id := nullif(result ->> 'decision_id', '')::uuid;
    update public.moderation_decisions
    set policy_code = p_policy_code
    where id = decision_id;

    update public.admin_audit_log
    set metadata = jsonb_set(metadata, '{policyCode}', to_jsonb(p_policy_code), true)
    where request_id = p_idempotency_key
      and entity_type = 'report'
      and entity_id = p_report_id::text;
  end if;

  return result;
end;
$$;

revoke all on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.admin_decide_report_v2(uuid, text, text, text, text, text, text)
  to authenticated;
