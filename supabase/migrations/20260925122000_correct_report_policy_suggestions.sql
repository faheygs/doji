-- Member selections are allegations, but the portal suggestion must still map
-- every leaf to the correct policy family before the operator confirms it.

alter function public.get_admin_report_case_v2(uuid)
  rename to get_admin_report_case_v2_before_policy_mapping_20260925;

revoke all on function public.get_admin_report_case_v2_before_policy_mapping_20260925(uuid)
  from public, anon, authenticated;

create function public.get_admin_report_case_v2(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
  reason text;
  detail text;
  suggested_policy text;
begin
  result := public.get_admin_report_case_v2_before_policy_mapping_20260925(p_report_id);
  reason := result ->> 'reason';
  detail := result ->> 'reason_detail';

  suggested_policy := case
    when reason = 'bullying_harassment' then 'harassment_bullying'
    when reason = 'self_harm' then 'self_harm'
    when reason = 'restricted_goods' then 'restricted_goods'
    when reason = 'spam_scam' then 'spam_scam'
    when reason = 'intellectual_property' then 'intellectual_property'
    when reason = 'privacy' then 'privacy'
    when reason = 'impersonation' then 'impersonation'
    when reason = 'sexual_content' and detail = 'child_sexual_content' then 'child_safety'
    when reason = 'sexual_content' and detail = 'nonconsensual_intimate_images'
      then 'nonconsensual_intimate_imagery'
    when reason = 'sexual_content' and detail = 'sexual_exploitation' then 'sexual_exploitation'
    when reason = 'sexual_content' then 'sexual_content'
    when reason = 'violence_hate_exploitation' and detail = 'hate_speech' then 'hate'
    when reason = 'violence_hate_exploitation' and detail = 'human_exploitation'
      then 'human_exploitation'
    when reason = 'violence_hate_exploitation' then 'violence_threats'
    else 'other'
  end;

  return jsonb_set(result, '{suggested_policy_code}', to_jsonb(suggested_policy), true);
end;
$$;

revoke all on function public.get_admin_report_case_v2(uuid) from public, anon;
grant execute on function public.get_admin_report_case_v2(uuid) to authenticated;

comment on function public.get_admin_report_case_v2(uuid) is
  'Returns one bounded report case with an exact taxonomy-aligned, non-authoritative policy suggestion.';
