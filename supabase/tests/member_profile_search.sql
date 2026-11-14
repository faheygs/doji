begin;
set local statement_timeout = '15s';
create function pg_temp.assert_search(v boolean, label text) returns text language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end;
$$;
grant execute on function pg_temp.assert_search(boolean,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99860000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'authenticated','authenticated','search-fixture-'||n||'@test.invalid',now(),
  jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
    'terms_accepted_at',now(),'privacy_accepted_at',now())
from generate_series(1,42)n;
insert into public.profiles(id,username,display_name,timezone,created_at)
select ('99860000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  case n when 8 then 'searchx8' else 'search_'||n end,
  case n when 2 then 'Alex Johnson' when 3 then 'Jordan Smith'
    when 4 then 'Alex Blocked' when 5 then 'Alex Banned' when 6 then 'Alex Demo'
    when 7 then 'Alex Reverse' when 9 then 'Élodie O''Neill'
    when 10 then 'Jean-Luc Picard' else 'Synthetic Member '||n end,
  'America/Denver', now() - n * interval '1 day'
from generate_series(1,42)n;
update public.profiles set is_banned=true where username='search_5';
update public.profiles set is_demo_account=true where username='search_6';
insert into public.blocks(blocker_id,blocked_id) values
 ('99860000-0000-4000-8000-000000000001','99860000-0000-4000-8000-000000000004'),
 ('99860000-0000-4000-8000-000000000007','99860000-0000-4000-8000-000000000001');
insert into public.friendships(requester_id,addressee_id,status) values
 ('99860000-0000-4000-8000-000000000001','99860000-0000-4000-8000-000000000002','accepted'),
 ('99860000-0000-4000-8000-000000000001','99860000-0000-4000-8000-000000000003','pending'),
 ('99860000-0000-4000-8000-000000000009','99860000-0000-4000-8000-000000000001','pending');
set local request.jwt.claims='{"sub":"99860000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
select pg_temp.assert_search((select count(*)=1 from public.search_profiles('ale')), 'first name prefix matches');
select pg_temp.assert_search((select value->>'username'='search_2' from public.search_profiles('JOHN')value), 'last name prefix and case match');
select pg_temp.assert_search((select value->>'username'='search_2' from public.search_profiles('  AL   Jo  ')value), 'full name prefixes and whitespace match');
select pg_temp.assert_search((select count(*)=0 from public.search_profiles('alex smith')), 'all name terms must match');
select pg_temp.assert_search((select value->>'username'='search_9' from public.search_profiles('ÉLO')value), 'unicode names match');
select pg_temp.assert_search((select value->>'username'='search_9' from public.search_profiles('O''Neill')value), 'apostrophes are literal name tokens');
select pg_temp.assert_search((select value->>'username'='search_10' from public.search_profiles('Jean-Luc')value), 'hyphenated names match');
select pg_temp.assert_search((select value->>'username'='search_2' from public.search_profiles('SEARCH_2',1)value), 'exact username ranks first');
select pg_temp.assert_search(not exists(select 1 from public.search_profiles('search_',30)value where value->>'username'='searchx8'), 'underscore is not a wildcard');
select pg_temp.assert_search((select count(*)=0 from public.search_profiles('%%')), 'percent does not enumerate members');
select pg_temp.assert_search((select count(*)=0 from public.search_profiles('!:|&')), 'query operators are not executable syntax');
select pg_temp.assert_search((select count(*)=0 from public.search_profiles('x')), 'one-character query is bounded');
select pg_temp.assert_search((select count(*)=0 from public.search_profiles(repeat('a',101))), 'oversized query is rejected');
select pg_temp.assert_search((select count(*)=30 from public.search_profiles('search',10000)), 'limit capped at thirty');
select pg_temp.assert_search((select count(*)=1 from public.search_profiles('search',-10)), 'negative limit clamped');
select pg_temp.assert_search((select count(*)=20 from public.search_profiles('',null)), 'blank browse default bounded');
select pg_temp.assert_search((select value->>'username'='search_2' from public.search_profiles('',1)value), 'blank browse keeps newest eligible member');
select pg_temp.assert_search(not exists(select 1 from public.search_profiles('search',30)value
 where value->>'username' in ('search_1','search_4','search_5','search_6','search_7')), 'self banned demo and both block directions excluded');
select pg_temp.assert_search((select value->>'friendship_status'='friends' from public.search_profiles('Johnson')value), 'accepted friendship retained');
select pg_temp.assert_search((select value->>'friendship_status'='pending_out' from public.search_profiles('Smith')value), 'outgoing friendship retained');
select pg_temp.assert_search((select value->>'friendship_status'='pending_in' from public.search_profiles('Élodie')value), 'incoming friendship retained');
select pg_temp.assert_search((select array_agg(key order by key)=array['avatar_gradient','avatar_url','display_name','equipped_border_key','friendship_status','id','username']
 from public.search_profiles('Johnson')value cross join lateral jsonb_object_keys(value)key), 'only explicit public fields returned');
reset role;
select pg_temp.assert_search(not has_function_privilege('anon','public.search_profiles(text,integer)','EXECUTE'), 'anonymous role cannot search');
set local request.jwt.claims='{}';
select pg_temp.assert_search((select count(*)=0 from public.search_profiles('search')), 'missing identity yields no members');
rollback;
select 'PASS: member search fixtures rolled back';
