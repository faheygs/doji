create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label; end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(statement text,label text) returns text language plpgsql as $$begin
 begin execute statement; exception when insufficient_privilege then return 'PASS: '||label;end;
 raise exception 'FAIL: % unexpectedly succeeded',label;end$$;
insert into portal_identity_private.realms(realm,enabled,issuer,audience) values
 ('business',true,'https://issuer.example.test/','business'),('employee',true,'https://issuer.example.test/','employee');
select portal_identity_private.bind_identity('business','owner','82000000-0000-4000-8000-000000000001','synthetic');
select portal_identity_private.bind_identity('business','other','82000000-0000-4000-8000-000000000002','synthetic');
select portal_identity_private.bind_identity('business','new','82000000-0000-4000-8000-000000000003','synthetic');
select portal_identity_private.bind_identity('employee','staff','82000000-0000-4000-8000-000000000004','synthetic');
update portal_identity_private.principals set state='active';
update business_private.settings set enabled=true,application_terms_version='test',privacy_version='test';
insert into business_private.accounts(id) values('82000000-0000-4000-8000-000000000001'),('82000000-0000-4000-8000-000000000002');
insert into business_private.applications(id,applicant_id,state,submission,details,response) values
 ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','approved',1,'{"brand_name":"My draft"}','Safe response'),
 ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','draft',0,'{"brand_name":"Other private draft"}','');
insert into business_private.submissions(application_id,submission,details,terms_version,privacy_version,accepted_at)
 values('83000000-0000-4000-8000-000000000001',1,'{"brand_name":"Approved brand"}','test','test',now());
insert into business_private.organizations(id,application_id,status,approved_submission)
 values('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','active',1);
insert into business_private.memberships values('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','owner');
insert into business_private.history(application_id,revision,actor_id,actor_kind,action,response,internal_note)
 values('83000000-0000-4000-8000-000000000001',1,'82000000-0000-4000-8000-000000000004','employee','approve','Safe response','SECRET INTERNAL NOTE');
select pg_temp.ok(not (select enabled from portal_identity_private.business_read_settings),'business bridge defaults disabled');
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',true)$q$,'disabled bridge denies');
update portal_identity_private.business_read_settings set enabled=true;
select pg_temp.ok(not exists(select 1 from auth.users where id::text like '82000000-%'),'external principals need no synthetic shared Auth row');
select pg_temp.ok(not has_function_privilege('authenticated','portal_identity_private.read_business_application(text,text,text,text,boolean)','execute'),'member cannot call bridge');
select pg_temp.ok(not has_function_privilege('doji_employee','portal_identity_private.read_business_application(text,text,text,text,boolean)','execute'),'employee cannot call business bridge');
select pg_temp.ok(not has_function_privilege('doji_business','portal_identity_private.read_business_application(text,text,text,text,boolean)','execute'),'old business browser cannot call bridge');
select pg_temp.ok(not has_function_privilege('service_role','portal_identity_private.read_business_application(text,text,text,text,boolean)','execute'),'existing service role cannot call bridge');
select pg_temp.ok(not has_function_privilege('doji_identity_resolver','portal_identity_private.business_read_actor(text,text,text,text,boolean)','execute'),'resolver has no raw actor helper grant');
select pg_temp.ok(not has_table_privilege('doji_identity_resolver','business_private.applications','select'),'resolver has no table access');
select pg_temp.ok(portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',false)=business_private.item('83000000-0000-4000-8000-000000000001',false),'candidate matches existing applicant projection');
select pg_temp.ok(position('SECRET INTERNAL NOTE' in portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',false)::text)=0,'internal note excluded');
select pg_temp.ok(position('Other private draft' in portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',false)::text)=0,'other business content excluded');
set local role doji_identity_resolver;
select pg_temp.ok(portal_identity_private.read_business_application('https://issuer.example.test/','business','new','sid',false) is null,'new identity sees no invented application');
select pg_temp.ok(portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',false)->>'id'='83000000-0000-4000-8000-000000000001','dedicated verifier role sees exact own application');
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://issuer.example.test/','employee','staff','sid',true)$q$,'employee audience cannot enter business reads');
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://wrong.example.test/','business','owner','sid',true)$q$,'wrong issuer denied');
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://issuer.example.test/','business','unknown','sid',true)$q$,'unknown principal denied');
select pg_temp.denied($q$select portal_identity_private.read_business_workspace('https://issuer.example.test/','business','owner','sid',false)$q$,'workspace still requires MFA');
select pg_temp.denied($q$select portal_identity_private.read_business_workspace('https://issuer.example.test/','business','other','sid',true)$q$,'unapproved business cannot use workspace');
select pg_temp.ok(portal_identity_private.read_business_workspace('https://issuer.example.test/','business','owner','sid',true)=
 '{"organization_id":"84000000-0000-4000-8000-000000000001","role":"owner","brand_name":"Approved brand","campaigns_enabled":false,"billing_enabled":false}'::jsonb,'workspace uses approved snapshot and keeps paid/publishing features off');
reset role;
select pg_temp.ok((select count(*)=2 from business_private.accounts),'reading new identity did not provision an account');
update business_private.accounts set disabled=true where id='82000000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',true)$q$,'application account disable enforced');
update business_private.accounts set disabled=false;
update business_private.organizations set status='suspended';
select pg_temp.denied($q$select portal_identity_private.read_business_workspace('https://issuer.example.test/','business','owner','sid',true)$q$,'suspended workspace denied');
update business_private.organizations set status='active';
select portal_identity_private.revoke_session('business','owner','sid','synthetic');
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','sid',true)$q$,'revoked session cannot read application');
select pg_temp.ok(portal_identity_private.read_business_application('https://issuer.example.test/','business','other','sid',true) is not null,'other business session remains valid');
update portal_identity_private.principals set state='disabled' where id='82000000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','fresh-sid',true)$q$,'disabled identity denied even with new session');
