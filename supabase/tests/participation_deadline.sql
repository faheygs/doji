begin;
set local statement_timeout = '15s';
create function pg_temp.assert_deadline(v boolean, label text) returns text language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;
-- Hosted defaults can deny PUBLIC execution; only this temporary assertion needs
-- authenticated access. The helper and grant disappear with the rollback.
grant execute on function pg_temp.assert_deadline(boolean, text) to authenticated;

insert into auth.users(id, aud, role, email, email_confirmed_at, raw_user_meta_data)
select ('99830000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'deadline-' || n || '@test.invalid', now(),
  jsonb_build_object('terms_version', '2026-08-20', 'privacy_version', '2026-08-20',
    'terms_accepted_at', now(), 'privacy_accepted_at', now())
from generate_series(1, 8) n;
insert into public.profiles(id, username, display_name, timezone, created_at)
select ('99830000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'deadline_' || n, 'Synthetic deadline member', 'America/Denver',
  case when n <= 2 then now() else now() - interval '7 days' end
from generate_series(1, 8) n;
insert into public.challenges(id, title, description, category, type)
values ('99840000-0000-4000-8000-000000000001', 'Synthetic deadline photo', 'Offline fixture', 'creative', 'photo');
insert into public.daily_events(id, challenge_id, fires_at, window_minutes)
values ('99850000-0000-4000-8000-000000000001', '99840000-0000-4000-8000-000000000001', now() + interval '5 minutes', 10);
select public.begin_daily_event_prelive('99850000-0000-4000-8000-000000000001');

-- Use the member read that materializes real pre-live occurrences, not fabricated
-- grace fields: one new member before activation, another after, and a normal member.
set local request.jwt.claims = '{"sub":"99830000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select pg_temp.assert_deadline(public.get_current_doji_state()->>'phase' = 'waiting', 'new member enters pre-live');
reset role;
set local request.jwt.claims = '{"sub":"99830000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;
select pg_temp.assert_deadline(public.get_current_doji_state()->>'phase' = 'waiting', 'normal member enters pre-live');
reset role;

insert into public.user_events(user_id, daily_event_id, status, expires_at, buy_in_at)
select ('99830000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  '99850000-0000-4000-8000-000000000001',
  case n when 4 then 'buy_in_open' when 5 then 'completed' when 6 then 'missed' when 7 then 'late' else 'pending' end,
  now() + interval '2 hours', case when n in (4, 8) then now() else null end
from generate_series(4, 8) n;
create temp table deadline_before on commit drop as
select user_id, status, expires_at, signup_day_grace from public.user_events
where daily_event_id = '99850000-0000-4000-8000-000000000001';

select public.activate_daily_event('99850000-0000-4000-8000-000000000001');
select pg_temp.assert_deadline((select u.signup_day_grace and u.expires_at = b.expires_at
  from public.user_events u join deadline_before b using(user_id)
  where u.daily_event_id = '99850000-0000-4000-8000-000000000001'
    and u.user_id = '99830000-0000-4000-8000-000000000001'), 'pre-live signup grace survives activation');
set local request.jwt.claims = '{"sub":"99830000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;
select pg_temp.assert_deadline(public.get_current_doji_state()->>'phase' = 'live', 'new member joins after activation');
reset role;
select pg_temp.assert_deadline((select count(distinct expires_at) = 1 and bool_and(signup_day_grace)
  from public.user_events where daily_event_id = '99850000-0000-4000-8000-000000000001'
  and user_id in ('99830000-0000-4000-8000-000000000001','99830000-0000-4000-8000-000000000002')),
  'grace deadline does not depend on joining before or after activation');
select pg_temp.assert_deadline((select closes_at - activated_at = interval '10 minutes'
  from public.daily_events where id = '99850000-0000-4000-8000-000000000001'), 'normal window remains 600 seconds');
select pg_temp.assert_deadline((select u.expires_at = d.closes_at and not u.signup_day_grace
  from public.user_events u join public.daily_events d on d.id = u.daily_event_id
  where d.id = '99850000-0000-4000-8000-000000000001'
    and u.user_id = '99830000-0000-4000-8000-000000000003'), 'normal deadline follows activation');

-- Delayed-alarm recovery still moves normal pending deadlines, not exceptions.
update public.daily_events set closes_at = closes_at + interval '30 seconds'
where id = '99850000-0000-4000-8000-000000000001';
select pg_temp.assert_deadline((select u.expires_at = d.closes_at from public.user_events u
  join public.daily_events d on d.id = u.daily_event_id
  where d.id = '99850000-0000-4000-8000-000000000001'
    and u.user_id = '99830000-0000-4000-8000-000000000003'), 'normal recovery deadline follows the server');
select pg_temp.assert_deadline(not exists(select 1 from public.user_events u join deadline_before b using(user_id)
  where u.daily_event_id = '99850000-0000-4000-8000-000000000001'
    and u.user_id <> '99830000-0000-4000-8000-000000000003'
    and (u.expires_at, u.status, u.signup_day_grace) is distinct from (b.expires_at, b.status, b.signup_day_grace)),
  'grace, paid participation and terminal records are not rewritten');
create temp table deadline_recovered on commit drop as
select id, expires_at from public.user_events where daily_event_id = '99850000-0000-4000-8000-000000000001';
update public.daily_events set closes_at = null where id = '99850000-0000-4000-8000-000000000001';
select pg_temp.assert_deadline(not exists(select 1 from public.user_events u join deadline_recovered b using(id)
  where u.expires_at is distinct from b.expires_at), 'null close does not erase deadlines');

-- Exercise the real close/read behavior after the shared window, while each
-- signup-day exception is still valid. Clock manipulation stays in this rollback fixture.
update public.daily_events set closes_at = now() - interval '1 second'
where id = '99850000-0000-4000-8000-000000000001';
select public.close_daily_event('99850000-0000-4000-8000-000000000001');
select pg_temp.assert_deadline((select status = 'missed' from public.user_events
  where daily_event_id = '99850000-0000-4000-8000-000000000001'
    and user_id = '99830000-0000-4000-8000-000000000003'), 'normal member closes as missed');
set local request.jwt.claims = '{"sub":"99830000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select pg_temp.assert_deadline(public.get_current_doji_state()->>'phase' = 'live', 'signup grace remains available after shared close');
reset role;
select pg_temp.assert_deadline((select status = 'buy_in_open' from public.user_events
  where daily_event_id = '99850000-0000-4000-8000-000000000001'
    and user_id = '99830000-0000-4000-8000-000000000004'), 'paid opportunity survives shared close');
rollback;
select 'PASS: deadline fixtures rolled back';
