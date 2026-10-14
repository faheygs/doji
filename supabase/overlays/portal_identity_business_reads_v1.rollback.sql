-- Candidate access freeze only. No deletion, member grant or provider change.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.business_read_settings set enabled=false where singleton;
revoke execute on function portal_identity_private.read_business_application(text,text,text,text,boolean),
 portal_identity_private.read_business_workspace(text,text,text,text,boolean) from doji_identity_resolver;
commit;
