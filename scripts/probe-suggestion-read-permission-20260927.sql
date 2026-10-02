-- Read-only permission probe with a synthetic UUID; returns no member content.
begin read only;
set local statement_timeout='3s';
set local lock_timeout='1s';
set local role authenticated;
select id from public.challenge_suggestions
where user_id='00000000-0000-4000-8000-000000000000'::uuid limit 1;
rollback;
