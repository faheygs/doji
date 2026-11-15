-- Pause delivery first. Keep batches, sources, claims and duplicate fences.
begin;
set local lock_timeout='2s';
update social_notification_private.configuration set enabled=false where singleton;
do $rollback$
declare saved record;
begin
 for saved in select * from social_notification_private.trailing_originals loop
  if pg_get_functiondef(saved.signature::regprocedure) not in(saved.definition,saved.installed_definition) then
   raise exception 'Intervening trailing-alert change: %',saved.signature;
  end if;
  execute saved.definition;
 end loop;
end;
$rollback$;
commit;
