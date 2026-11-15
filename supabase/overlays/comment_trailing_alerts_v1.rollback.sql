-- Restore this layer before rolling back late-friend or dismissal dependencies.
-- Retain all pending sources, provider claims, acknowledgement and duplicate fences.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
update social_notification_private.configuration set enabled=false where singleton;
do $rollback$
declare saved record;
begin
 for saved in select * from social_notification_private.comment_trailing_originals loop
  if pg_get_functiondef(saved.signature::regprocedure) not in(saved.definition,saved.installed_definition) then
   raise exception 'Intervening comment queue change: %',saved.signature;
  end if;
  execute saved.definition;
 end loop;
end;
$rollback$;
commit;
