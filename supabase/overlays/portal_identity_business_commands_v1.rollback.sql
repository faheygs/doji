-- Stop only the new path and restore the exact prior legacy command definition.
-- Refuse to overwrite a command changed since this candidate was installed.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.business_command_settings set enabled=false where singleton;
revoke execute on function portal_identity_private.business_application_command(text,text,text,text,boolean,text,bigint,jsonb,text,text,uuid) from doji_identity_resolver;
do $$declare saved portal_identity_private.command_restore%rowtype; current_definition text; begin
 select * into strict saved from portal_identity_private.command_restore where singleton for update;
 current_definition:=pg_get_functiondef('public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)'::regprocedure);
 if current_definition=saved.prior_definition then return; end if;
 if current_definition is distinct from saved.installed_definition then
  raise exception 'Business command rollback refused: intervening change requires review'; end if;
 execute saved.prior_definition;
end$$;
-- Retain core, records and audit. No member/Auth/identity deletion or grant change.
commit;
