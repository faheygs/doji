begin;
set local statement_timeout='60s';
create function pg_temp.check_badge(v boolean,label text) returns text language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end;
$$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','first-badge-'||n||'@test.invalid',now(),
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,2)n;
insert into public.profiles(id,username,display_name,timezone,created_at)
select ('99510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'first_badge_'||n,'Synthetic badge member','America/Denver',now()-interval '7 days' from generate_series(1,2)n;
insert into public.challenges(id,title,description,type,category,poll_kind,answer_rule)
select ('99520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'Synthetic badge '||n,'Offline fixture',(array['photo','task','format','poll','poll'])[n],
 'creative',case when n=5 then 'wyr' when n=4 then 'poll' end,
 case when n=3 then '{"type":"exact_word_count","count":3}'::jsonb end from generate_series(1,5)n;
insert into public.daily_events(id,challenge_id,fires_at,window_minutes)
select ('99530000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99520000-0000-4000-8000-'||lpad((1+(n-1)%5)::text,12,'0'))::uuid,
 now()-interval '1 minute',10 from generate_series(1,109)n;
insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
select ('99540000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid,
 ('99510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99530000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,'pending',now()+interval '9 minutes'
 from generate_series(1,109)e cross join generate_series(1,2)n;
-- Content fixtures precede completion exactly as in the real atomic commands.
insert into public.posts(user_event_id,user_id,daily_event_id,type,visibility,caption)
select id,user_id,daily_event_id,case when (right(daily_event_id::text,12)::integer-1)%5=0 then 'photo' else 'task_complete' end,'public','Synthetic fixture answer' from public.user_events
where id::text like '99540000%' and ((right(daily_event_id::text,12)::integer-1)%5)<3;
insert into public.poll_options(id,challenge_id,text,position)
select ('99560000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99520000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic option',0 from generate_series(4,5)n;
insert into public.poll_votes(user_event_id,user_id,daily_event_id,challenge_id,option_id,idempotency_key)
select u.id,u.user_id,u.daily_event_id,e.challenge_id,
 ('99560000-0000-4000-8000-'||right(e.challenge_id::text,12))::uuid,gen_random_uuid()
from public.user_events u join public.daily_events e on e.id=u.daily_event_id
where u.id::text like '99540000%' and right(e.challenge_id::text,12)::integer in(4,5);
create function pg_temp.finish_badge(e integer,actor integer default 1) returns void language sql as $$
 update public.user_events set status='completed',completed_at=clock_timestamp()
 where id=('99540000-0000-4000-8000-'||lpad((e*10+actor)::text,12,'0'))::uuid;
$$;
select pg_temp.finish_badge(101);
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners),'disabled install awards nothing');
update first_doji_badges_private.settings set enabled_from=now()-interval '30 seconds';
select pg_temp.finish_badge(102);
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners),'pre-enable events are never backfilled');
update first_doji_badges_private.settings set enabled_from=now()-interval '2 minutes';
select pg_temp.finish_badge(1);
select pg_temp.check_badge((select current_tier='bronze' from public.user_badge_progress
 where user_id='99510000-0000-4000-8000-000000000001' and category_id='first_doji'),'Bronze at one');
select pg_temp.finish_badge(1,2);
select pg_temp.finish_badge(1);
select pg_temp.check_badge((select wins=1 from first_doji_badges_private.counts
 where user_id='99510000-0000-4000-8000-000000000001'),'second member and retry do not count');
select pg_temp.finish_badge(n) from generate_series(2,9)n;
select pg_temp.check_badge((select current_tier='bronze' from public.user_badge_progress
 where user_id='99510000-0000-4000-8000-000000000001' and category_id='first_doji'),'nine is still Bronze');
select pg_temp.finish_badge(10);
select pg_temp.check_badge((select current_tier='silver' from public.user_badge_progress
 where user_id='99510000-0000-4000-8000-000000000001' and category_id='first_doji'),'Silver at ten across all five kinds');
select pg_temp.finish_badge(n) from generate_series(11,25)n;
select pg_temp.check_badge((select current_tier='gold' from public.user_badge_progress
 where user_id='99510000-0000-4000-8000-000000000001' and category_id='first_doji'),'Gold at twenty-five');
select pg_temp.finish_badge(n) from generate_series(26,100)n;
select pg_temp.check_badge((select current_tier='diamond' from public.user_badge_progress
 where user_id='99510000-0000-4000-8000-000000000001' and category_id='first_doji'),'Diamond at one hundred');
select pg_temp.check_badge((select count(*)=4 from public.spark_ledger
 where user_id='99510000-0000-4000-8000-000000000001' and reason='badge_unlock' and ref_id like 'first_doji:%'),'exactly four standard badge rewards');
insert into public.blocks(blocker_id,blocked_id) values
 ('99510000-0000-4000-8000-000000000002','99510000-0000-4000-8000-000000000001');
select pg_temp.check_badge((select wins=100 from first_doji_badges_private.counts
 where user_id='99510000-0000-4000-8000-000000000001'),'blocks do not transfer lifetime credit');
savepoint rejected_submission;
select pg_temp.finish_badge(103);
rollback to rejected_submission;
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners
 where daily_event_id='99530000-0000-4000-8000-000000000103'),'rolled-back submission earns nothing');
