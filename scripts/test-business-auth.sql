-- Runs inside the existing synthetic offline test transaction, then rolls back.
select pg_temp.check_true(not has_function_privilege('anon','public.claim_business_auth_v1(text,text)','execute'),'anonymous cannot reserve business auth');
select pg_temp.check_true(not has_function_privilege('authenticated','public.claim_business_auth_v1(text,text)','execute'),'members cannot reserve business auth');
select pg_temp.check_true(not has_function_privilege('doji_business','public.claim_business_auth_v1(text,text)','execute'),'business cannot bypass edge admission');
select pg_temp.check_true(has_function_privilege('service_role','public.claim_business_auth_v1(text,text)','execute'),'dedicated service admission grant');
select pg_temp.check_true(not has_table_privilege('service_role','business_private.auth_settings','select,insert,update,delete'),'no direct admission config grants');
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('register','pilot-new@test.invalid')->>'allowed'='false','admission default off');
reset role;
insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values
 ('73000000-0000-4000-8000-000000000001','pilot-confirmed@test.invalid','doji_business','{"account_type":"business"}','{}',now()),
 ('73000000-0000-4000-8000-000000000002','pilot-unconfirmed@test.invalid','doji_business','{"account_type":"business"}','{}',null);
update business_private.auth_settings set enabled=true,pilot_until=now()+interval '1 hour',registration_limit=2,email_limit=4,
 allowed_emails=array['pilot-new@test.invalid','pilot-other@test.invalid','pilot-third@test.invalid','pilot-confirmed@test.invalid','pilot-unconfirmed@test.invalid',
 (select email from auth.users where id=current_setting('test.member')::uuid),
 (select email from auth.users where id=current_setting('test.employee')::uuid)];
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('register','not-allowed@test.invalid')->>'allowed'='false','pilot exact allowlist');
select pg_temp.check_true(public.claim_business_auth_v1('register',(select current_setting('test.member.email')))->>'allowed'='false','registration never converts existing member');
select pg_temp.check_true(public.claim_business_auth_v1('signin',current_setting('test.member.email'))->>'allowed'='false','member rejected before password login');
select pg_temp.check_true(public.claim_business_auth_v1('recover',current_setting('test.member.email'))->>'allowed'='false','no member recovery email');
select pg_temp.check_true(public.claim_business_auth_v1('resend',current_setting('test.employee.email'))->>'allowed'='false','no employee verification email');
select pg_temp.check_true(public.claim_business_auth_v1('register','pilot-new@test.invalid')->>'allowed'='true','creation reserves admission and email');
select pg_temp.check_true(public.claim_business_auth_v1('register','pilot-new@test.invalid')->>'allowed'='false','duplicate request cooldown even before Auth finishes');
select pg_temp.check_true(public.claim_business_auth_v1('register','pilot-other@test.invalid')->>'allowed'='true','second pilot reservation');
select pg_temp.check_true(public.claim_business_auth_v1('register','pilot-third@test.invalid')->>'allowed'='false','total pilot registration cap');
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-unconfirmed@test.invalid')->>'allowed'='false','verify before login');
select pg_temp.check_true(public.claim_business_auth_v1('recover','pilot-unconfirmed@test.invalid')->>'allowed'='false','no recovery of unconfirmed identity');
select pg_temp.check_true(public.claim_business_auth_v1('resend','pilot-confirmed@test.invalid')->>'allowed'='false','no verification of already confirmed identity');
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'user_id'='73000000-0000-4000-8000-000000000001','exact confirmed business login identity');
select pg_temp.check_true(public.claim_business_auth_v1('resend','pilot-unconfirmed@test.invalid')->>'allowed'='true','unconfirmed business resend reserves email');
select pg_temp.check_true(public.claim_business_auth_v1('recover','pilot-confirmed@test.invalid')->>'allowed'='true','confirmed business recovery reserves email');
select pg_temp.check_true(public.claim_business_auth_v1('verify','pilot-unconfirmed@test.invalid')->>'allowed'='true','confirmation allowed during mail cooldown without another email');
select pg_temp.check_true(public.claim_business_auth_v1('verify',current_setting('test.member.email'))->>'allowed'='false','member link verification denied before OTP exchange');
reset role;
select pg_temp.check_true((select emails_used=4 and registrations_used=2 from business_private.auth_settings),'global reservations include failed/unfinished downstream operations');
select pg_temp.check_true(not exists(select 1 from business_private.auth_budgets where email='not-allowed@test.invalid'),'unlisted input never grows identity budget table');
update business_private.auth_budgets set last_mail_at=now()-interval '3 minutes';
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('resend','pilot-unconfirmed@test.invalid')->>'allowed'='false','email total cap does not refill on cooldown');
reset role;
insert into business_private.accounts(id,disabled) values('73000000-0000-4000-8000-000000000001',true)
 on conflict(id) do update set disabled=true;
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','disabled identity cannot login');
select pg_temp.check_true(public.claim_business_auth_v1('verify','pilot-confirmed@test.invalid')->>'allowed'='false','disabled identity cannot redeem a previously generated link');
reset role;
update business_private.accounts set disabled=false where id='73000000-0000-4000-8000-000000000001';
update auth.users set banned_until=now()+interval '1 day' where email='pilot-confirmed@test.invalid';
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','banned identity cannot login');
reset role;
update auth.users set banned_until=null,raw_app_meta_data='{}',raw_user_meta_data='{"account_type":"business"}' where email='pilot-confirmed@test.invalid';
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','user-editable metadata cannot authorize identity');
reset role;
update auth.users set raw_app_meta_data='{"account_type":"business"}' where email='pilot-confirmed@test.invalid';
update auth.users set deleted_at=now() where email='pilot-confirmed@test.invalid';
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','soft-deleted identity cannot login');
reset role;
select set_config('request.jwt.claims','{"sub":"73000000-0000-4000-8000-000000000001","role":"doji_business","aal":"aal2"}',true);
set local role doji_business;
select pg_temp.expect_error('select public.get_business_application_v1()','Verified business');
reset role;
update auth.users set deleted_at=null where email='pilot-confirmed@test.invalid';
update business_private.auth_budgets set attempts=30 where email='pilot-confirmed@test.invalid';
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','per-address attempts capped');
reset role;
update business_private.auth_budgets set attempts=0;
update business_private.auth_settings set attempts=600;
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','global attempts capped');
reset role;
update business_private.auth_settings set attempts=0,pilot_until=now()-interval '1 minute';
set local role service_role;
select pg_temp.check_true(public.claim_business_auth_v1('signin','pilot-confirmed@test.invalid')->>'allowed'='false','expired pilot fails closed');
reset role;
