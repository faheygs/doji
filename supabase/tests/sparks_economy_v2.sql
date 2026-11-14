begin;
set local statement_timeout='45s';
create function pg_temp.economy_check(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
select pg_temp.economy_check((select enabled_from is null from sparks_economy_v2_private.settings),'default off');
select pg_temp.economy_check(not has_schema_privilege('authenticated','sparks_economy_v2_private','usage'),'private schema');
select pg_temp.economy_check(not has_function_privilege('anon',
  'sparks_economy_v2_private.completion_amount(numeric,boolean)','execute'),'no public minting');
select pg_temp.economy_check(sparks_economy_v2_private.completion_amount(seconds,false)=expected,'exact timing band '||seconds)
from (values (-1::numeric,0),(0,20),(60,20),(60.001,17),(180,17),(180.001,13),
  (360,13),(360.001,10),(600,10),(86400,10)) t(seconds,expected);
select pg_temp.economy_check(sparks_economy_v2_private.completion_amount(10,true)=5,'paid has no speed bonus');
select pg_temp.economy_check(sparks_economy_v2_private.completion_amount(null,false)=0,'unknown time cannot earn');

do $fixture$
declare actors uuid[]:=array[gen_random_uuid(),gen_random_uuid(),gen_random_uuid()]; challenge uuid; event uuid;
  participant uuid; post_id uuid; own_post uuid; target_post uuid; first_post uuid; first_event uuid;
  vote_option uuid; kind text; amount integer; before_amount integer; current_level integer;
  event_start timestamptz; candidate public.user_events; response jsonb; retry jsonb; key text:=gen_random_uuid()::text;
begin
  for i in 1..3 loop
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
    values(actors[i],'authenticated','authenticated',actors[i]||'@test.invalid',now(),
      jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
        'terms_accepted_at',now(),'privacy_accepted_at',now()));
    insert into public.profiles(id,username,display_name,created_at)
      values(actors[i],'economymember'||i,'Synthetic economy member',now()-interval '7 days');
  end loop;
  -- First event exercises the unchanged disabled path; then all five challenge kinds.
  for n in 0..6 loop
    if n=1 then
      update sparks_economy_v2_private.settings set enabled_from=now()-interval '1 hour';
      update first_doji_badges_private.settings set enabled_from=now()-interval '1 hour';
    end if;
    challenge:=gen_random_uuid(); event:=gen_random_uuid();
    kind:=case when n=6 then 'photo' else (array['photo','task','format','poll','poll'])[greatest(1,least(n,5))] end;
    event_start:=now()-make_interval(secs=>case n when 2 then 90 when 3 then 240 when 4 then 480 when 5 then 900 else 30 end);
    if n=6 then event_start:=now()-interval '2 hours'; end if;
    insert into public.challenges(id,title,description,type,category,poll_kind,xp_reward,requires_text,requires_photo,requires_video,answer_rule)
    values(challenge,'Synthetic economy','Offline only',kind,'creative',case when n=5 then 'wyr' when kind='poll' then 'poll' end,
      25,kind='task',kind='photo',false,case when kind='format' then '{"type":"exact_word_count","count":3}'::jsonb end);
    insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at,window_minutes)
      values(event,challenge,event_start,event_start,now()+interval '10 minutes',10);
    for i in 1..2 loop
      participant:=gen_random_uuid(); post_id:=gen_random_uuid();
      insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
        values(participant,actors[i],event,'pending',now()+interval '10 minutes');
      if kind='poll' then
        if i=1 then
          vote_option:=gen_random_uuid();
          insert into public.poll_options(id,challenge_id,text,position) values(vote_option,challenge,'Synthetic choice',0);
        end if;
        insert into public.poll_votes(user_event_id,user_id,daily_event_id,challenge_id,option_id,idempotency_key)
          values(participant,actors[i],event,challenge,vote_option,gen_random_uuid());
      else
        insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility,caption)
          values(post_id,participant,actors[i],event,case when kind='photo' then 'photo' else 'task_complete' end,'public','Synthetic valid answer');
      end if;
      update public.user_events set status='completed',completed_at=clock_timestamp() where id=participant returning * into candidate;
      if n=0 or n=6 then
        perform pg_temp.economy_check((select delta=5 from public.spark_ledger where user_id=actors[i]
          and reason='challenge_complete' and ref_id=participant::text),'disabled/prior occurrence completion unchanged');
        perform pg_temp.economy_check((select delta=10 from public.spark_ledger where user_id=actors[i]
          and reason='post' and ref_id='post:'||post_id::text),'disabled/prior occurrence extra post unchanged');
      else
        amount:=(array[20,17,13,10,10])[n];
        perform pg_temp.economy_check((select delta=amount from public.spark_ledger where user_id=actors[i]
          and ref_id='economy_v2:completion:'||participant),'one equal completion reward by time');
        perform pg_temp.economy_check(not exists(select 1 from public.spark_ledger where user_id=actors[i]
          and ref_id in('post:'||post_id,'poll_vote:challenge:'||challenge||':'||actors[i])),'no post or vote double dip');
        perform sparks_economy_v2_private.complete(candidate);
        perform pg_temp.economy_check((select count(*)=1 from public.spark_ledger where user_id=actors[i]
          and ref_id='economy_v2:completion:'||participant),'completion replay fenced');
      end if;
      if n=1 then
        first_event:=event;
        if i=1 then target_post:=post_id; first_post:=post_id; else own_post:=post_id; end if;
      end if;
    end loop;
    if n between 1 and 5 then
      perform pg_temp.economy_check((select count(*)=case when n=5 then 0 else 1 end from public.spark_ledger
        where ref_id='economy_v2:first:'||event),'one global first bonus; none after normal window');
    end if;
  end loop;
  insert into public.comments(user_id,post_id,body) values(actors[2],target_post,'Synthetic comment');
  perform pg_temp.economy_check((select earned=3 from sparks_economy_v2_private.social_totals
    where user_id=actors[2] and daily_event_id=first_event),'comment stays three');
  insert into public.comments(user_id,post_id,body) values(actors[2],target_post,'Repeated comment');
  perform sparks_economy_v2_private.social(actors[2],target_post,'reaction');
  perform sparks_economy_v2_private.social(actors[2],target_post,'reaction');
  perform sparks_economy_v2_private.social(actors[2],own_post,'comment');
  perform pg_temp.economy_check((select earned=5 from sparks_economy_v2_private.social_totals
    where user_id=actors[2] and daily_event_id=first_event),'combined cap and self exclusion');
  -- A second eligible post cannot exceed the occurrence-wide cap.
  participant:=gen_random_uuid();
  insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
    values(participant,actors[3],first_event,'pending',now()+interval '10 minutes');
  insert into public.posts(user_event_id,user_id,daily_event_id,type,visibility,caption)
    values(participant,actors[3],first_event,'photo','public','Synthetic extra content') returning id into target_post;
  perform sparks_economy_v2_private.social(actors[2],target_post,'comment');
  perform pg_temp.economy_check((select count(*)=2 from sparks_economy_v2_private.receipts r
    where r.user_id=actors[2] and r.kind in('comment','reaction')),'no farming across posts');
  delete from public.posts where id=first_post;
  perform pg_temp.economy_check((select earned=5 from sparks_economy_v2_private.social_totals
    where user_id=actors[2] and daily_event_id=first_event),'retention cannot reset cap');
  insert into public.friendships(requester_id,addressee_id,status) values(actors[1],actors[2],'pending');
  update public.friendships set status='accepted' where requester_id=actors[1] and addressee_id=actors[2];
  perform pg_temp.economy_check(not exists(select 1 from public.spark_ledger where user_id=any(actors)
    and reason in('friend_request','friend_accept')),'no direct friendship farming');
  select level into current_level from public.profiles where id=actors[2];
  perform pg_temp.economy_check(current_level=1,'level fixture starts at one');
  update public.profiles set xp=1200 where id=actors[2];
  perform pg_temp.economy_check((select delta=50 from public.spark_ledger where user_id=actors[2]
    and ref_id='economy_v2:levels:2-3'),'all newly crossed levels pay ten times level');
  update public.profiles set xp=0 where id=actors[2];
  update public.profiles set xp=1200 where id=actors[2];
  perform pg_temp.economy_check((select count(*)=1 from public.spark_ledger where user_id=actors[2]
    and ref_id='economy_v2:levels:2-3'),'level recovery cannot pay twice');
  perform sparks_economy_v2_private.level_reward(actors[1],9,8);
  perform sparks_economy_v2_private.level_reward(actors[1],8,9);
  perform pg_temp.economy_check(not exists(select 1 from public.spark_ledger where user_id=actors[1]
    and ref_id='economy_v2:levels:9-9'),'first observed downgrade preserves existing level high-water mark');
  perform sparks_economy_v2_private.level_reward(actors[1],9,10);
  perform pg_temp.economy_check((select delta=100 from public.spark_ledger where user_id=actors[1]
    and ref_id='economy_v2:levels:10-10'),'existing level nine gets only new level ten, no backfill');
  -- Actual member RPC and its receipt replay, not only direct fixture transitions.
  challenge:=gen_random_uuid(); event:=gen_random_uuid(); participant:=gen_random_uuid();
  insert into public.challenges(id,title,description,type,category,requires_text,requires_photo,requires_video)
    values(challenge,'Synthetic command','Offline only','task','creative',true,false,false);
  insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at,window_minutes)
    values(event,challenge,now()-interval '30 seconds',now()-interval '30 seconds',now()+interval '9 minutes',10);
  insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
    values(participant,actors[1],event,'pending',now()+interval '9 minutes');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actors[1],'role','authenticated')::text,true);
  response:=public.complete_doji_with_post(participant,'task_complete','Synthetic command answer',null,null,null,'public',key);
  retry:=public.complete_doji_with_post(participant,'task_complete','Synthetic command answer',null,null,null,'public',key);
  perform pg_temp.economy_check(response->>'id'=retry->>'id','real command receipt replay');
  perform pg_temp.economy_check((select sum(delta)=25 from public.spark_ledger where user_id=actors[1]
    and ref_id in('economy_v2:completion:'||participant,'economy_v2:first:'||event)),'real command total is twenty plus five once');
  -- A real paid late command gets only the new half-base, never old post/vote extras.
  event:=gen_random_uuid(); participant:=gen_random_uuid(); key:=gen_random_uuid()::text;
  insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at,window_minutes)
    values(event,challenge,now()-interval '12 minutes',now()-interval '12 minutes',now()-interval '2 minutes',10);
  insert into public.user_events(id,user_id,daily_event_id,status,expires_at,buy_in_at)
    values(participant,actors[1],event,'buy_in_open',now()-interval '2 minutes',clock_timestamp());
  response:=public.complete_doji_with_post(participant,'task_complete','Synthetic late answer',null,null,null,'public',key);
  perform pg_temp.economy_check((select delta=5 from public.spark_ledger where user_id=actors[1]
    and ref_id='economy_v2:completion:'||participant),'paid command earns five');
  perform pg_temp.economy_check(not exists(select 1 from public.spark_ledger
    where ref_id in('economy_v2:first:'||event,'post:'||(response->>'id'))),'paid command has no first or post bonus');
  -- Duplicate receipt fences and the entire wallet roll back with failed work.
  select sparks into before_amount from public.profiles where id=actors[3];
  begin
    perform sparks_economy_v2_private.claim(actors[3],'first',gen_random_uuid(),5,'challenge_complete');
    raise exception 'synthetic_abort';
  exception when raise_exception then if sqlerrm<>'synthetic_abort' then raise; end if;
  end;
  perform pg_temp.economy_check((select sparks=before_amount from public.profiles where id=actors[3]),'failed work retains prior balance');
  select * into candidate from public.user_events where id=participant;
  -- Administrative fixture transitions must not retain the prior member's JWT.
  perform set_config('request.jwt.claims','{}',true);
  update public.profiles set is_demo_account=true where id=actors[1];
  perform sparks_economy_v2_private.complete(candidate);
  perform sparks_economy_v2_private.level_reward(actors[1],10,11);
  perform pg_temp.economy_check(not exists(select 1 from public.spark_ledger where user_id=actors[1]
    and ref_id='economy_v2:levels:11-11'),'demo cannot earn levels');
  update public.profiles set is_demo_account=false,is_banned=true where id=actors[1];
  perform sparks_economy_v2_private.level_reward(actors[1],10,11);
  perform pg_temp.economy_check(not exists(select 1 from public.spark_ledger where user_id=actors[1]
    and ref_id='economy_v2:levels:11-11'),'banned cannot earn levels');
end $fixture$;
select 'PASS: economy timing, all kinds, disabled/prior events, rewards, caps, levels, retention and real command replay';
rollback;
