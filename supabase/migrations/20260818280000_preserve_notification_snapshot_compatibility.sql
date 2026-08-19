-- Existing TestFlight builds only understand the established notification
-- kinds. Keep the wire format backward-compatible; newer clients group the
-- bounded snapshot for presentation before visibility/dismissal filtering.
drop function public.get_notification_center_snapshot(timestamptz, integer);

alter function public.get_notification_center_snapshot_ungrouped(timestamptz, integer)
  rename to get_notification_center_snapshot;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer)
  from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer)
  to authenticated;
