-- Fail closed first. Preserve employees, audit and legacy per-person grants.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
update admin_development_private.settings set enabled=false where singleton;
update admin_development_private.credentials set employee_directory_access=false;
commit;
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';
do $$declare r record;begin
 for r in select * from admin_development_private.directory_restore order by signature loop
  if md5(pg_get_functiondef(r.signature::regprocedure))<>r.installed_hash then
   raise exception 'Refusing to overwrite newer function: %',r.signature;end if;
  execute r.original;
 end loop;
end$$;
-- Keep staff-actor audit references: v2 employees must not disappear from history.
commit;
