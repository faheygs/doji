-- LOCAL rollback rehearsal only: restores the two original anon EXECUTE grants.
-- Do not deploy blindly: compare a fresh ACL snapshot before any approved release.
-- This deliberately restores the prior excess permissions, not a safer final state.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';
set local role postgres;
grant execute on function public.claim_active_app_announcement() to anon;
grant execute on function public.record_app_announcement_action(uuid, text) to anon;
commit;
