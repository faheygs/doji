\set ON_ERROR_STOP on
begin;
set local statement_timeout='5min';
insert into public.post_engagement_shards (post_id,shard,reaction_count,comment_count)
select post_id,shard,sum(reactions)::integer,sum(comments)::integer from (
 select post_id,mod((hashtextextended(user_id::text,0)&2147483647),128)::smallint shard,count(*) reactions,0::bigint comments
 from public.reactions group by 1,2
 union all
 select post_id,mod((hashtextextended(user_id::text,0)&2147483647),128)::smallint,0::bigint,count(*)
 from public.comments group by 1,2
) activity group by 1,2;
insert into public.post_reaction_count_shards(post_id,emoji,shard,reaction_count)
select post_id,emoji,mod((hashtextextended(user_id::text,0)&2147483647),128)::smallint,count(*)::integer
from public.reactions group by 1,2,3;
insert into public.daily_participant_shards(daily_event_id,shard,participant_count)
select daily_event_id,mod((hashtextextended(user_id::text,0)&2147483647),128)::smallint,count(*)::integer
from public.user_events where status='completed' group by 1,2;
select local_load.require((select count(*)=100000 from public.profiles));
select local_load.require((select count(*)=1250000 from public.friendships));
select local_load.require((select sum(reaction_count)=300000 and sum(comment_count)=500000 from public.post_engagement_shards));
select local_load.require(not exists(select 1 from public.posts p left join public.user_events u on u.id=p.user_event_id where u.id is null or u.user_id<>p.user_id or u.daily_event_id<>p.daily_event_id));
select local_load.require(not exists(select 1 from public.profiles p left join auth.users u on u.id=p.id where u.id is null));
select local_load.require(current_setting('session_replication_role')='origin');
commit;
analyze;
