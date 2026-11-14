begin;
create function pg_temp.assert_ready(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
select pg_temp.assert_ready(public.inspect_doji_readiness_v1(null)='{"enabled":false}','default-off');
update doji_readiness_private.settings set enabled=true;
select pg_temp.assert_ready(public.inspect_doji_readiness_v1(null)->>'state'='missing','missing is not ready');
insert into public.challenges(id,title,description,type,poll_kind,category,difficulty) values
 ('99810000-0000-4000-8000-000000000001','Synthetic private title','Synthetic private answer','poll','wyr','mental',1);
insert into public.poll_options(challenge_id,text,position) values
 ('99810000-0000-4000-8000-000000000001','Synthetic private option A',0),
 ('99810000-0000-4000-8000-000000000001','Synthetic private option B',1);
insert into public.daily_events(id,challenge_id,fires_at,window_minutes) values
 ('99820000-0000-4000-8000-000000000001','99810000-0000-4000-8000-000000000001',now()+interval '1 hour',10);
delete from public.posts where daily_event_id='99820000-0000-4000-8000-000000000001';
create function pg_temp.readiness() returns jsonb language sql as $$select public.inspect_doji_readiness_v1('99820000-0000-4000-8000-000000000001')$$;
select pg_temp.assert_ready(pg_temp.readiness()->>'state'='checked' and pg_temp.readiness()->>'poll_card'='not_checked_before_activation','missing future poll card is expected');
select pg_temp.assert_ready(pg_temp.readiness()::text not like '%Synthetic%' and pg_temp.readiness()::text not like '%9981%','no challenge text or identity projection');
update public.daily_events set fires_at=now()-interval '1 minute' where id='99820000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->>'phase'='awaiting_activation','due but inactive is explicit, not confirmed activated');
update public.daily_events set activated_at=now()-interval '1 minute',closes_at=now()+interval '9 minutes' where id='99820000-0000-4000-8000-000000000001';
delete from public.posts where daily_event_id='99820000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->>'state'='needs_attention' and pg_temp.readiness()->>'poll_card'='missing','missing live poll card is detected');
insert into public.posts(type,daily_event_id,is_community_poll,is_late,visibility) values
 ('poll_vote','99820000-0000-4000-8000-000000000001',true,false,'public');
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_card'='verified','live poll card verified');
update public.posts set moderation_status='quarantined' where daily_event_id='99820000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_card'='unavailable','quarantined card not falsely ready');
select pg_temp.assert_ready((select moderation_status='quarantined' from public.posts where daily_event_id='99820000-0000-4000-8000-000000000001'),'inspection never repairs moderated content');
update public.daily_events set closes_at=now()+interval '11 minutes' where id='99820000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->'issues' ? 'invalid_participation_window','invalid server window detected');
update public.poll_options set is_other=true where challenge_id='99810000-0000-4000-8000-000000000001' and position=1;
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_options'='invalid','WYR Other rejected');
update public.challenges set poll_kind='poll' where id='99810000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_options'='verified','general poll supports one Other');
update public.challenges set poll_kind=null where id='99810000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_options'='invalid','missing poll kind is not verified');
update public.challenges set poll_kind='poll' where id='99810000-0000-4000-8000-000000000001';
update public.poll_options set text=' ' where challenge_id='99810000-0000-4000-8000-000000000001' and position=0;
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_options'='invalid','blank poll choice is not verified');
update public.poll_options set text='Synthetic private option A' where challenge_id='99810000-0000-4000-8000-000000000001' and position=0;
update public.daily_events set closes_at=null where id='99820000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->'issues' ? 'invalid_participation_window','activated occurrence needs a close time');
insert into public.poll_options(challenge_id,text,position)
 select '99810000-0000-4000-8000-000000000001','Synthetic',n from generate_series(2,16)n;
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_options'='limited','oversized option set stays unqualified');
update public.daily_events set closed_at=now() where id='99820000-0000-4000-8000-000000000001';
select pg_temp.assert_ready(pg_temp.readiness()->>'poll_card'='not_checked_after_window','closed feed retention is not mislabeled a missing live card');
select pg_temp.assert_ready((select bool_and(not has_function_privilege(rolname,'public.inspect_doji_readiness_v1(uuid)','EXECUTE'))
 from pg_roles where rolname in ('anon','authenticated','doji_employee','doji_employee_application','doji_business')),
 'no member, browser or business execution grant');
select pg_temp.assert_ready((select bool_and(not has_schema_privilege(rolname,'doji_readiness_private','USAGE')
 and not has_table_privilege(rolname,'doji_readiness_private.settings','SELECT,INSERT,UPDATE,DELETE'))
 from pg_roles where rolname in ('anon','authenticated','service_role','doji_employee','doji_employee_application','doji_business')),
 'private gate has no caller access');
set local role service_role;
select pg_temp.assert_ready(pg_temp.readiness()->>'enabled'='true','service-only execution');
reset role;
rollback;
select 'PASS: readiness fixtures and member state rolled back';
