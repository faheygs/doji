begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.employee_rpc_settings set enabled=false where singleton;
-- Keep independent actor/audit history; no member Auth/session change.
commit;
