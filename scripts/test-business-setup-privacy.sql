-- Synthetic fixtures only. Roll back the complete privacy execution.
begin;
update business_private.privacy_settings set enabled=true;
update portal_identity_private.business_privacy_settings set enabled=true;
insert into business_private.privacy_cases(id,account_id,kind,verification_reference,due_at)
 values('86000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','access','synthetic:verified',now()+interval '1 day');
select pg_temp.ok(portal_identity_private.export_business_setup_target('86000000-0000-4000-8000-000000000001',1,'https://issuer.test/','business')->'brand_profile'->'details'->>'description'='Our brand','privacy export contains saved brand');
select pg_temp.denied($q$select portal_identity_private.export_business_setup_target('86000000-0000-4000-8000-000000000001',2,'https://issuer.test/','business')$q$,'PT409','privacy export requires current case revision');
select pg_temp.denied($q$select portal_identity_private.export_business_setup_target('86000000-0000-4000-8000-000000000001',1,'https://wrong.test/','business')$q$,'42501','privacy export cannot cross directory');
select pg_temp.ok(not has_function_privilege('doji_identity_resolver','portal_identity_private.export_business_setup_target(uuid,bigint,text,text)','execute'),'browser runtime cannot export another business');
select pg_temp.ok(not has_function_privilege('service_role','portal_identity_private.export_business_setup_target(uuid,bigint,text,text)','execute'),'generic service role cannot export brand');
insert into business_private.privacy_cases(id,account_id,kind,state,verification_reference,due_at,execution_id)
 values('86000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','erasure','executing','synthetic:verified',now()+interval '1 day','87000000-0000-4000-8000-000000000001');
insert into business_private.privacy_controls(account_id,erasure_case_id,hold_reference)
 values('82000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002','synthetic:hold');
update business_private.accounts set disabled=true where id='82000000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select portal_identity_private.finish_business_identity_erasure('86000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','https://issuer.test/','business','user_owner','workos-404:'||repeat('a',64))$q$,'55000','hold prevents brand erasure');
select pg_temp.ok((select count(*)=1 from business_private.brand_profiles),'held brand is retained');
update business_private.privacy_controls set hold_reference=null;
select pg_temp.denied($q$select portal_identity_private.finish_business_identity_erasure('86000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','https://issuer.test/','business','user_owner','not-provider-evidence')$q$,'42501','brand cleanup cannot bypass provider evidence');
select portal_identity_private.finish_business_identity_erasure('86000000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000001','https://issuer.test/','business','user_owner','workos-404:'||repeat('a',64));
select pg_temp.ok((select count(*)=0 from business_private.brand_profiles),'authorized erasure removes brand in same transaction');
select pg_temp.ok((select count(*)=0 from business_private.setup_receipts),'authorized erasure removes setup receipt fingerprints');
rollback;
select pg_temp.ok((select count(*)=1 from business_private.brand_profiles),'rolled-back privacy execution restores brand');
