-- Disable writers/deletion, retaining measurements, holds and cleanup receipts.
-- Restore the prior Edge package first; no inverse can restore deleted cron logs.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update workflow_health_private.settings
 set observations_enabled=false,scheduler_retention_enabled=false where id;
commit;
