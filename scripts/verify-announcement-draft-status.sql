-- Read-only assurance: never call the member claim RPC (it records impressions).
begin read only;
set local statement_timeout='5s';
select jsonb_build_object(
  'checked_at',clock_timestamp(),
  'total',count(*),
  'enabled',count(*) filter(where a.enabled),
  'enabled_future',count(*) filter(where a.enabled and a.starts_at>now()),
  'enabled_current',count(*) filter(where a.enabled and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now())),
  'drafts',count(*) filter(where s.state='draft'),
  'incorrectly_enabled_drafts',count(*) filter(where s.state='draft' and a.enabled)
) as announcement_status
from public.app_announcements a left join public.admin_announcement_state s on s.announcement_id=a.id;
rollback;
