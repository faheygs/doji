\set ON_ERROR_STOP on
begin;
set local statement_timeout='45s';
grant execute on all functions in schema local_load to authenticated;
-- Only synthetic setup bypasses triggers; all tested RPCs use origin below.
set local session_replication_role=replica;
insert into public.posts(id,user_id,daily_event_id,type,is_community_poll,visibility)
values(local_load.id(1,'b1'),null,local_load.id(2,'a3'),'poll_vote',true,'public');
insert into public.comments(id,post_id,user_id,body,created_at)
select local_load.id(n,'b2'),case when n<=12 then local_load.id(1,'b1') else local_load.id(90000,'a6') end,
 local_load.id(case when n<=12 then n+1 else 1 end),'Synthetic parity',now()-interval '1 hour'+n*interval '1 second'
from generate_series(1,15) n;
-- Prospective friends, nonfriend, incoming/outgoing block, own post, root reply,
-- flattened exact reply to another author, and overlapping mention precedence.
update public.comments set created_at=now()-interval '3 days' where id=local_load.id(1,'b2');
update public.comments set user_id=local_load.id(90000) where id=local_load.id(2,'b2');
insert into public.blocks(blocker_id,blocked_id) values(local_load.id(1),local_load.id(4)),(local_load.id(5),local_load.id(1));
insert into public.comments(id,post_id,user_id,body,parent_id,reply_to_comment_id,created_at)
values
 (local_load.id(16,'b2'),local_load.id(90000,'a6'),local_load.id(6),'Synthetic reply',local_load.id(13,'b2'),local_load.id(13,'b2'),now()-interval '45 minutes'),
 (local_load.id(17,'b2'),local_load.id(90000,'a6'),local_load.id(7),'Synthetic nested reply',local_load.id(13,'b2'),local_load.id(16,'b2'),now()-interval '44 minutes'),
 (local_load.id(18,'b2'),local_load.id(90000,'a6'),local_load.id(8),'Synthetic mention',null,null,now()-interval '43 minutes');
insert into public.comment_mentions(comment_id,mentioned_user_id)
values(local_load.id(16,'b2'),local_load.id(1)),(local_load.id(18,'b2'),local_load.id(1));
insert into public.reactions(post_id,user_id,emoji,created_at)
select local_load.id(1,'b1'),local_load.id(n),'heart',now()-interval '1 hour'+n*interval '1 second' from generate_series(2,15) n;
update public.reactions set created_at=now()-interval '3 days' where post_id=local_load.id(1,'b1') and user_id=local_load.id(2);
insert into public.friendships(requester_id,addressee_id,status,created_at)
values(local_load.id(88888),local_load.id(1),'pending',now()-interval '40 days');
-- The original contract orders actor previews by timestamp only. Use distinct
-- timestamps for exact equality; tied preview order is deliberately unspecified.
update public.user_events set completed_at=now()-interval '1 day'+(right(user_id::text,12)::integer)*interval '0.001 seconds'
where user_id in(
 select addressee_id from public.friendships where requester_id in(local_load.id(1),local_load.id(55555),local_load.id(99999),local_load.id(90000))
 union select requester_id from public.friendships where addressee_id in(local_load.id(1),local_load.id(55555),local_load.id(99999),local_load.id(90000))
) and status='completed';
update public.reactions set created_at=now()-interval '2 hours'+(right(user_id::text,12)::integer)*interval '0.001 seconds'
where post_id in(local_load.id(1,'a6'),local_load.id(55555,'a6'),local_load.id(99999,'a6'),local_load.id(90000,'a6'));
update public.comments set moderation_status='removed' where id=local_load.id(6,'b2');
set local session_replication_role=origin;

