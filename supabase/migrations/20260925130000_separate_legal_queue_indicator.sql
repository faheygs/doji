-- Keep deadline pressure separate from restricted legal/safety workload.
--
-- `urgent_deadlines` counts every pending report nearing the 24-hour review
-- target. It must not also drive the Legal requests navigation indicator,
-- which represents only open reports routed to `restricted_safety`.

alter function public.get_admin_command_center_snapshot_v2(integer)
  rename to get_admin_command_center_snapshot_v2_before_queue_indicators_20260925;

revoke all on function public.get_admin_command_center_snapshot_v2_before_queue_indicators_20260925(integer)
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
  restricted_safety_open integer := 0;
begin
  base := public.get_admin_command_center_snapshot_v2_before_queue_indicators_20260925(p_limit);

  select count(*)::integer
  into restricted_safety_open
  from public.reports report
  join public.admin_report_triage triage on triage.report_id = report.id
  where report.status = 'pending'
    and triage.queue = 'restricted_safety';

  return jsonb_set(
    base,
    '{metrics,restricted_safety_open}',
    to_jsonb(restricted_safety_open),
    true
  );
end;
$$;

revoke all on function public.get_admin_command_center_snapshot_v2(integer)
  from public, anon;
grant execute on function public.get_admin_command_center_snapshot_v2(integer)
  to authenticated;

comment on function public.get_admin_command_center_snapshot_v2(integer) is
  'Returns bounded active admin work with distinct all-report deadline and open restricted-safety counts.';
