-- PREPARATION ONLY. Restore old portal callers/routing before applying.
-- Run in one transaction. No CASCADE: unexpected dependencies must stop rollback.
drop function public.get_admin_appeal_case_v1(uuid);
drop function public.get_admin_report_case_v3(uuid);
