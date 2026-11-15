begin;
set local statement_timeout='30s';
create function pg_temp.history_id(n integer) returns uuid language sql immutable as $$
 select ('99860000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.check_history(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end;
$$;
insert into auth.users(id,email,raw_user_meta_data)
select pg_temp.history_id(n),'history-'||n||'@test.invalid',jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,9)n;
insert into public.profiles(id,username,display_name,created_at)
select pg_temp.history_id(n),'history_'||n,'History actor '||n,now()-interval '2 days' from generate_series(1,9)n;
insert into public.challenges(id,title,description,type,category) values(pg_temp.history_id(20),'History fixture','Offline only','task','creative');
insert into public.daily_events(id,challenge_id,fires_at,window_minutes,activated_at,closes_at)
values(pg_temp.history_id(21),pg_temp.history_id(20),now()-interval '20 minutes',10,now()-interval '20 minutes',now()-interval '10 minutes');
alter table public.friendships disable trigger user;
insert into public.friendships(requester_id,addressee_id,status,accepted_at)
select pg_temp.history_id(1),pg_temp.history_id(n),'accepted',now()-interval '1 day' from generate_series(2,8)n;
alter table public.friendships enable trigger user;
alter table public.user_events disable trigger user;
insert into public.user_events(id,user_id,daily_event_id,status,expires_at,completed_at)
select pg_temp.history_id(100+n),pg_temp.history_id(n),pg_temp.history_id(21),'late',now()+interval '1 hour',
 case when n=8 then now()-interval '1 minute' else now()-interval '2 minutes' end from generate_series(1,8)n;
alter table public.user_events enable trigger user;
alter table public.posts disable trigger user;
insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility)
select pg_temp.history_id(200+n),pg_temp.history_id(100+n),pg_temp.history_id(n),pg_temp.history_id(21),'task_complete','public' from generate_series(1,8)n;
alter table public.posts enable trigger user;
alter table public.reactions disable trigger user;
insert into public.reactions(id,post_id,user_id,emoji,created_at)
select pg_temp.history_id(300+n),pg_temp.history_id(201),pg_temp.history_id(n),'fire',
 case when n=8 then now()-interval '1 minute' else now()-interval '2 minutes' end from generate_series(2,8)n;
alter table public.reactions enable trigger user;
alter table public.comments disable trigger user;
insert into public.comments(id,post_id,user_id,body,created_at) values(pg_temp.history_id(400),pg_temp.history_id(201),pg_temp.history_id(1),'Fixture parent',now()-interval '3 minutes');
insert into public.comments(id,post_id,user_id,body,created_at)
select pg_temp.history_id(400+n),pg_temp.history_id(201),pg_temp.history_id(n),'Fixture comment',
 case when n=8 then now()-interval '1 minute' else now()-interval '2 minutes' end from generate_series(2,8)n;
alter table public.comments enable trigger user;
alter table public.comment_likes disable trigger user;
insert into public.comment_likes(id,comment_id,user_id,created_at)
select pg_temp.history_id(500+n),pg_temp.history_id(400),pg_temp.history_id(n),
 case when n=8 then now()-interval '1 minute' else now()-interval '2 minutes' end from generate_series(2,8)n;
alter table public.comment_likes enable trigger user;
set local request.jwt.claims='{"sub":"99860000-0000-4000-8000-000000000001","role":"authenticated"}';
create function pg_temp.history_snapshot() returns jsonb language sql as $$
 select public.get_notification_center_snapshot(now()-interval '1 day',200);
$$;
select pg_temp.check_history((select (value->>'count')::int=7 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='friend_activity_group'),'initial seven friends');

-- New activity already exists by the time the old six-person snapshot is dismissed.
set local role authenticated;
select public.dismiss_notification('friend_activity:'||pg_temp.history_id(21),now(),now()-interval '2 minutes');
select public.dismiss_notification('reactions_post:'||pg_temp.history_id(201),now(),now()-interval '2 minutes');
select public.dismiss_notification('comment_likes:'||pg_temp.history_id(400),now(),now()-interval '2 minutes');
reset role;
select pg_temp.check_history((select (value->>'count')::int=1 and value->'actors'->0->>'username'='history_8'
 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='friend_activity_group'),'new friend alone, no old names or accumulated count');
select pg_temp.check_history((select (value->>'count')::int=1 and jsonb_array_length(value->'actors')=1
 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='reactions_group'),'reactions count only new activity');
select pg_temp.check_history((select count(*)=1 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='comment_like'),'comment-like source filtering precedes client grouping');
select pg_temp.check_history((select count(*)=7 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='comment' and value->>'sortAt' is not null),'unrelated comments preserved');

-- An older/out-of-order dismissal cannot roll the durable cutoff backward.
set local role authenticated;
select public.dismiss_notification('friend_activity:'||pg_temp.history_id(21),now(),now()-interval '3 minutes');
reset role;
select pg_temp.check_history((select dismissed_at=now()-interval '2 minutes' from public.notification_dismissals where user_id=pg_temp.history_id(1) and notification_key='friend_activity:'||pg_temp.history_id(21)),'monotonic dismissal');
select pg_temp.check_history((select (value->>'count')::int=1 and value->'actors'->0->>'username'='history_8'
 from jsonb_array_elements(public.get_notification_center_bootstrap(null,null,'{}',200)->'items') where value->>'kind'='friend_activity_group'),'reinstall/bootstrap uses the same filtered group');
