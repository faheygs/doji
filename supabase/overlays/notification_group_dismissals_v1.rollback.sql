-- Retain dismissal state and additive snapshot commands for installed binaries.
begin;
set local lock_timeout='2s';
update social_notification_private.configuration set enabled=false where singleton;
do $rollback$
declare saved record;
begin
 for saved in select * from social_notification_private.group_dismissal_originals loop
  if pg_get_functiondef(saved.signature::regprocedure) not in(saved.definition,saved.installed_definition) then
   raise exception 'Intervening notification history change: %',saved.signature;
  end if;
  execute saved.definition;
 end loop;
end;
$rollback$;
commit;
