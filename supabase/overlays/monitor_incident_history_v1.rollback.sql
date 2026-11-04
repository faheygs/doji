-- Disable future capture; retain incident evidence and read contracts. No deletion.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update monitor_history_private.settings set enabled=false where id;
commit;
