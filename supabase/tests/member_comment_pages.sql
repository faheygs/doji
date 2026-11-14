begin;
set local statement_timeout='45s';
create function pg_temp.check_comments(v boolean,label text) returns text language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %',label; end if;
  return 'PASS: '||label;
end $$;
grant execute on function pg_temp.check_comments(boolean,text) to authenticated;
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
 ('99720000-0000-4000-8000-000000000001','Synthetic comments','Offline read fixture','photo','creative');
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
-- Offline read-load fixture only: avoid generating 100K write-side notifications.
-- These trigger changes are transactional and never appear in the release overlay.
alter table public.comments disable trigger user;
insert into public.comments(id,post_id,user_id,body,created_at,parent_id)
select ('99750000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '99740000-0000-4000-8000-000000000001',
 ('99710000-0000-4000-8000-'||lpad((1+n%3)::text,12,'0'))::uuid,
 'Synthetic comment '||n, '2026-01-01'::timestamptz + (n/3)*interval '1 second',
 case when n>80000 then '99750000-0000-4000-8000-000000080000'::uuid end
 from generate_series(1,100000)n;
alter table public.comments enable trigger user;
analyze public.comments;
set local request.jwt.claims='{"sub":"99710000-0000-4000-8000-000000000001","role":"authenticated"}';
create function pg_temp.page(parent uuid default null, cursor jsonb default null, direction text default 'next', audience text default 'everyone')
 returns jsonb language sql as $$ select public.get_comment_page_v2(
 '99740000-0000-4000-8000-000000000001',audience,parent,
 (cursor->>'createdAt')::timestamptz,(cursor->>'id')::uuid,direction,50) $$;
grant execute on function pg_temp.page(uuid,jsonb,text,text) to authenticated;
create temp table page_results(label text primary key, data jsonb);
grant all on page_results to authenticated;
set local role authenticated;
insert into page_results values ('first',pg_temp.page());
insert into page_results select 'second',pg_temp.page(null,data->'next') from page_results where label='first';
insert into page_results select 'back',pg_temp.page(null,data->'previous','previous') from page_results where label='second';
insert into page_results values ('reply',pg_temp.page('99750000-0000-4000-8000-000000080000'));
select pg_temp.check_comments((select data=(select data from page_results where label='back') from page_results where label='first'),'bidirectional roots round-trip exactly including tied timestamps');
select pg_temp.check_comments((select jsonb_array_length(data->'items')=50 and data->'previous'='null' and data->'next'<>'null' from page_results where label='first'),'first root page bounded with authoritative cursors');
select pg_temp.check_comments((select data->'items'->0->>'id'='99750000-0000-4000-8000-000000080000' and (data->'items'->0->>'has_replies')::boolean from page_results where label='first'),'newest roots first and reply existence available');
select pg_temp.check_comments((select data->'items'->0->>'id'='99750000-0000-4000-8000-000000080001' and jsonb_array_length(data->'items')=50 from page_results where label='reply'),'replies separately paged oldest first');
select pg_temp.check_comments((select count(*)=100 from (select distinct item->>'id' from page_results,jsonb_array_elements(data->'items')item where label in ('first','second')) ids),'no duplicates across pages');
select pg_temp.check_comments((select array_agg(key order by key)=array['avatar_gradient','avatar_url','display_name','equipped_border_key','id','username'] from page_results,jsonb_object_keys(data->'items'->0->'profile')key where label='first'),'profile projection stays public');
select pg_temp.check_comments((select not (data->'items'->0 ?| array['idempotency_key','moderation_status']) from page_results where label='first'),'private comment fields excluded');
select pg_temp.check_comments(jsonb_array_length(public.get_comment_page_v2('99740000-0000-4000-8000-000000000001',p_limit=>100000)->'items')=50,'caller cannot raise page cap');
select pg_temp.check_comments(not exists(select 1 from jsonb_array_elements(pg_temp.page(audience=>'friends')->'items')item where item->>'user_id'='99710000-0000-4000-8000-000000000003'),'friends audience excludes nonfriends');
select pg_temp.check_comments((select count(*)=2 from public.get_comment_rows_v2('99740000-0000-4000-8000-000000000001',array['99750000-0000-4000-8000-000000079999'::uuid,'99750000-0000-4000-8000-000000080000'::uuid])),'retained refresh returns only requested authorized identities');
do $$ begin
 begin perform public.get_comment_page_v2('99740000-0000-4000-8000-000000000001',p_cursor_id=>'99750000-0000-4000-8000-000000080000'); raise exception 'partial cursor accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.get_comment_page_v2('99740000-0000-4000-8000-000000000001',p_audience=>null); raise exception 'null audience accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.get_comment_rows_v2('99740000-0000-4000-8000-000000000001',array_fill('99750000-0000-4000-8000-000000080000'::uuid,array[51])); raise exception 'unbounded refresh accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
insert into public.reports(reporter_id,reported_user_id,comment_id,reason,target_kind) values
 ('99710000-0000-4000-8000-000000000001','99710000-0000-4000-8000-000000000002',
 '99750000-0000-4000-8000-000000079999','spam','comment');
set local role authenticated;
select pg_temp.check_comments(not exists(select 1 from jsonb_array_elements(pg_temp.page()->'items')item where item->>'id'='99750000-0000-4000-8000-000000079999'),'reporter-relative hide is enforced without exposing reports');
select pg_temp.check_comments((select count(*)=0 from public.get_comment_rows_v2('99740000-0000-4000-8000-000000000001',array['99750000-0000-4000-8000-000000079999'::uuid])),'reported rows disappear from retained refresh');
reset role;
-- Delete a cursor boundary. Keyset navigation still works without that row existing.
alter table public.comments disable trigger user;
delete from public.comments where id=(select (data->'next'->>'id')::uuid from page_results where label='first');
alter table public.comments enable trigger user;
set local role authenticated;
select pg_temp.check_comments((select pg_temp.page(null,data->'next')->'items'=(select data->'items' from page_results where label='second') from page_results where label='first'),'deleted cursor does not skip the next page');
reset role;
insert into public.blocks(blocker_id,blocked_id) values ('99710000-0000-4000-8000-000000000003','99710000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.check_comments(not exists(select 1 from jsonb_array_elements(pg_temp.page()->'items')item where item->>'user_id'='99710000-0000-4000-8000-000000000003'),'reverse blocks applied');
do $$ begin
 begin perform pg_temp.page('99750000-0000-4000-8000-000000080000'); raise exception 'blocked root exposed'; exception when insufficient_privilege then null; end;
end $$;
select pg_temp.check_comments((select count(*)=0 from public.get_comment_rows_v2('99740000-0000-4000-8000-000000000001',array['99750000-0000-4000-8000-000000080001'::uuid])),'refresh hides replies beneath inaccessible roots');
reset role;
delete from public.blocks where blocker_id='99710000-0000-4000-8000-000000000003';
update public.comments set moderation_status='quarantined' where id='99750000-0000-4000-8000-000000080000';
set local role authenticated;
do $$ begin
 begin perform pg_temp.page('99750000-0000-4000-8000-000000080000'); raise exception 'moderated root exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims='{"sub":"99710000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
do $$ begin
 begin perform pg_temp.page(); raise exception 'locked post exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.check_comments(not has_function_privilege('anon','public.get_comment_page_v2(uuid,text,uuid,timestamptz,uuid,text,integer)','execute') and not has_schema_privilege('authenticated','comment_read_private','usage'),'no anonymous read or private helper access');
-- Real planner choices on 100K rows: do not force enable_seqscan off.
do $$ declare plan jsonb; begin
 execute 'explain (analyze,buffers,format json) select id from public.comments where post_id=''99740000-0000-4000-8000-000000000001'' and parent_id is null and moderation_status=''visible'' and (created_at,id)<(''2026-01-01 03:00:00Z'',''99750000-0000-4000-8000-000000030000'') order by created_at desc,id desc limit 50' into plan;
 perform pg_temp.check_comments(plan::text like '%Index Scan%' and plan::text not like '%Seq Scan%'
   and (plan->0->'Plan'->>'Shared Hit Blocks')::integer<100
   and (plan->0->'Plan'->>'Actual Rows')::integer=50,'deep root cursor uses a bounded index scan');
 execute 'explain (analyze,buffers,format json) select id from public.comments where post_id=''99740000-0000-4000-8000-000000000001'' and parent_id=''99750000-0000-4000-8000-000000080000'' and moderation_status=''visible'' order by created_at,id limit 50' into plan;
 perform pg_temp.check_comments(plan::text like '%comments_thread_page_v2_idx%' and plan::text not like '%Seq Scan%','large reply thread uses the same bidirectional index');
end $$;
rollback;
select 'PASS: 100K synthetic comment read fixture rolled back';
