begin;
set local statement_timeout='30s';
create function pg_temp.social_id(k integer,n integer) returns uuid language sql immutable as $$
  select ('997'||k||'0000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
create function pg_temp.check_social(v boolean,label text) returns text language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label; end if; return 'PASS: '||label; end $$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select pg_temp.social_id(1,n),'authenticated','authenticated','social-phone-'||n||'@test.invalid',now(),
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,3)n;
insert into public.profiles(id,username,display_name,created_at,notification_preferences)
select pg_temp.social_id(1,n),'social_phone_'||n,'Synthetic member '||n,now()-interval '7 days',
 '{"push_enabled":true,"comments_on_posts":true,"late_friend_participation":true}' from generate_series(1,3)n;
insert into public.challenges(id,title,description,type,category,poll_kind,answer_rule)
select pg_temp.social_id(2,n),'Synthetic notification '||n,'Offline fixture',
 (array['photo','task','format','poll','poll'])[n],'creative',case when n=5 then 'wyr' when n=4 then 'poll' end,
 case when n=3 then '{"type":"exact_word_count","count":3}'::jsonb end from generate_series(1,5)n;
insert into public.daily_events(id,challenge_id,fires_at,window_minutes,activated_at,closes_at)
select pg_temp.social_id(3,n),pg_temp.social_id(2,n),now()-interval '11 minutes',10,
 now()-interval '11 minutes',now()-interval '2 seconds' from generate_series(1,5)n;
alter table public.user_events disable trigger user;
insert into public.user_events(id,user_id,daily_event_id,status,expires_at,completed_at)
select pg_temp.social_id(4,e*10+n),pg_temp.social_id(1,n),pg_temp.social_id(3,e),'completed',
 now()+interval '1 hour',now() from generate_series(1,5)e cross join generate_series(1,3)n;
alter table public.user_events enable trigger user;
alter table public.posts disable trigger user;
insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility)
select pg_temp.social_id(5,e*10+n),pg_temp.social_id(4,e*10+n),pg_temp.social_id(1,n),
 pg_temp.social_id(3,e),(array['photo','task_complete','task_complete'])[e],'public'
 from generate_series(1,3)e cross join generate_series(1,3)n;
alter table public.posts enable trigger user;
insert into public.poll_options(id,challenge_id,text,position)
select pg_temp.social_id(6,e),pg_temp.social_id(2,e),'Synthetic option',0 from generate_series(4,5)e;
alter table public.poll_votes disable trigger user;
insert into public.poll_votes(id,user_event_id,user_id,daily_event_id,challenge_id,option_id,idempotency_key)
select pg_temp.social_id(7,e*10+n),pg_temp.social_id(4,e*10+n),pg_temp.social_id(1,n),
 pg_temp.social_id(3,e),pg_temp.social_id(2,e),pg_temp.social_id(6,e),pg_temp.social_id(7,e*10+n)
 from generate_series(4,5)e cross join generate_series(1,3)n;
alter table public.poll_votes enable trigger user;
insert into public.friendships(requester_id,addressee_id,status)
 values(pg_temp.social_id(1,1),pg_temp.social_id(1,2),'accepted');

insert into public.comments(id,post_id,user_id,body) values(pg_temp.social_id(8,1),pg_temp.social_id(5,11),pg_temp.social_id(1,2),'Disabled fixture');
select pg_temp.check_social((select count(*)=0 from social_notification_private.batches),'installs disabled');
select pg_temp.check_social(not has_function_privilege('authenticated','public.prepare_social_phone_alert_v1(uuid,uuid)','execute'),'member cannot prepare delivery');
select pg_temp.check_social(not has_schema_privilege('authenticated','social_notification_private','usage'),'private state inaccessible');
update social_notification_private.configuration set enabled=true;
insert into public.comments(id,post_id,user_id,body)
select pg_temp.social_id(8,n),pg_temp.social_id(5,11),pg_temp.social_id(1,2),'Burst comment '||n from generate_series(2,11)n;
select pg_temp.check_social((select count(*)=1 from social_notification_private.batches),'ten comments one batch');
select pg_temp.check_social((select count(*)=10 from social_notification_private.items),'ten unique contributions');
select pg_temp.check_social((select available_at>clock_timestamp()+interval '25 seconds' from public.domain_event_outbox
 where event_type='notification.post_comments.grouped_v1'),'policy preserves delayed delivery');
