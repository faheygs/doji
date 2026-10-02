-- Disambiguate the PL/pgSQL target-user variable from reports.reported_user_id.
create or replace function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  v_reported_user_id uuid;
  related_reports integer := 0;
  open_related_reports integer := 0;
  prior_enforcements integer := 0;
  suggested_policy text;
begin
  base := public.get_admin_report_case_v2_legacy_20260924(p_report_id);
  v_reported_user_id := nullif(base #>> '{reported_user,id}', '')::uuid;

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

  if v_reported_user_id is not null then
    select
      count(*) filter (where report.id <> p_report_id)::integer,
      count(*) filter (where report.id <> p_report_id and report.status = 'pending')::integer
    into related_reports, open_related_reports
    from public.reports report
    where report.reported_user_id = v_reported_user_id;

    select count(*)::integer into prior_enforcements
    from public.moderation_decisions decision
    where decision.affected_user_id = v_reported_user_id
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