set local request.jwt.claims='{"sub":"99860000-0000-4000-8000-000000000009","role":"authenticated"}';
select pg_temp.check_history(jsonb_array_length(pg_temp.history_snapshot())=0,'account isolation');
set local role authenticated;
select public.dismiss_notification('legacy-key',now());
select public.clear_notification_history(now());
reset role;
select pg_temp.check_history((select cleared_at is not null from public.notification_center_state where user_id=pg_temp.history_id(9)),'old binary command arities remain compatible');
set local request.jwt.claims='{"sub":"99860000-0000-4000-8000-000000000001","role":"authenticated"}';

-- Acknowledged sources are ineligible for pending phone batches too.
update social_notification_private.configuration set enabled=true;
select social_notification_private.enqueue('late_friend_participation',pg_temp.history_id(1),pg_temp.history_id(21),pg_temp.history_id(102),pg_temp.history_id(2),now()-interval '2 minutes');
select social_notification_private.enqueue('late_friend_participation',pg_temp.history_id(1),pg_temp.history_id(21),pg_temp.history_id(108),pg_temp.history_id(8),now()-interval '1 minute');
select pg_temp.check_history((select count(*)=1 from social_notification_private.items i join social_notification_private.batches b on b.id=i.batch_id where social_notification_private.eligible(b,i)),'pending push excludes dismissed sources but preserves new friend');

select social_notification_private.enqueue('comments_on_posts',pg_temp.history_id(1),pg_temp.history_id(201),pg_temp.history_id(402),pg_temp.history_id(2),now()-interval '2 minutes');
select social_notification_private.enqueue('comments_on_posts',pg_temp.history_id(1),pg_temp.history_id(201),pg_temp.history_id(408),pg_temp.history_id(8),now()-interval '1 minute');
set local role authenticated;
select public.dismiss_notification('comment:'||pg_temp.history_id(402),now(),now()-interval '2 minutes');
reset role;
select pg_temp.check_history((select count(*)=1 from social_notification_private.items i join social_notification_private.batches b on b.id=i.batch_id where b.kind='comments_on_posts' and social_notification_private.eligible(b,i)),'dismissed comment excluded from pending phone group');

set local role authenticated;
select public.clear_notification_history(now(),now()-interval '2 minutes');
reset role;
select pg_temp.check_history((select count(*)=1 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='comment'),'clear-all excludes old individual comments and retains concurrent new comment');
select pg_temp.check_history((select count(*)=1 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='comment_like'),'clear-all does not resurrect dismissed likes');
select pg_temp.check_history((select (value->>'count')::int=1 from jsonb_array_elements(pg_temp.history_snapshot()) where value->>'kind'='friend_activity_group'),'clear-all preserves newer friend');
select pg_temp.check_history(social_notification_private.history_visible(pg_temp.history_id(1),
 jsonb_build_object('key','friend_request:pending','kind','friend_request','sortAt',now()-interval '1 day')),'clear retains actionable pending requests');
select pg_temp.check_history(not social_notification_private.history_visible(pg_temp.history_id(1),
 jsonb_build_object('key','challenge:phase','kind','challenge','sortAt',now()+interval '1 hour','userEvent',jsonb_build_object('daily_event',jsonb_build_object('prelive_at',now()-interval '3 minutes')))),'future display time cannot revive acknowledged pre-live activity');
select pg_temp.check_history(social_notification_private.history_visible(pg_temp.history_id(1),
 jsonb_build_object('key','challenge:phase','kind','challenge','sortAt',now()-interval '1 hour','userEvent',jsonb_build_object('daily_event',jsonb_build_object('activated_at',now()-interval '1 minute')))),'new live phase survives old acknowledgement');
select pg_temp.check_history(not has_function_privilege('anon','public.dismiss_notification(text,timestamptz,timestamptz)','execute'),'anonymous dismissal denied');
select pg_temp.check_history(not has_function_privilege('authenticated','social_notification_private.history_cutoff(uuid,text)','execute'),'cutoff cannot expose another account state');
do $$ begin
 begin perform public.dismiss_notification('friend_activity:'||pg_temp.history_id(21),now(),'infinity');raise exception 'accepted infinity';
 exception when others then if sqlerrm<>'Invalid notification snapshot' then raise;end if;end;
end $$;
set local role authenticated;
select public.dismiss_notification('friend_activity:'||pg_temp.history_id(21),now(),now()+interval '1 day');
reset role;
select pg_temp.check_history((select dismissed_at<=clock_timestamp() from public.notification_dismissals where user_id=pg_temp.history_id(1) and notification_key='friend_activity:'||pg_temp.history_id(21)),'future snapshot clamped');
rollback;
select 'PASS: notification group dismissal boundaries';
