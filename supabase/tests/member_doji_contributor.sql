begin;
set local statement_timeout='30s';
create function pg_temp.check_credit(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
grant execute on function pg_temp.check_credit(boolean,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
  'contributor-'||n||'@test.invalid',now(),jsonb_build_object('terms_version','2026-08-20',
  'privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,3)n;
insert into public.profiles(id,username,display_name,created_at)
select ('99710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'contributor_'||n,
  'Synthetic contributor',now()-interval '7 days' from generate_series(1,3)n;
insert into public.challenges(id,title,description,type,category,poll_kind,answer_rule)
select ('99720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic prompt','Offline fixture',
  (array['photo','task','format','poll','poll'])[n],'creative',case when n=5 then 'wyr' when n=4 then 'poll' end,
  case when n=3 then '{"type":"exact_word_count","count":3}'::jsonb end from generate_series(1,5)n;
insert into public.daily_events(id,challenge_id,fires_at,activated_at,window_minutes)
select ('99730000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('99720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,now()-interval '1 minute',now()-interval '1 minute',10
  from generate_series(1,5)n;
-- Only fixture setup suppresses reward/notice triggers, inside this rolled-back offline transaction.
alter table public.challenge_suggestions disable trigger user;
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,status)
select ('99740000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'99710000-0000-4000-8000-000000000002',
  (array['photo_idea','question','format_question','poll','wyr'])[n],'Synthetic prompt '||n,md5('Synthetic prompt '||n),'approved' from generate_series(1,5)n;
alter table public.challenge_suggestions enable trigger user;
insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id)
select ('99740000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'99710000-0000-4000-8000-000000000003',
  'approved',('99720000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5)n;
create function pg_temp.credit(n integer default 1) returns jsonb language sql as $$
  select public.get_doji_contributor_v1(('99730000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid) $$;
grant execute on function pg_temp.credit(integer) to authenticated;
select pg_temp.check_credit(not has_function_privilege('anon','public.get_doji_contributor_v1(uuid)','execute'),'anonymous grant');
select pg_temp.check_credit(not has_function_privilege('service_role','public.get_doji_contributor_v1(uuid)','execute'),'service default grant');
set local request.jwt.claims='{"sub":"99710000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit(n)->'profile'->>'username'='contributor_2','all Doji kinds') from generate_series(1,5)n;
select pg_temp.check_credit((select array_agg(key order by key) from jsonb_object_keys(pg_temp.credit()->'profile')key)
  =array['avatar_url','display_name','equipped_border_key','id','username'],'safe fields');
do $$ begin
  begin perform pg_temp.credit(9); raise exception 'missing event permitted'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.admin_suggestion_reviews; raise exception 'editorial table exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into public.blocks(blocker_id,blocked_id) values('99710000-0000-4000-8000-000000000002','99710000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'reverse block');
reset role;
delete from public.blocks where blocker_id='99710000-0000-4000-8000-000000000002';
insert into public.blocks(blocker_id,blocked_id) values('99710000-0000-4000-8000-000000000001','99710000-0000-4000-8000-000000000002');
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'forward block');
reset role;
delete from public.blocks where blocker_id='99710000-0000-4000-8000-000000000001';
insert into public.friendships(requester_id,addressee_id,status) values('99710000-0000-4000-8000-000000000002','99710000-0000-4000-8000-000000000001','blocked');
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'legacy blocked friendship');
reset role;
delete from public.friendships where requester_id='99710000-0000-4000-8000-000000000002';
update public.profiles set is_banned=true where id='99710000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'banned author');
reset role;
update public.profiles set is_banned=false where id='99710000-0000-4000-8000-000000000002';
update public.admin_suggestion_reviews set decision='pending' where suggestion_id='99740000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'unapproved link');
reset role;
update public.admin_suggestion_reviews set decision='approved' where suggestion_id='99740000-0000-4000-8000-000000000001';
insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id) values
  ('99740000-0000-4000-8000-000000000009','99710000-0000-4000-8000-000000000003','approved','99720000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'ambiguous authorship');
reset role;
delete from public.admin_suggestion_reviews where challenge_id='99720000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_credit(pg_temp.credit() is null,'unattributed challenge');
reset role;
insert into public.daily_event_audience(daily_event_id,user_id) values('99730000-0000-4000-8000-000000000002','99710000-0000-4000-8000-000000000003');
update public.daily_events set activated_at=null where id='99730000-0000-4000-8000-000000000003';
set local role authenticated;
do $$ begin
  begin perform pg_temp.credit(2); raise exception 'audience leak'; exception when insufficient_privilege then null; end;
  begin perform pg_temp.credit(3); raise exception 'prelive leak'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set is_banned=true where id='99710000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform pg_temp.credit(4); raise exception 'banned viewer'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'PASS: contributor fixtures rolled back';
