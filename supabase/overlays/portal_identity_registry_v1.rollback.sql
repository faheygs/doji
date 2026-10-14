-- Freeze only this unconnected candidate. Preserve identity and audit evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.realms set enabled=false;
revoke execute on function portal_identity_private.resolve_identity(text,text,text,text,text,boolean) from doji_identity_resolver;
commit;