select social_notification_private.enqueue('comments_on_posts',pg_temp.social_id(1,1),pg_temp.social_id(5,11),pg_temp.social_id(8,2),pg_temp.social_id(1,2),now());
select pg_temp.check_social((select count(*)=10 from social_notification_private.items),'retry does not duplicate a contribution');

savepoint distinct_actors;
insert into public.comments(id,post_id,user_id,body,created_at) values
 (pg_temp.social_id(8,99),pg_temp.social_id(5,11),pg_temp.social_id(1,3),'Another synthetic actor',clock_timestamp());
update social_notification_private.batches set due_at=clock_timestamp()-interval '1 second';
update public.domain_event_outbox set lease_id=pg_temp.social_id(9,1),leased_at=clock_timestamp(),available_at=clock_timestamp()
 where event_type='notification.post_comments.grouped_v1';
select pg_temp.check_social((select public.prepare_social_phone_alert_v1(outbox_id,pg_temp.social_id(9,1))->>'actorCount'='2'
 from social_notification_private.batches),'group counts distinct actors, not comment volume');
select pg_temp.check_social((select public.prepare_social_phone_alert_v1(outbox_id,pg_temp.social_id(9,1))->>'body'=
 'Synthetic member 3 and 1 other commented on your post' from social_notification_private.batches),'multiple actors use grouped copy');
rollback to distinct_actors;

savepoint bounded_burst;
insert into public.comments(id,post_id,user_id,body)
select pg_temp.social_id(8,n),pg_temp.social_id(5,11),pg_temp.social_id(1,2),'Busy fixture' from generate_series(100,250)n;
select pg_temp.check_social((select count(*)=100 from social_notification_private.items),'very busy threads cap preparation at 100 IDs');
select pg_temp.check_social((select count(*)=1 from social_notification_private.batches),'busy thread never creates more concurrent batches');
rollback to bounded_burst;

-- Advance the bounded synthetic deadline, never wait or call a provider.
update social_notification_private.batches set due_at=clock_timestamp()-interval '1 second';
update public.domain_event_outbox set lease_id=pg_temp.social_id(9,1),leased_at=clock_timestamp(),available_at=clock_timestamp()
 where event_type='notification.post_comments.grouped_v1';
create function pg_temp.prepare_social(subject_id uuid) returns jsonb language sql as $$
 select public.prepare_social_phone_alert_v1(b.outbox_id,pg_temp.social_id(9,1))
 from social_notification_private.batches b where b.subject=subject_id order by b.due_at desc limit 1;
$$;
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11))->>'eventCount'='10','bounded batch content');
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11))->>'actorCount'='1','one actor is not ten people');
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11))->>'body'='Synthetic member 2 added 10 comments to your post','honest grouped copy');
select pg_temp.check_social((select social_notification_private.claimable(outbox_id,recipient) from social_notification_private.batches),'prepared batch claimable');
insert into public.blocks(blocker_id,blocked_id) values(pg_temp.social_id(1,2),pg_temp.social_id(1,1));
select pg_temp.check_social((select not social_notification_private.claimable(outbox_id,recipient) from social_notification_private.batches),'new reverse block stops final claim');
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11)) is null,'reverse block suppresses prepared copy');
delete from public.blocks where blocker_id=pg_temp.social_id(1,2);
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11)) is not null,'eligible batch can be prepared after a read-only suppression check');
savepoint dispatch_privacy;
delete from public.comments where post_id=pg_temp.social_id(5,11);
select pg_temp.check_social((select not social_notification_private.claimable(outbox_id,recipient)
 from social_notification_private.batches),'deletion after preparation stops final claim');
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11)) is null,'deleted comments are not announced');
rollback to dispatch_privacy;
savepoint dispatch_opt_out;
update public.profiles set notification_preferences='{"push_enabled":false}' where id=pg_temp.social_id(1,1);
select pg_temp.check_social((select not social_notification_private.claimable(outbox_id,recipient)
 from social_notification_private.batches),'opt-out after preparation stops final claim');
rollback to dispatch_opt_out;
savepoint dispatch_category_opt_out;
update public.profiles set notification_preferences='{"comments_on_posts":false}' where id=pg_temp.social_id(1,1);
select pg_temp.check_social((select not social_notification_private.claimable(outbox_id,recipient)
 from social_notification_private.batches),'category opt-out after preparation stops final claim');
rollback to dispatch_category_opt_out;
savepoint retained_cleanup;
delete from public.domain_event_outbox where event_type='notification.post_comments.grouped_v1';
select pg_temp.check_social(not exists(select 1 from social_notification_private.batches)
 and not exists(select 1 from social_notification_private.items),'outbox retention removes bounded batch state');
