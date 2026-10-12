-- All wakeups in this test roll back before pg_net can perform network I/O.
begin;
select pg_temp.ok(not (select enabled from business_private.email_sender_settings),'hosted wakeup disabled by default');
select pg_temp.ok(not has_table_privilege('doji_business_mail','business_private.email_sender_settings','select'),'sender login cannot read database signing settings');
select pg_temp.ok(not has_function_privilege('authenticated','business_private.claim_application_email(uuid,uuid)','execute'),'member cannot claim targeted mail');
update business_private.email_settings set capture_enabled=true,sending_enabled=true,daily_limit=10,monthly_limit=100,day_used=0,month_used=0,capacity_verified_until=now()+interval '1 hour';
update business_private.email_sender_settings set enabled=true,signing_key=repeat('a',64);
update business_private.applications set state='approved',revision=20;
select pg_temp.event(20,'approve');
select pg_temp.ok((select wake_request_id is not null and not wake_failed from business_private.email_outbox where revision=20),'approval queues a one-shot wakeup');
select pg_temp.ok((select url='https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/business-application-mail'
 and not (headers ? 'Authorization') and timeout_milliseconds=20000
 and convert_from(body,'UTF8')::jsonb ? 'signature' and convert_from(body,'UTF8') not like '%'||repeat('a',64)||'%'
 from net.http_request_queue where id=(select wake_request_id from business_private.email_outbox where revision=20)),
 'wakeup is pinned and contains a scoped signature, not the signing key');
select pg_temp.ok(business_private.claim_application_email((select id from business_private.email_outbox where revision=20),gen_random_uuid()) is null,'wrong wake nonce cannot claim');
select set_config('test.email.claim',business_private.claim_application_email((select id from business_private.email_outbox where revision=20),(select wake_nonce from business_private.email_outbox where revision=20))::text,false);
select pg_temp.ok((current_setting('test.email.claim')::jsonb->>'revision')::bigint=20,'wakeup claims only its exact job');
select pg_temp.ok(business_private.claim_application_email((select id from business_private.email_outbox where revision=20),(select wake_nonce from business_private.email_outbox where revision=20)) is null,'replayed wake cannot claim twice');
select pg_temp.ok((select day_used=1 and month_used=1 from business_private.email_settings),'wake replay does not spend more quota');
update business_private.email_sender_settings set enabled=false;
select pg_temp.event(21,'approve');
select pg_temp.ok((select wake_request_id is null from business_private.email_outbox where revision=21),'disabled sender creates no network request');
rollback;
