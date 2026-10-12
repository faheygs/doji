create or replace function pg_temp.ok(p boolean,label text) returns text language plpgsql as $$begin
 if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
update business_session_private.owned_auth_settings set enabled=true,scope_hash=repeat('a',64);
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),repeat('1',64))->>'state'='disabled','mail starts disabled');
update business_session_private.owned_auth_mail_settings set enabled_until=clock_timestamp()+interval '1 hour';
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),repeat('1',64))->>'state'='denied','mail requires a committed recovery admission');
insert into business_session_private.owned_auth_tickets(key_hash,action,epoch,expires_at)
 select md5('mail'||n)||md5('mail'||n),case when n=12 then 'signin' else 'recover' end,1,clock_timestamp()+interval '5 minutes' from generate_series(1,13) n;
set local role doji_business_session;
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail1')||md5('mail1'))->>'state'='reserved','restricted business role reserves one mail');
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail1')||md5('mail1'))->>'state'='spent','duplicate reservation never authorizes another send');
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail12')||md5('mail12'))->>'state'='denied','signin admission cannot authorize mail');
reset role;
do $$begin for n in 2..10 loop
 perform business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail'||n)||md5('mail'||n));end loop;end$$;
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail11')||md5('mail11'))->>'state'='limited','rolling daily mail cap holds');
select pg_temp.ok((select count(*)=10 from business_session_private.owned_auth_mail_reservations),'denials do not increase reservations');
update business_session_private.owned_auth_mail_reservations set reserved_at=clock_timestamp()-interval '2 days';
insert into business_session_private.owned_auth_mail_reservations(ticket_hash,reserved_at)
 select md5('monthly'||n)||md5('monthly'||n),clock_timestamp()-interval '2 days' from generate_series(1,90) n;
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail11')||md5('mail11'))->>'state'='limited','rolling 31-day mail cap holds');
update business_session_private.owned_auth_mail_reservations set reserved_at=clock_timestamp()-interval '32 days';
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail11')||md5('mail11'))->>'state'='reserved','bounded expiry cleanup permits recovery');
select pg_temp.ok((select count(*)=69 from business_session_private.owned_auth_mail_reservations),'cleanup removes at most 32 reservations');
update business_session_private.owned_auth_tickets set expires_at=clock_timestamp()-interval '1 second' where key_hash=md5('mail13')||md5('mail13');
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail13')||md5('mail13'))->>'state'='denied','expired admission cannot send');
update business_session_private.owned_auth_mail_settings set enabled_until=clock_timestamp()-interval '1 second';
select pg_temp.ok(business_session_private.reserve_owned_recovery_email_v1(repeat('a',64),md5('mail13')||md5('mail13'))->>'state'='disabled','mail release window expires closed');
select pg_temp.ok(not has_function_privilege('authenticated','business_session_private.reserve_owned_recovery_email_v1(text,text)','execute')
 and not has_function_privilege('anon','business_session_private.reserve_owned_recovery_email_v1(text,text)','execute')
 and not has_function_privilege('doji_employee','business_session_private.reserve_owned_recovery_email_v1(text,text)','execute')
 and not has_function_privilege('service_role','business_session_private.reserve_owned_recovery_email_v1(text,text)','execute'),'member and employee roles cannot reserve business mail');
select pg_temp.ok(not has_table_privilege('doji_business_session','business_session_private.owned_auth_mail_settings','update')
 and not has_table_privilege('doji_business_session','business_session_private.owned_auth_mail_reservations','insert'),'runtime cannot widen mail gate or bypass cap');
