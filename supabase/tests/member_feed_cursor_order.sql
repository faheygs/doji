begin;
set local statement_timeout='30s';
-- A valid merge-join plan may reorder hydrated ties even when the bounded CTE
-- arrived in cursor order. The result contract must not depend on planner choices.
set local enable_hashjoin=off;
set local enable_nestloop=off;
set local enable_hashagg=off;
create function pg_temp.check_feed(v boolean,label text) returns text language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %',label; end if;
  return 'PASS: '||label;
end $$;
grant execute on function pg_temp.check_feed(boolean,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','feed-order-'||n||'@test.invalid',now(),
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,101)n;
insert into public.profiles(id,username,display_name,timezone,created_at)
select ('99410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'feed_order_'||n,'Synthetic feed member','America/Denver',now()-interval '7 days'
 from generate_series(1,101)n;
insert into public.challenges(id,title,description,type,category) values
 ('99420000-0000-4000-8000-000000000001','Synthetic feed ordering','Offline only','task','creative');
insert into public.daily_events(id,challenge_id,fires_at,window_minutes) values
 ('99430000-0000-4000-8000-000000000001','99420000-0000-4000-8000-000000000001',now()-interval '1 minute',10);
-- Read regression only; avoid notification/reward work inside this rolled-back fixture.
alter table public.user_events disable trigger user;
insert into public.user_events(id,user_id,daily_event_id,status,expires_at,completed_at)
select ('99440000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '99430000-0000-4000-8000-000000000001','completed',now()+interval '9 minutes',now()
 from generate_series(1,101)n;
alter table public.user_events enable trigger user;
alter table public.posts disable trigger user;
insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility,created_at)
select ('99450000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99440000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('99410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '99430000-0000-4000-8000-000000000001','task_complete','public','2026-01-01'::timestamptz
 from generate_series(1,101)n;
alter table public.posts enable trigger user;
-- Nonempty hydration joins reproduce the production query's tie reordering.
insert into public.post_engagement_shards(post_id,shard,comment_count,reaction_count)
select id,0,10,10 from public.posts where daily_event_id='99430000-0000-4000-8000-000000000001';
insert into public.post_reaction_count_shards(post_id,emoji,shard,reaction_count)
select id,'fire',0,10 from public.posts where daily_event_id='99430000-0000-4000-8000-000000000001';
alter table public.reactions disable trigger user;
insert into public.reactions(post_id,user_id,emoji)
select id,'99410000-0000-4000-8000-000000000001','fire' from public.posts
 where daily_event_id='99430000-0000-4000-8000-000000000001';
alter table public.reactions enable trigger user;
analyze public.posts;
analyze public.reactions;
analyze public.post_engagement_shards;
analyze public.post_reaction_count_shards;
alter table public.friendships disable trigger user;
insert into public.friendships(requester_id,addressee_id,status)
select '99410000-0000-4000-8000-000000000001',
 ('99410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'accepted' from generate_series(2,101)n;
alter table public.friendships enable trigger user;
set local request.jwt.claims='{"sub":"99410000-0000-4000-8000-000000000001","role":"authenticated"}';
create function pg_temp.walk_feed(audience text, page_size integer) returns uuid[] language plpgsql as $$
declare page jsonb; item jsonb; cursor_time timestamptz; cursor_id uuid; ids uuid[] := '{}';
begin
  for step in 1..110 loop
    page := public.get_feed_page_snapshot_v2('99430000-0000-4000-8000-000000000001',
      audience,page_size,cursor_time,cursor_id);
    perform pg_temp.check_feed(jsonb_array_length(page)<=least(page_size,50),'page cap is preserved');
    if jsonb_array_length(page)=0 then return ids; end if;
    for item in select value from jsonb_array_elements(page) loop
      if cursor_time is not null then
        perform pg_temp.check_feed(((item->>'created_at')::timestamptz,(item->>'id')::uuid)
          < (cursor_time,cursor_id),'every returned row follows the complete descending cursor');
      end if;
      cursor_time := (item->>'created_at')::timestamptz;
      cursor_id := (item->>'id')::uuid;
      ids := array_append(ids,cursor_id);
      perform pg_temp.check_feed(not (item ?| array['idempotency_key','moderation_status']),
        'internal fields remain excluded');
    end loop;
  end loop;
  raise exception 'Pagination did not terminate';
end $$;
grant execute on function pg_temp.walk_feed(text,integer) to authenticated;
set local role authenticated;
do $$ declare audience text; size integer; expected uuid[]; begin
  select array_agg(('99450000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid order by n desc)
    into expected from generate_series(1,101)n;
  foreach audience in array array['everyone','friends'] loop
    foreach size in array array[1,7,20,50,500] loop
      perform pg_temp.check_feed(pg_temp.walk_feed(audience,size)=expected,
        'tied timestamps traverse every eligible post exactly once in '||audience);
    end loop;
  end loop;
end $$;
reset role;
-- Mixed timestamps must still dominate IDs, and filtered rows must never become cursor boundaries.
alter table public.posts disable trigger user;
update public.posts set created_at=created_at+interval '1 minute'
 where id between '99450000-0000-4000-8000-000000000010' and '99450000-0000-4000-8000-000000000020';
update public.posts set moderation_status='quarantined' where id='99450000-0000-4000-8000-000000000099';
alter table public.posts enable trigger user;
insert into public.blocks(blocker_id,blocked_id) values
 ('99410000-0000-4000-8000-000000000101','99410000-0000-4000-8000-000000000001');
insert into public.reports(reporter_id,reported_user_id,post_id,reason,target_kind) values
 ('99410000-0000-4000-8000-000000000001','99410000-0000-4000-8000-000000000100',
 '99450000-0000-4000-8000-000000000100','spam','post');
delete from public.friendships where addressee_id='99410000-0000-4000-8000-000000000098';
create temp table expected_feed(audience text, ids uuid[]);
insert into expected_feed
select audience,array_agg(id order by created_at desc,id desc) from public.posts,
 unnest(array['everyone','friends']) audience
 where daily_event_id='99430000-0000-4000-8000-000000000001'
 and id<'99450000-0000-4000-8000-000000000099'
 and (audience='everyone' or id<>'99450000-0000-4000-8000-000000000098') group by audience;
grant select on expected_feed to authenticated;
set local role authenticated;
select pg_temp.check_feed(pg_temp.walk_feed(audience,7)=ids,
 'mixed timestamps preserve audience, reverse block, report and moderation exclusions: '||audience)
 from expected_feed;
select pg_temp.check_feed(not has_function_privilege('anon',
 'public.get_feed_page_snapshot_v2(uuid,text,integer,timestamptz,uuid)','execute'), 'anonymous access remains denied');
reset role;
rollback;
select 'PASS: feed cursor fixtures rolled back';