select pg_temp.finish_badge(103,2);
select pg_temp.check_badge((select user_id='99510000-0000-4000-8000-000000000002' from first_doji_badges_private.winners
 where daily_event_id='99530000-0000-4000-8000-000000000103'),'next committed submission can win after rollback');
update public.poll_votes set moderation_status='removed' where user_event_id='99540000-0000-4000-8000-000000001041';
select pg_temp.finish_badge(104);
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners
 where daily_event_id='99530000-0000-4000-8000-000000000104'),'removed vote cannot earn a win');
update public.profiles set is_demo_account=true where id='99510000-0000-4000-8000-000000000001';
select pg_temp.finish_badge(105);
update public.profiles set is_demo_account=false,is_banned=true where id='99510000-0000-4000-8000-000000000001';
select pg_temp.finish_badge(106);
update public.profiles set is_banned=false where id='99510000-0000-4000-8000-000000000001';
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners
 where daily_event_id in('99530000-0000-4000-8000-000000000105','99530000-0000-4000-8000-000000000106')),'demo and banned actors cannot earn wins');
delete from public.posts where user_event_id='99540000-0000-4000-8000-000000001071';
do $$ begin
  begin perform pg_temp.finish_badge(107); raise exception 'Invalid completion was accepted';
  exception when raise_exception then
    if sqlerrm<>'Cannot complete Doji occurrence without a durable response' then raise; end if;
  end;
end $$;
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners
 where daily_event_id='99530000-0000-4000-8000-000000000107'),'status without actual content earns nothing');
update public.user_events set status='buy_in_open' where id='99540000-0000-4000-8000-000000001072';
update public.user_events set status='late',completed_at=clock_timestamp() where id='99540000-0000-4000-8000-000000001072';
select pg_temp.check_badge((select user_id='99510000-0000-4000-8000-000000000002' from first_doji_badges_private.winners
 where daily_event_id='99530000-0000-4000-8000-000000000107'),'valid late completion uses the same first-place rule');
update public.daily_events set fires_at=now()+interval '1 hour' where id='99530000-0000-4000-8000-000000000108';
select pg_temp.finish_badge(108);
select pg_temp.check_badge(not exists(select 1 from first_doji_badges_private.winners
 where daily_event_id='99530000-0000-4000-8000-000000000108'),'future event cannot award');
set local request.jwt.claims='{"sub":"99510000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$ begin
 if public.get_my_first_doji_wins_v1()<>100 then raise exception 'Wrong own count'; end if;
 begin update first_doji_badges_private.counts set wins=999; raise exception 'Private write allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.check_badge(not has_function_privilege('anon','public.get_my_first_doji_wins_v1()','execute'),'anonymous count denied');
select pg_temp.check_badge(not has_function_privilege('authenticated','first_doji_badges_private.record_completion()','execute'),'member cannot claim wins');
rollback;
select 'PASS: first-Doji milestones, all kinds, grants, disabled gate and retaining rewards';
