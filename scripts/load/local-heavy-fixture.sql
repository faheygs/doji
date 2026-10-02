-- Synthetic bulk fixture ONLY in the network-disabled disposable local clone.
-- Bypass triggers only during fixture construction; benchmark sessions use origin.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='8min';
set local session_replication_role=replica;
create schema local_load;
create function local_load.id(n integer, kind text default 'a1') returns uuid
language sql immutable strict as $$ select (kind||'000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
create function local_load.require(ok boolean) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Load-test assertion failed'; end if; end $$;
grant usage on schema local_load to authenticated;
grant execute on all functions in schema local_load to authenticated;
insert into auth.users (id,email,role,aud,raw_user_meta_data,created_at)
select local_load.id(n),'load-'||n||'@test.invalid','authenticated','authenticated',
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now()-interval '7 days','privacy_accepted_at',now()-interval '7 days'),now()-interval '7 days'
from generate_series(1,100000) n;
insert into public.profiles(id,username,display_name,created_at)
select local_load.id(n),'load_v'||n,'Synthetic member v'||n,now()-interval '7 days' from generate_series(1,100000) n;
insert into public.challenges(id,title,description,category,type,requires_photo,requires_text)
values(local_load.id(1,'a2'),'Synthetic task','Local load fixture only','creative','task',false,true);
insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at,closed_at)
values(local_load.id(1,'a3'),local_load.id(1,'a2'),now()-interval '1 day',now()-interval '1 day',now()-interval '1 day'+interval '10 minutes',now()-interval '1 day'+interval '10 minutes'),
 (local_load.id(2,'a3'),local_load.id(1,'a2'),now(),now(),now()+interval '10 minutes',null);
insert into public.user_events(id,user_id,daily_event_id,status,expires_at,completed_at)
select local_load.id(n,'a4'),local_load.id(n),local_load.id(1,'a3'),'completed',now()-interval '1 day'+interval '10 minutes',now()-interval '1 day'
from generate_series(1,100000) n;
insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
select local_load.id(n,'a5'),local_load.id(n),local_load.id(2,'a3'),'pending',now()+interval '10 minutes'
from generate_series(1,100000) n;
insert into public.posts(id,user_id,user_event_id,daily_event_id,type,caption,visibility,created_at)
select local_load.id(n,'a6'),local_load.id(n),local_load.id(n,'a4'),local_load.id(1,'a3'),
 'task_complete','Synthetic task response v'||n,'public',now()-interval '1 day'+ n*interval '0.005 seconds'
from generate_series(1,100000) n;
-- Undirected 25-friend ring: 12 links each way and one opposite member.
insert into public.friendships(requester_id,addressee_id,status,accepted_at)
select local_load.id(n),local_load.id(1+(n-1+d)%100000),'accepted',now()-interval '2 days'
from generate_series(1,100000) n cross join generate_series(1,12) d;
insert into public.friendships(requester_id,addressee_id,status,accepted_at)
select local_load.id(n),local_load.id(n+50000),'accepted',now()-interval '2 days' from generate_series(1,50000) n;
insert into public.comments(post_id,user_id,body,created_at)
select local_load.id(n,'a6'),local_load.id(1+(n-1+d)%100000),'Synthetic comment',now()-interval '23 hours'+ d*interval '1 second'
from generate_series(1,100000) n cross join generate_series(1,5) d;
insert into public.reactions(post_id,user_id,emoji)
select local_load.id(n,'a6'),local_load.id(1+(n-1+d)%100000),'heart'
from generate_series(1,100000) n cross join generate_series(1,3) d;
-- Seed rollups from the actual trigger shard expression in the runner, after origin restored.
commit;
