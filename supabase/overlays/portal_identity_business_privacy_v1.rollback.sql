-- Retain cases, audit history, principal bindings and deletion evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.business_privacy_settings set enabled=false where singleton;
-- Bound session creation is additive and safe to retain; rollback never restores
-- deleted users or un-revokes credentials. Signup remains gated independently.
commit;
