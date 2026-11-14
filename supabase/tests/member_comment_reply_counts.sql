begin;
set local statement_timeout='45s';
create function pg_temp.check_reply_count(v boolean,label text) returns text language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %',label; end if;
  return 'PASS: '||label;
end $$;
grant execute on function pg_temp.check_reply_count(boolean,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','comment-scale-'||n||'@test.invalid',now(),
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,4)n;
insert into public.profiles(id,username,display_name,timezone,created_at)
select ('99710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'comment_scale_'||n,'Synthetic comment member','America/Denver',now()-interval '7 days'
 from generate_series(1,4)n;
insert into public.challenges(id,title,description,type,category) values
 ('99720000-0000-4000-8000-000000000001','Synthetic reply counts','Offline read fixture','photo','creative');
insert into public.daily_events(id,challenge_id,fires_at,window_minutes) values
 ('99730000-0000-4000-8000-000000000001','99720000-0000-4000-8000-000000000001',now()-interval '1 minute',10);
insert into public.user_events(user_id,daily_event_id,status,expires_at)
select ('99710000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '99730000-0000-4000-8000-000000000001','completed',now()+interval '9 minutes' from generate_series(1,3)n;
insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility)
select '99740000-0000-4000-8000-000000000001',id,user_id,daily_event_id,'photo','public'
 from public.user_events where user_id='99710000-0000-4000-8000-000000000001';
insert into public.friendships(requester_id,addressee_id,status) values
 ('99710000-0000-4000-8000-000000000001','99710000-0000-4000-8000-000000000002','accepted');
-- Only the disposable fixture bypasses write-side notification triggers.
alter table public.comments disable trigger user;
insert into public.comments(id,post_id,user_id,body,created_at)
select ('99750000-0000-4000-8000-'||lpad((900000+n)::text,12,'0'))::uuid,
 '99740000-0000-4000-8000-000000000001','99710000-0000-4000-8000-000000000001',
 'Synthetic root '||n,'2026-01-01'::timestamptz-n*interval '1 second' from generate_series(1,50)n;
insert into public.comments(id,post_id,user_id,body,created_at,parent_id)
select ('99750000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '99740000-0000-4000-8000-000000000001',
 ('99710000-0000-4000-8000-'||lpad((1+n%3)::text,12,'0'))::uuid,
 'Synthetic reply '||n,'2026-01-02'::timestamptz+n*interval '1 second',
 case when n<=100000 then '99750000-0000-4000-8000-000000900001'::uuid
      else '99750000-0000-4000-8000-000000900002'::uuid end from generate_series(1,100001)n;
alter table public.comments enable trigger user;
analyze public.comments;
set local request.jwt.claims='{"sub":"99710000-0000-4000-8000-000000000001","role":"authenticated"}';
create function pg_temp.root_counts(audience text default 'everyone') returns jsonb language sql as $$
 select public.get_comment_page_v2('99740000-0000-4000-8000-000000000001',audience)->'items';
$$;
grant execute on function pg_temp.root_counts(text) to authenticated;
set local role authenticated;
select pg_temp.check_reply_count((pg_temp.root_counts()->0->>'reply_count')::integer=100000,'100K reply total is exact without loading reply bodies');
select pg_temp.check_reply_count((pg_temp.root_counts()->1->>'reply_count')::integer=1,'single reply count');
select pg_temp.check_reply_count((pg_temp.root_counts()->2->>'reply_count')::integer=0,'zero replies');
select pg_temp.check_reply_count((pg_temp.root_counts('friends')->0->>'reply_count')::integer=66667,'friend count excludes nonfriends');
select pg_temp.check_reply_count((select (r->>'reply_count')::integer=100000 from public.get_comment_rows_v2(
 '99740000-0000-4000-8000-000000000001',array['99750000-0000-4000-8000-000000900001'::uuid]) r),'retained refresh uses same exact count');
select pg_temp.check_reply_count((public.get_comment_page_v2('99740000-0000-4000-8000-000000000001',
 p_parent_id=>'99750000-0000-4000-8000-000000900001')->'items'->0->>'reply_count')::integer=0,'reply rows do not count a new nested thread');
-- Full public read timings, not just an unfiltered count or forced index plan.
create function pg_temp.measure_reply_counts() returns setof text language plpgsql as $$
declare started timestamptz; elapsed double precision; value jsonb; begin
 for i in 1..3 loop
  started:=clock_timestamp(); value:=pg_temp.root_counts(case when i=2 then 'friends' else 'everyone' end);
  elapsed:=extract(epoch from clock_timestamp()-started)*1000;
  return next format('50 roots including 100K replies, pass %s: %s ms',i,round(elapsed::numeric,2));
  perform pg_temp.check_reply_count(elapsed<1500 and jsonb_array_length(value)=50,'full count projection within local 1500ms regression ceiling');
 end loop;
end $$;
select * from pg_temp.measure_reply_counts();
reset role;
insert into public.reports(reporter_id,reported_user_id,comment_id,reason,reason_detail,target_kind) values
 ('99710000-0000-4000-8000-000000000001','99710000-0000-4000-8000-000000000002','99750000-0000-4000-8000-000000000001','spam','spam','comment'),
 ('99710000-0000-4000-8000-000000000002','99710000-0000-4000-8000-000000000001','99750000-0000-4000-8000-000000000003','spam','spam','comment');
set local role authenticated;
select pg_temp.check_reply_count((pg_temp.root_counts()->0->>'reply_count')::integer=99999,
 'only own pending reports reduce the count; actual='||(pg_temp.root_counts()->0->>'reply_count'));
reset role;
insert into public.blocks(blocker_id,blocked_id) values
 ('99710000-0000-4000-8000-000000000003','99710000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check_reply_count((pg_temp.root_counts()->0->>'reply_count')::integer=66666,'reverse blocks reduce the total');
reset role;
insert into public.blocks(blocker_id,blocked_id) values
 ('99710000-0000-4000-8000-000000000001','99710000-0000-4000-8000-000000000002');
alter table public.comments disable trigger user;
update public.comments set moderation_status='quarantined' where id='99750000-0000-4000-8000-000000000003';
delete from public.comments where id='99750000-0000-4000-8000-000000000006';
alter table public.comments enable trigger user;
set local role authenticated;
select pg_temp.check_reply_count((pg_temp.root_counts()->0->>'reply_count')::integer=33331,'forward blocks, moderation and deletion reflected immediately');
reset role;
set local request.jwt.claims='{"sub":"99710000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
do $$ begin
 begin perform pg_temp.root_counts(); raise exception 'Locked post count exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.check_reply_count(not has_function_privilege('authenticated','comment_read_private.project_row(public.comments,uuid,text)','execute')
 and not has_schema_privilege('authenticated','comment_read_private','usage'),'no direct helper or private table access');
rollback;
select 'PASS: exact reply counts and privacy rolled back';
