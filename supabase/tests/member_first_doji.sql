begin;
set local statement_timeout='30s';
create function pg_temp.check_first(v boolean,label text) returns text language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %',label; end if;
  return 'PASS: '||label;
end $$;
grant execute on function pg_temp.check_first(boolean,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','first-doji-'||n||'@test.invalid',now(),
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,4)n;
insert into public.profiles(id,username,display_name,timezone,created_at)
select ('99610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'first_doji_'||n,'Synthetic member','America/Denver',now()-interval '7 days' from generate_series(1,4)n;
insert into public.challenges(id,title,description,type,category,poll_kind,answer_rule)
select ('99620000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'Synthetic first Doji '||n,'Offline fixture',
 (array['photo','task','format','poll','poll'])[n],'creative',case when n=5 then 'wyr' when n=4 then 'poll' end,
 case when n=3 then '{"type":"exact_word_count","count":3}'::jsonb end
 from generate_series(1,5)n;
insert into public.daily_events(id,challenge_id,fires_at,window_minutes)
select ('99630000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99620000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()-interval '1 minute',10
 from generate_series(1,5)n;
-- Read fixtures bypass notification/reward triggers only inside this rolled-back offline transaction.
alter table public.user_events disable trigger user;
insert into public.user_events(id,user_id,daily_event_id,status,expires_at,completed_at)
select ('99640000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid,
 ('99610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99630000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,'completed',now()+interval '9 minutes',
 '2026-01-01'::timestamptz + (4-n)*interval '1 second'
 from generate_series(1,5)e cross join generate_series(1,3)n;
alter table public.user_events enable trigger user;
alter table public.posts disable trigger user;
insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility)
select ('99650000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid,
 ('99640000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid,
 ('99610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99630000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,'photo','public'
 from generate_series(1,3)e cross join generate_series(1,3)n;
-- Scheduling already creates the community cards; do not manufacture duplicates.
alter table public.posts enable trigger user;
insert into public.poll_options(id,challenge_id,text,position)
select ('99660000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,
 ('99620000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,'Synthetic option',0
 from generate_series(4,5)e;
alter table public.poll_votes disable trigger user;
insert into public.poll_votes(id,user_event_id,user_id,daily_event_id,challenge_id,option_id,idempotency_key)
select ('99670000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid,
 ('99640000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid,
 ('99610000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99630000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,
 ('99620000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,
 ('99660000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,
 ('99670000-0000-4000-8000-'||lpad((e*10+n)::text,12,'0'))::uuid
 from generate_series(4,5)e cross join generate_series(1,3)n;
alter table public.poll_votes enable trigger user;
insert into public.friendships(requester_id,addressee_id,status) values
 ('99610000-0000-4000-8000-000000000001','99610000-0000-4000-8000-000000000002','accepted');
set local request.jwt.claims='{"sub":"99610000-0000-4000-8000-000000000001","role":"authenticated"}';
create function pg_temp.first_winner(e integer default 1,audience text default 'everyone') returns jsonb language sql as $$
 select public.get_first_doji_v1(('99630000-0000-4000-8000-'||lpad(e::text,12,'0'))::uuid,audience) $$;
grant execute on function pg_temp.first_winner(integer,text) to authenticated;
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner(n)->'profile'->>'username'='first_doji_3','all kinds select earliest confirmed member '||n) from generate_series(1,5)n;
select pg_temp.check_first(pg_temp.first_winner(n,'friends')->'profile'->>'username'='first_doji_2','friend/self scope '||n) from generate_series(1,5)n;
select pg_temp.check_first((select array_agg(key order by key) from jsonb_object_keys(pg_temp.first_winner()->'profile')key)=array['avatar_url','display_name','equipped_border_key','id','username'],'safe projection only');
do $$ begin
 begin perform pg_temp.first_winner(1,null); raise exception 'null audience accepted'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.first_winner(1,'invalid'); raise exception 'invalid audience accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
insert into public.blocks(blocker_id,blocked_id) values ('99610000-0000-4000-8000-000000000003','99610000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner(n)->'profile'->>'username'='first_doji_2','reverse block '||n) from generate_series(1,5)n;
reset role;
delete from public.blocks where blocker_id='99610000-0000-4000-8000-000000000003';
insert into public.blocks(blocker_id,blocked_id) values ('99610000-0000-4000-8000-000000000001','99610000-0000-4000-8000-000000000003');
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner()->'profile'->>'username'='first_doji_2','forward block');
reset role;
delete from public.blocks where blocker_id='99610000-0000-4000-8000-000000000001';
update public.posts set moderation_status='quarantined' where id='99650000-0000-4000-8000-000000000013';
update public.poll_votes set moderation_status='quarantined' where id='99670000-0000-4000-8000-000000000043';
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner()->'profile'->>'username'='first_doji_2','moderated post excluded');
select pg_temp.check_first(pg_temp.first_winner(4)->'profile'->>'username'='first_doji_2','moderated answer excluded');
reset role;
insert into public.reports(reporter_id,reported_user_id,post_id,reason,target_kind) values
 ('99610000-0000-4000-8000-000000000001','99610000-0000-4000-8000-000000000002','99650000-0000-4000-8000-000000000012','spam','post');
insert into public.reports(reporter_id,reported_user_id,poll_vote_id,reason,target_kind) values
 ('99610000-0000-4000-8000-000000000001','99610000-0000-4000-8000-000000000002','99670000-0000-4000-8000-000000000042','spam','poll_response');
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner()->'profile'->>'username'='first_doji_1','reported post excluded; self eligible');
select pg_temp.check_first(pg_temp.first_winner(4)->'profile'->>'username'='first_doji_1','reported answer excluded');
reset role;
alter table public.user_events disable trigger user;
update public.user_events set completed_at='2026-01-01' where daily_event_id='99630000-0000-4000-8000-000000000002';
alter table public.user_events enable trigger user;
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner(2)->'profile'->>'username'='first_doji_1','equal timestamps use stable occurrence ID');
reset role;
update public.posts set moderation_status='removed' where daily_event_id='99630000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_first(pg_temp.first_winner(2) is null,'no eligible submission is null, not a fabricated winner');
reset role;
insert into public.daily_event_audience(daily_event_id,user_id) values
 ('99630000-0000-4000-8000-000000000003','99610000-0000-4000-8000-000000000003');
set local role authenticated;
do $$ begin
 begin perform pg_temp.first_winner(3); raise exception 'cohort bypass'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims='{"sub":"99610000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
do $$ begin
 begin perform pg_temp.first_winner(); raise exception 'locked feed bypass'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.check_first(not has_function_privilege('anon','public.get_first_doji_v1(uuid,text)','execute'),'anonymous denied');
select pg_temp.check_first(not has_schema_privilege('authenticated','first_doji_private','usage'),'private helper denied');
rollback;
select 'PASS: first Doji audience, all kinds, privacy, permissions and tie fixtures rolled back';