select pg_temp.check_social(exists(select 1 from public.notification_once_keys
 where delivery_key like 'social-phone-v1:%'),'outbox cleanup retains independent duplicate fences');
rollback to retained_cleanup;
savepoint dispatch_seen;
insert into public.notification_attention_state(user_id,scope_kind,scope_id,seen_at)
select pg_temp.social_id(1,1),'comment',id::text,clock_timestamp() from public.comments where post_id=pg_temp.social_id(5,11);
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11)) is null,'already-seen comments suppressed without deleting history');
rollback to dispatch_seen;
savepoint dispatch_expiry;
update social_notification_private.batches set first_occurred_at=clock_timestamp()-interval '6 minutes';
select pg_temp.check_social(pg_temp.prepare_social(pg_temp.social_id(5,11)) is null,'backlog does not refresh source TTL');
rollback to dispatch_expiry;
do $$ begin
  begin perform public.prepare_social_phone_alert_v1((select outbox_id from social_notification_private.batches limit 1),gen_random_uuid());
    raise exception 'stale lease accepted';
  exception when others then if sqlerrm<>'Social notification lease lost' then raise; end if; end;
end $$;
insert into public.comments(id,post_id,user_id,body) values(pg_temp.social_id(8,12),pg_temp.social_id(5,11),pg_temp.social_id(1,2),'Cooldown fixture');
select pg_temp.check_social((select count(*)=1 from social_notification_private.batches),'cooldown does not create another push');

insert into public.comments(id,post_id,user_id,body) values(pg_temp.social_id(8,20),pg_temp.social_id(5,21),pg_temp.social_id(1,2),'@social_phone_1');
select public.sync_comment_mentions(pg_temp.social_id(8,20),'@social_phone_1',pg_temp.social_id(1,2));
select pg_temp.check_social((select direct_alert from social_notification_private.items where source_id=pg_temp.social_id(8,20)),'mention takes precedence after atomic command');
select public.sync_comment_mentions(pg_temp.social_id(8,20),'Edited text',pg_temp.social_id(1,2));
select pg_temp.check_social((select direct_alert from social_notification_private.items where source_id=pg_temp.social_id(8,20)),'editing mention cannot create second phone alert');
insert into public.comments(id,post_id,user_id,body) values(pg_temp.social_id(8,30),pg_temp.social_id(5,31),pg_temp.social_id(1,1),'Owner parent');
insert into public.comments(id,post_id,user_id,body,parent_id,reply_to_comment_id)
 values(pg_temp.social_id(8,31),pg_temp.social_id(5,31),pg_temp.social_id(1,2),'Direct reply',pg_temp.social_id(8,30),pg_temp.social_id(8,30));
select pg_temp.check_social(not exists(select 1 from social_notification_private.items where source_id in(pg_temp.social_id(8,30),pg_temp.social_id(8,31))),'self and direct reply do not become owner-comment push');

-- Exercise the existing asynchronous fanout entry point across every kind.
select public.enqueue_friend_fanout('fanout.friend_completion',pg_temp.social_id(4,e*10+2),
 jsonb_build_object('actorUserId',pg_temp.social_id(1,2),'aggregateId',pg_temp.social_id(4,e*10+2),
 'dailyEventId',pg_temp.social_id(3,e),'occurredAt',now()),'social-fixture-fanout:'||e) from generate_series(1,5)e;
select public.process_friend_fanout_event(id) from public.domain_event_outbox where idempotency_key like 'social-fixture-fanout:%';
select pg_temp.check_social((select count(*)=5 from social_notification_private.batches where kind='late_friend_participation'),'all kinds include grace-day after-close participation');
select pg_temp.check_social(not exists(select 1 from social_notification_private.batches where recipient=pg_temp.social_id(1,3)),'nonfriends excluded');
select pg_temp.check_social((select bool_and(social_notification_private.eligible(b,i)) from social_notification_private.batches b
 join social_notification_private.items i on i.batch_id=b.id where b.kind='late_friend_participation'),'all kinds retain visible eligible participation');
savepoint dispatch_late_opt_out;
update social_notification_private.batches set due_at=clock_timestamp()-interval '1 second' where kind='late_friend_participation';
update public.domain_event_outbox set lease_id=pg_temp.social_id(9,1),leased_at=clock_timestamp(),available_at=clock_timestamp()
 where event_type='notification.late_friend_activity.grouped_v1';
