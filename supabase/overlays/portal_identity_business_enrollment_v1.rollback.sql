-- Freeze only; preserve identities, agreements, usage and audit for recovery.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update portal_identity_private.business_enrollment_settings set enabled=false where singleton;
revoke execute on function portal_identity_private.complete_business_enrollment(text,text,text,text,boolean,boolean,text,text,text)
 from doji_business_enrollment;
commit;
