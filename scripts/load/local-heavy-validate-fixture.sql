-- Synthetic clone ONLY. Numeric-only fixture words can decode as blocked words in
-- the real UGC leetspeak filter. Prefix the numeric suffix, not bypass that filter.
begin;
set local statement_timeout='2min';
do $$ begin
 if current_database() !~ '^heavy_load_qa_[0-9]+$'
   or exists(select 1 from auth.users where email is null or email not like '%@test.invalid')
   or exists(select 1 from vault.secrets) then
   raise exception 'Synthetic offline fixture only';
 end if;
end; $$;
set local session_replication_role=replica;
update public.profiles set username='load_v'||right(id::text,12)::integer,
 display_name='Synthetic member v'||right(id::text,12)::integer
where username is distinct from 'load_v'||right(id::text,12)::integer
   or display_name is distinct from 'Synthetic member v'||right(id::text,12)::integer;
update public.posts set caption='Synthetic task response v'||right(id::text,12)::integer
where id::text like 'a6000000-%' and caption is distinct from 'Synthetic task response v'||right(id::text,12)::integer;
set local session_replication_role=origin;
select count(public.assert_acceptable_content(p.username)) from public.profiles p;
select count(public.assert_acceptable_content(p.display_name)) from public.profiles p;
select count(public.assert_acceptable_content(p.caption)) from public.posts p;
commit;
analyze public.profiles;
analyze public.posts;
