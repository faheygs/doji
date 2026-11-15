begin;
set local statement_timeout='20s';
create function pg_temp.trailing_id(n integer) returns uuid language sql immutable as $$
 select ('99870000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.assert_trailing(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end;
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.trailing_id(n),'trailing-'||n||'@test.invalid',jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,3)n;
insert into public.profiles(id,username,display_name) select pg_temp.trailing_id(n),'trailing_'||n,'Trailing fixture '||n from generate_series(1,3)n;
update social_notification_private.configuration set enabled=true;
create function pg_temp.enqueue_trailing(n integer) returns void language sql as $$
 select social_notification_private.enqueue(coalesce(nullif(current_setting('doji.test.social_kind',true),''),'late_friend_participation'),pg_temp.trailing_id(1),pg_temp.trailing_id(10),pg_temp.trailing_id(n),pg_temp.trailing_id(2),clock_timestamp());
$$;
select pg_temp.enqueue_trailing(20);
select pg_temp.enqueue_trailing(21);
select pg_temp.assert_trailing((select count(*)=1 from social_notification_private.batches),'initial burst groups');
select pg_temp.assert_trailing((select count(*)=2 from social_notification_private.items),'both sources retained');
update social_notification_private.batches set sealed_at=clock_timestamp(),due_at=clock_timestamp(),prepared_sources=array[pg_temp.trailing_id(20),pg_temp.trailing_id(21)];
select pg_temp.enqueue_trailing(22);
select pg_temp.enqueue_trailing(23);
select pg_temp.enqueue_trailing(22);
select pg_temp.assert_trailing((select count(*)=2 from social_notification_private.batches),'new activity becomes trailing batch, not discarded');
select pg_temp.assert_trailing((select count(*)=4 from social_notification_private.items),'new burst retained once');
select pg_temp.assert_trailing((select due_at>=clock_timestamp()+interval '55 seconds' from social_notification_private.batches where sealed_at is null),'one-minute spacing');
select pg_temp.assert_trailing((select count(*)=2 from social_notification_private.items i join social_notification_private.batches b on b.id=i.batch_id where b.sealed_at is null),'trailing copy excludes previously covered sources');

-- Force a delayed-worker recovery with two due batches. Preparation releases
-- only its exact lease back to the durable scheduler; no provider is called.
update social_notification_private.batches set due_at=clock_timestamp()-interval '1 second' where sealed_at is null;
update public.domain_event_outbox set lease_id=pg_temp.trailing_id(99),leased_at=clock_timestamp(),available_at=clock_timestamp()
 where id in(select outbox_id from social_notification_private.batches where sealed_at is null);
select pg_temp.assert_trailing((select public.prepare_social_phone_alert_v1(outbox_id,pg_temp.trailing_id(99))->>'deferred'='true' from social_notification_private.batches where sealed_at is null),'recovery defers instead of bursting');
select pg_temp.assert_trailing((select lease_id is null and leased_at is null and available_at>clock_timestamp() from public.domain_event_outbox where id in(select outbox_id from social_notification_private.batches where sealed_at is null)),'deferred lease released with next available time');
do $$ begin
 begin
  perform public.prepare_social_phone_alert_v1((select outbox_id from social_notification_private.batches where sealed_at is null),pg_temp.trailing_id(98));
  raise exception 'stale lease admitted';
 exception when others then if sqlerrm<>'Social notification lease lost' then raise;end if;end;
end $$;

-- A saturated pending batch must not eat overflow IDs.
select pg_temp.enqueue_trailing(n) from generate_series(100,210)n;
select pg_temp.assert_trailing((select count(*)=115 from social_notification_private.items),'overflow sources retained');
select pg_temp.assert_trailing((select max(n)<=100 from(select count(*) n from social_notification_private.items group by batch_id)s),'preparation remains bounded');
select pg_temp.assert_trailing((select count(*)=3 from social_notification_private.batches),'overflow creates one queued batch');
select pg_temp.assert_trailing(not has_function_privilege('authenticated','public.prepare_social_phone_alert_v1(uuid,uuid)','execute'),'delivery remains service-only');
select pg_temp.assert_trailing(not has_schema_privilege('authenticated','social_notification_private','usage'),'private queue remains private');
set local request.jwt.claims='{"sub":"99870000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select public.mark_notification_attention_seen(jsonb_build_array(jsonb_build_object('scope_kind','daily_event','scope_id',pg_temp.trailing_id(10),'observed_through',now()-interval '2 minutes')));
reset role;
select pg_temp.assert_trailing((select seen_at=now()-interval '2 minutes' from public.notification_attention_state where user_id=pg_temp.trailing_id(1)),'opening older alert cannot mark newer activity seen');
set local role authenticated;
select public.mark_notification_attention_seen(jsonb_build_array(jsonb_build_object('scope_kind','daily_event','scope_id',pg_temp.trailing_id(10),'observed_through',now()-interval '3 minutes')));
reset role;
select pg_temp.assert_trailing((select seen_at=now()-interval '2 minutes' from public.notification_attention_state where user_id=pg_temp.trailing_id(1)),'out-of-order receipts cannot regress seen watermark');
rollback;
select 'PASS: trailing social queue';
