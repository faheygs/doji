create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end$$;
create function pg_temp.denied(statement text,code text,label text) returns text language plpgsql as $$begin
 begin execute statement; exception when others then if sqlstate=code then return 'PASS: '||label; else raise; end if; end;
 raise exception 'FAIL: % unexpectedly succeeded',label;end$$;
insert into portal_identity_private.realms(realm,enabled,issuer,audience) values
 ('business',true,'https://issuer.test/','business');
select portal_identity_private.bind_identity('business','user_owner','82000000-0000-4000-8000-000000000001','synthetic');
select portal_identity_private.bind_identity('business','other','82000000-0000-4000-8000-000000000002','synthetic');
update portal_identity_private.principals set state='active';
update business_private.settings set enabled=true,application_terms_version='test',privacy_version='test';
update portal_identity_private.business_read_settings set enabled=true;
insert into business_private.accounts(id) values('82000000-0000-4000-8000-000000000001'),('82000000-0000-4000-8000-000000000002');
insert into business_private.applications(id,applicant_id,state,submission) values
 ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','approved',1),
 ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','pending',0);
insert into business_private.submissions(application_id,submission,details,terms_version,privacy_version,accepted_at)
 values('83000000-0000-4000-8000-000000000001',1,'{"brand_name":"Approved brand","website":"https://example.com"}','test','test',now());
insert into business_private.organizations(id,application_id,status,approved_submission)
 values('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','active',1);
insert into business_private.memberships values('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','owner');
create function pg_temp.setup(action text default 'read',rev bigint default null,details jsonb default null,key uuid default null,mfa boolean default false,subject text default 'user_owner') returns jsonb language sql as $$
 select portal_identity_private.business_setup_v1('https://issuer.test/','business',subject,'session',mfa,action,rev,details,key);$$;
select pg_temp.denied($q$select pg_temp.setup()$q$,'42501','setup defaults closed');
update business_private.setup_settings set enabled=true;
select pg_temp.ok((pg_temp.setup()->'profile'->>'revision')::integer=0,'approved owner gets initial setup without writes');
select pg_temp.ok((select count(*)=0 from business_private.brand_profiles),'read does not create profile');
select pg_temp.ok(pg_temp.setup()->'profile'->'details'->>'website'='https://example.com','approved details prefill setup');
select pg_temp.denied($q$select pg_temp.setup(subject=>'other')$q$,'42501','unapproved account denied');
select pg_temp.denied($q$select pg_temp.setup('workspace')$q$,'42501','workspace needs MFA');
select pg_temp.denied($q$select pg_temp.setup('workspace',mfa=>true)$q$,'PT409','MFA alone does not skip setup');
select pg_temp.denied($q$select pg_temp.setup('complete',0,null,'85000000-0000-4000-8000-000000000001')$q$,'42501','completion needs MFA');
select pg_temp.ok(not has_function_privilege('authenticated','portal_identity_private.business_setup_v1(text,text,text,text,boolean,text,bigint,jsonb,uuid)','execute'),'member denied new command');
select pg_temp.ok(not has_function_privilege('doji_employee','portal_identity_private.business_setup_v1(text,text,text,text,boolean,text,bigint,jsonb,uuid)','execute'),'employee cannot impersonate business');
select pg_temp.ok(not has_table_privilege('doji_identity_resolver','business_private.brand_profiles','select'),'resolver cannot read arbitrary branding');
create temp table brand as select '{"description":"Our brand","website":"https://example.com","primary_color":"#123456","secondary_color":"#ABCDEF","logo":""}'::jsonb details;
select pg_temp.ok(business_private.valid_brand_details((select details from brand)),'valid bounded branding');
select pg_temp.ok(not business_private.valid_brand_details((select details||'{"logo":"https://example.com/logo.png"}' from brand)),'remote logo reference rejected');
select pg_temp.ok(not business_private.valid_brand_details((select details||'{"logo":"data:image/svg+xml,<svg/>"}' from brand)),'SVG rejected');
select pg_temp.ok(not business_private.valid_brand_details((select details||'{"organization_id":"other"}' from brand)),'unknown organization override rejected');
select pg_temp.ok(not business_private.valid_brand_details((select details||'{"website":"javascript:alert(1)"}' from brand)),'unsafe website rejected');
select pg_temp.ok(pg_temp.setup('save',0,(select details from brand),'85000000-0000-4000-8000-000000000001')->'profile'->>'revision'='1','branding saved atomically');
select pg_temp.ok(pg_temp.setup('save',0,(select details from brand),'85000000-0000-4000-8000-000000000001')->>'replayed'='true','identical retry replayed');
select pg_temp.ok((select count(*)=1 from business_private.setup_receipts),'retry does not add receipt');
select pg_temp.denied($q$select pg_temp.setup('save',1,(select details from brand),'85000000-0000-4000-8000-000000000001')$q$,'22023','changed payload cannot reuse key');
select pg_temp.denied($q$select pg_temp.setup('save',0,(select details from brand),'85000000-0000-4000-8000-000000000002')$q$,'PT409','stale revision cannot overwrite branding');
select pg_temp.ok(pg_temp.setup('complete',1,null,'85000000-0000-4000-8000-000000000002',true)->'profile'->>'setup_complete'='true','MFA completion grants setup state');
select pg_temp.ok(pg_temp.setup('workspace',mfa=>true)->'profile'->>'brand_name'='Approved brand','workspace reads exact approved business');
select pg_temp.ok(pg_temp.setup('workspace',mfa=>true)->'profile'->>'campaigns_enabled'='false','campaign publishing remains disabled');
select pg_temp.ok(pg_temp.setup('workspace',mfa=>true)->'profile'->>'billing_enabled'='false','billing remains disabled');
select pg_temp.ok(pg_temp.setup('complete',1,null,'85000000-0000-4000-8000-000000000002',true)->>'replayed'='true','completion replay does not change completion time');
update business_private.applications set state='pending' where id='83000000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select pg_temp.setup('workspace',mfa=>true)$q$,'42501','approval reopen denies existing setup');
update business_private.applications set state='approved' where id='83000000-0000-4000-8000-000000000001';
update business_private.accounts set disabled=true where id='82000000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select pg_temp.setup()$q$,'42501','disabled business denied');
update business_private.accounts set disabled=false where id='82000000-0000-4000-8000-000000000001';
select portal_identity_private.revoke_session('business','user_owner','session','synthetic');
select pg_temp.denied($q$select pg_temp.setup()$q$,'42501','revoked session denied');