create function local_load.check_parity(who integer, days integer, lim integer) returns void
language plpgsql as $$
declare a jsonb; b jsonb;
begin
 perform set_config('request.jwt.claims',json_build_object('sub',local_load.id(who),'role','authenticated')::text,true);
 select coalesce(jsonb_agg(value order by value->>'key'),'[]') into a
 from jsonb_array_elements(local_load.baseline_get_notification_center_snapshot(now()-make_interval(days=>days),lim));
 select coalesce(jsonb_agg(value order by value->>'key'),'[]') into b
 from jsonb_array_elements(public.get_notification_center_snapshot(now()-make_interval(days=>days),lim));
 if a is distinct from b then
   raise exception 'Parity failed user %, days %, limit %: %',who,days,lim,
     (select jsonb_agg(jsonb_build_object('old',x.value,'new',y.value))
      from jsonb_array_elements(a) x full join jsonb_array_elements(b) y on x.value->>'key'=y.value->>'key'
      where x.value is distinct from y.value);
 end if;
end; $$;
grant execute on function local_load.check_parity(integer,integer,integer) to authenticated;
set local role authenticated;
select local_load.check_parity(1,30,200);
select local_load.check_parity(1,2,250);
select local_load.check_parity(1,30,1);
select local_load.check_parity(1,30,0);
select local_load.check_parity(1,30,null);
select local_load.check_parity(55555,30,200);
select local_load.check_parity(99999,2,20);
select local_load.check_parity(90000,30,200);
reset role;

-- Compare original and candidate mention sets for each edit, preserving unchanged
-- mention IDs. Helpers remain non-callable by mobile/employee/anonymous roles.
do $$
declare body text; old_ids uuid[]; new_ids uuid[]; kept uuid; row_id uuid := local_load.id(15,'b2');
begin
 foreach body in array array['No mentions','@LOAD_V2 @load_v2 @load_v3 @load_v1 @load_v90000','@load_v3','@load_v3 unchanged','No mentions after editing',null,'@x @load_v999999'] loop
  begin
   perform local_load.baseline_sync_comment_mentions(row_id,body,local_load.id(1));
   select array_agg(mentioned_user_id order by mentioned_user_id) into old_ids from public.comment_mentions where comment_id=row_id;
   raise exception using errcode='Z0001',message='Rollback reference effects';
  exception when sqlstate 'Z0001' then null; end;
  perform public.sync_comment_mentions(row_id,body,local_load.id(1));
  select array_agg(mentioned_user_id order by mentioned_user_id) into new_ids from public.comment_mentions where comment_id=row_id;
  perform local_load.require(old_ids is not distinct from new_ids);
 end loop;
 perform public.sync_comment_mentions(row_id,'@load_v2',local_load.id(1));
 select id into kept from public.comment_mentions where comment_id=row_id and mentioned_user_id=local_load.id(2);
 perform public.sync_comment_mentions(row_id,'@LOAD_V2 @load_v2 unchanged',local_load.id(1));
 perform local_load.require(kept=(select id from public.comment_mentions where comment_id=row_id and mentioned_user_id=local_load.id(2)));
 perform public.sync_comment_mentions(row_id,'All removed',local_load.id(1));
 perform local_load.require(not exists(select 1 from public.comment_mentions where comment_id=row_id));
 begin
  perform public.sync_comment_mentions(row_id,'@load_v2',local_load.id(2));
  raise exception 'Expected wrong-author rejection';
 exception when raise_exception then if sqlerrm<>'Comment not found' then raise; end if; end;
 perform local_load.require(not has_function_privilege('authenticated','public.sync_comment_mentions(uuid,text,uuid)','EXECUTE'));
 perform local_load.require(not has_function_privilege('anon','public.get_notification_center_snapshot(timestamptz,integer)','EXECUTE'));
 perform local_load.require(not has_function_privilege('doji_employee','public.get_notification_center_snapshot(timestamptz,integer)','EXECUTE'));
end; $$;
select 'PASS: notification parity (8 caller/window/limit cases); mention edits, duplicate/case/self/nonfriend/empty/removal/identity; role boundaries';
rollback;
