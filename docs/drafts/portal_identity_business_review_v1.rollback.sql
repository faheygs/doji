-- Restore only the exact installed business functions; retain all account/audit data.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $$declare r record; begin
 for r in select * from portal_identity_private.business_review_restore order by signature loop
  if pg_get_functiondef(r.signature::regprocedure) is distinct from r.installed_definition then
   raise exception 'Business rollback source drift: %',r.signature; end if;
 end loop;
 -- Business only; never disable the independent employee realm or member Auth.
 update portal_identity_private.realms set enabled=false where realm='business';
 update portal_identity_private.business_enrollment_settings set enabled=false where singleton;
 update portal_identity_private.business_read_settings set enabled=false where singleton;
 update portal_identity_private.business_command_settings set enabled=false where singleton;
 for r in select * from portal_identity_private.business_review_restore order by signature loop
  execute r.prior_definition;
 end loop;
end$$;
commit;
