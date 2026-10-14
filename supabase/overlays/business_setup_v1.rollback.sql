-- Retaining freeze. Restore the previous business runtime/UI separately.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update business_private.setup_settings set enabled=false;
revoke execute on function portal_identity_private.business_setup_v1(text,text,text,text,boolean,text,bigint,jsonb,uuid) from doji_identity_resolver;
-- Keep profiles, receipts and committed identifier events. No member changes.
commit;
