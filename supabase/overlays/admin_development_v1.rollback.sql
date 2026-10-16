-- Disable first; retain audit, credential hashes and persona records for recovery.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
update admin_development_private.settings set enabled=false where singleton;
revoke execute on function admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid) from doji_staging_development;
commit;
-- If a later definition has drifted, access remains disabled while recovery is reviewed.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$declare r record;begin
 for r in select * from admin_development_private.restore order by signature loop
  if md5(pg_get_functiondef(r.signature::regprocedure))<>r.installed_hash then
   raise exception 'Refusing to overwrite newer function: %',r.signature;end if;
  execute r.original;
 end loop;
end$$;
commit;