select pg_temp.check_social((select bool_and(public.prepare_social_phone_alert_v1(outbox_id,pg_temp.social_id(9,1)) is not null)
 from social_notification_private.batches where kind='late_friend_participation'),'late batches prepare for each Doji kind');
update public.profiles set notification_preferences='{"late_friend_participation":false}' where id=pg_temp.social_id(1,1);
select pg_temp.check_social((select bool_and(not social_notification_private.claimable(outbox_id,recipient))
 from social_notification_private.batches where kind='late_friend_participation'),'late category opt-out after preparation stops all final claims');
rollback to dispatch_late_opt_out;
savepoint not_late;
alter table public.user_events disable trigger user;
update public.user_events set completed_at=now()-interval '3 seconds' where user_id=pg_temp.social_id(1,2);
alter table public.user_events enable trigger user;
select pg_temp.check_social((select bool_and(not social_notification_private.eligible(b,i)) from social_notification_private.batches b
 join social_notification_private.items i on i.batch_id=b.id where b.kind='late_friend_participation'),'on-time completions cannot become late alerts');
rollback to not_late;
update public.friendships set status='pending' where requester_id=pg_temp.social_id(1,1);
select pg_temp.check_social((select bool_and(not social_notification_private.eligible(b,i)) from social_notification_private.batches b
 join social_notification_private.items i on i.batch_id=b.id where b.kind='late_friend_participation'),'unfriend before dispatch suppresses all kinds');

update public.profiles set notification_preferences='{"comments_on_posts":true,"push_enabled":false}' where id=pg_temp.social_id(1,1);
select pg_temp.check_social(not social_notification_private.preference(pg_temp.social_id(1,1),'comments_on_posts'),'master opt-out honored');
update public.profiles set notification_preferences='{"comments_on_posts":true,"comment":false}' where id=pg_temp.social_id(1,1);
select pg_temp.check_social(not social_notification_private.preference(pg_temp.social_id(1,1),'comments_on_posts'),'legacy opt-out honored');
update public.profiles set notification_preferences='{}' where id=pg_temp.social_id(1,1);
select pg_temp.check_social(social_notification_private.preference(pg_temp.social_id(1,1),'comments_on_posts')
 and social_notification_private.preference(pg_temp.social_id(1,1),'late_friend_participation'),'missing keys default on for existing members');
do $$ declare category text; legacy text; candidate jsonb;
begin
  foreach category in array array['comments_on_posts','late_friend_participation'] loop
    legacy:=case category when 'comments_on_posts' then 'comment' else 'friend_post' end;
    foreach candidate in array array[
      jsonb_build_object(category,false),jsonb_build_object(category,'true'::text),jsonb_build_object(category,null),
      jsonb_build_object('push_enabled',false),jsonb_build_object(legacy,false),
      jsonb_build_object(category,true,legacy,false)
    ] loop
      update public.profiles set notification_preferences=candidate where id=pg_temp.social_id(1,1);
      perform pg_temp.check_social(not social_notification_private.preference(pg_temp.social_id(1,1),category),
        'saved opt-out or malformed preference cannot enable delivery');
    end loop;
  end loop;
end $$;
update public.profiles set notification_preferences='{}' where id=pg_temp.social_id(1,1);
set local request.jwt.claims='{"sub":"99710000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select pg_temp.check_social(public.get_social_phone_alert_capabilities_v1()->>'enabled'='true','member can read the enabled capability');
select public.update_own_profile('{"notification_preferences":{"comments_on_posts":true,"late_friend_participation":true}}','social-phone-fixture-preferences');
reset role;
select pg_temp.check_social(social_notification_private.preference(pg_temp.social_id(1,1),'comments_on_posts'),'normal atomic profile command stores category choice');
set local role authenticated;
select public.update_own_profile('{"notification_preferences":{"comments_on_posts":false,"late_friend_participation":false}}','social-phone-fixture-opt-out');
reset role;
select pg_temp.check_social(not social_notification_private.preference(pg_temp.social_id(1,1),'comments_on_posts')
 and not social_notification_private.preference(pg_temp.social_id(1,1),'late_friend_participation'),'atomic settings opt-out stops both default-on categories');
update social_notification_private.configuration set enabled=false;
set local role authenticated;
select pg_temp.check_social(public.get_social_phone_alert_capabilities_v1()=
 '{"settingsAvailable":true,"enabled":false}'::jsonb,'settings remain available while delivery is disabled');
reset role;
rollback;
select 'PASS: social phone alerts rolled back';
