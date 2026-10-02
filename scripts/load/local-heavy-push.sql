-- Runs after load measurements; rollback removes every synthetic endpoint/claim.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='120s';
insert into public.device_push_endpoints(user_id,installation_id,provider,platform,environment,token,notification_contract_version)
select local_load.id(n),'synthetic-install-'||n,case when n%2=0 then 'apns' else 'fcm' end,
 case when n%2=0 then 'ios' else 'android' end,'sandbox','synthetic-never-send-'||n,2
from generate_series(1,100000) n;
-- Newly bulk-loaded endpoints need statistics before evaluating the query plan.
analyze public.device_push_endpoints;
insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at)
values(local_load.id(3,'a3'),local_load.id(1,'a2'),clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '10 minutes');
create temp table seen_recipients(user_id uuid primary key) on commit drop;
do $$declare started timestamptz:=clock_timestamp(); shard smallint; after_id uuid; page uuid[]; pages integer:=0; lease jsonb; targets jsonb; key text; delivered integer; plan_ms numeric;
begin
 perform local_load.require(cardinality(public.list_doji_push_fanout_shards(local_load.id(3,'a3')))=128);
 plan_ms:=extract(epoch from clock_timestamp()-started)*1000;
 for shard in 0..127 loop
  after_id:=null;
  loop
   select array_agg(user_id order by user_id) into page from public.get_doji_push_recipients_shard_page(local_load.id(3,'a3'),shard::smallint,after_id,500);
   pages:=pages+1;
   exit when coalesce(cardinality(page),0)=0;
   perform local_load.require(cardinality(page)<=500);
   insert into seen_recipients select unnest(page);
   select jsonb_agg(jsonb_build_object('userId',uid,'endpointKey','load-coverage-endpoint')) into targets from unnest(page) uid;
   select count(*) into delivered from public.claim_push_delivery_targets_batch_v2(local_load.id(8,'a7'),targets,'doji_live',null,'daily_event',local_load.id(3,'a3')::text,clock_timestamp());
   perform local_load.require(delivered=cardinality(page));
   select count(*) into delivered from public.claim_push_delivery_targets_batch_v2(local_load.id(8,'a7'),targets,'doji_live',null,'daily_event',local_load.id(3,'a3')::text,clock_timestamp());
   perform local_load.require(delivered=0);
   after_id:=page[cardinality(page)];
   exit when cardinality(page)<500;
  end loop;
  if shard%16=15 then raise notice 'Recipient selection reached shard % (% pages)',shard,pages; end if;
 end loop;
 perform local_load.require((select count(*)=100000 from seen_recipients));
 raise notice 'RECIPIENT_RESULT %',json_build_object('recipients',100000,'pages',pages,'plan_ms',plan_ms,'selection_claim_replay_ms',extract(epoch from clock_timestamp()-started)*1000,'claimed_once',100000,'duplicate_claims',0,'actual_provider_requests',0);
 lease:=public.claim_doji_push_fanout_shard(local_load.id(3,'a3'),0::smallint);
 perform local_load.require(lease->>'state'='claimed');
 perform local_load.require(public.claim_doji_push_fanout_shard(local_load.id(3,'a3'),0::smallint)->>'state'='busy');
 perform local_load.require(not public.advance_doji_push_fanout_shard(local_load.id(3,'a3'),0::smallint,gen_random_uuid(),null,false,0,0));
 perform local_load.require(public.advance_doji_push_fanout_shard(local_load.id(3,'a3'),0::smallint,(lease->>'lease_id')::uuid,null,false,0,0));
 perform local_load.require(not public.advance_doji_push_fanout_shard(local_load.id(3,'a3'),0::smallint,(lease->>'lease_id')::uuid,null,false,0,0));
 targets:=jsonb_build_array(jsonb_build_object('userId',local_load.id(55555),'endpointKey','synthetic-endpoint'));
 select count(*) into delivered from public.claim_push_delivery_targets_batch_v2(local_load.id(3,'a7'),targets,'doji_live',null,'daily_event',local_load.id(3,'a3')::text,clock_timestamp());
 perform local_load.require(delivered=1);
 select count(*) into delivered from public.claim_push_delivery_targets_batch_v2(local_load.id(3,'a7'),targets,'doji_live',null,'daily_event',local_load.id(3,'a3')::text,clock_timestamp());
 perform local_load.require(delivered=0);
 key:='outbox-push:'||local_load.id(3,'a7')||':'||local_load.id(55555)||':synthetic-endpoint';
 for i in 1..3 loop
  perform public.record_push_delivery_results(jsonb_build_array(jsonb_build_object('deliveryKey',key,'outcome','transport_error')));
  select count(*) into delivered from public.claim_push_delivery_targets_batch_v2(local_load.id(3,'a7'),targets,'doji_live',null,'daily_event',local_load.id(3,'a3')::text,clock_timestamp());
  perform local_load.require(delivered=case when i<3 then 1 else 0 end);
 end loop;
 perform local_load.require((select attempts=3 from public.push_delivery_claims where delivery_key=key));
 -- Fault injection: an expired launch must not be revived by another claim.
 update public.daily_events set activated_at=clock_timestamp()-interval '3 minutes' where id=local_load.id(3,'a3');
 perform local_load.require(cardinality(public.list_doji_push_fanout_shards(local_load.id(3,'a3')))=0);
 perform local_load.require(public.claim_doji_push_fanout_shard(local_load.id(3,'a3'),1::smallint)->>'reason'='expired');
 raise notice 'PASS: 100k exact recipient coverage, bounded paging, exclusive shard lease, stale/replayed advance rejection, duplicate suppression, three-attempt transport cap, expired-launch rejection. No provider contacted.';
end $$;
rollback;
