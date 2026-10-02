-- Rollback-only maximum-circle mention test on the synthetic fixture.
begin;
set local statement_timeout='15s';
set local session_replication_role=replica;
insert into public.friendships(requester_id,addressee_id,status,accepted_at)
select local_load.id(55555),local_load.id(n),'accepted',now()-interval '1 day'
from generate_series(70000,70474) n;
set local session_replication_role=origin;
select local_load.require((select count(*)=500 from public.friendships
 where status='accepted' and (requester_id=local_load.id(55555) or addressee_id=local_load.id(55555))));
select set_config('request.jwt.claims',json_build_object('sub',local_load.id(55555),'role','authenticated')::text,true);
set local role authenticated;
select public.submit_comment(local_load.id(1,'a6'),'Synthetic maximum-circle @LOAD_V70000 @load_v70474 @load_v55555 @load_v90000',null,'synthetic-max-circle-mention');
reset role;
select local_load.require((select array_agg(m.mentioned_user_id order by m.mentioned_user_id)
 from public.comment_mentions m join public.comments c on c.id=m.comment_id
 where c.idempotency_key='synthetic-max-circle-mention')=
 array[local_load.id(55555),local_load.id(70000),local_load.id(70474)]);
select 'PASS: maximum 500-friend circle; existing and new friends/self eligible; stranger excluded';
rollback;
