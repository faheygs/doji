-- Disable all candidate producer/runtime/browser flags BEFORE this inverse.
-- No member data or prior functions are deleted. Capture these three metadata
-- rows and any pending health-outbox IDs as bounded rollback evidence first.
begin;
set local lock_timeout='2s';set local statement_timeout='8s';
update employee_health_private.settings set enabled=false where id;
drop trigger employee_health_history_changed on public.admin_daily_event_health_snapshots;
drop function employee_health_private.history_changed();
drop function portal_identity_private.employee_health_rpc_v1(text,text,text,text,boolean,text,jsonb);
drop function public.get_admin_health_feed_v1();
drop function public.record_employee_health_change_v1(text,timestamptz,text);
drop table employee_health_private.sources;
drop table employee_health_private.settings;
drop schema employee_health_private;
-- Durable identifier-only outbox events remain; subscribers are disabled first.
commit;
