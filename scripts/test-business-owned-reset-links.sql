create function pg_temp.ok(p boolean,label text) returns text language plpgsql as $$begin
 if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: expected denial %',label;end$$;
create temp table reset_clock as select floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)::bigint expiry;
select pg_temp.denied($q$select business_session_private.get_owned_reset_link_v1(repeat('a',64),repeat('b',64))$q$,'reset-link storage defaults disabled');
update business_session_private.owned_auth_settings set enabled=true,scope_hash=repeat('a',64);
select pg_temp.denied($q$select business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('b',64),'password_reset_one',repeat('x',64),1,'https://business.test','client_business','user_one')$q$,'expired metadata cannot be stored','22023');
select pg_temp.denied($q$select business_session_private.get_owned_reset_link_v1(repeat('b',64),repeat('b',64))$q$,'wrong scope cannot read reset metadata');
select pg_temp.ok(business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('b',64),'password_reset_one',repeat('x',64),(select expiry from reset_clock),'https://business.test','client_business','user_one')->>'state'='ok','verified metadata stored');
select pg_temp.ok(business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('b',64),'password_reset_one',repeat('x',64),(select expiry from reset_clock),'https://business.test','client_business','user_one')->>'state'='ok','identical metadata write is idempotent');
select pg_temp.ok(business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('b',64),'password_reset_one',repeat('y',64),(select expiry from reset_clock),'https://business.test','client_business','user_two')->>'state'='denied','link cannot be rebound to another account');
select pg_temp.ok(business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('c',64),'password_reset_one',repeat('x',64),(select expiry from reset_clock),'https://business.test','client_business','user_one')->>'state'='denied','provider reset ID cannot be rebound to another token');
set local role doji_business_session;
select pg_temp.ok(business_session_private.get_owned_reset_link_v1(repeat('a',64),repeat('b',64))->>'envelope'=repeat('x',64),'restricted role reads only via scoped command');
select pg_temp.denied($q$select * from business_session_private.owned_auth_reset_links$q$,'restricted role cannot directly read link table');
reset role;
select pg_temp.ok(business_session_private.begin_owned_reset_link_v1(repeat('a',64),repeat('c',64),repeat('d',64),'https://business.test','client_business','user_one')->>'state'='denied','unknown link cannot fence account');
select pg_temp.ok(business_session_private.begin_owned_reset_link_v1(repeat('a',64),repeat('b',64),repeat('d',64),'https://business.test','client_business','user_two')->>'state'='denied','mapped link cannot reset another account');
select pg_temp.ok(business_session_private.begin_owned_reset_link_v1(repeat('a',64),repeat('b',64),repeat('d',64),'https://business.test','client_business','user_one')->>'state'='started','mapped link and reset fence bind atomically');
select pg_temp.ok((select operation_hash=repeat('d',64) from business_session_private.owned_auth_reset_links where token_hash=repeat('b',64)),'operation persisted before provider dispatch');
select pg_temp.ok(business_session_private.begin_owned_reset_link_v1(repeat('a',64),repeat('b',64),repeat('d',64),'https://business.test','client_business','user_one')->>'state'='pending','repeat link dispatch remains pending');
select pg_temp.ok(business_session_private.begin_owned_reset_link_v1(repeat('a',64),repeat('b',64),repeat('e',64),'https://business.test','client_business','user_one')->>'state'='denied','changed operation cannot redispatch link');
select pg_temp.ok(business_session_private.reconcile_owned_reset_link_v1(repeat('a',64),'event_wrong','password_reset_one','https://business.test','client_business','user_two')->>'state'='denied','wrong-subject success does not unlock fence');
update business_session_private.owned_auth_reset_links set expires_at=clock_timestamp()-interval '1 hour';
select pg_temp.ok(business_session_private.get_owned_reset_link_v1(repeat('a',64),repeat('b',64))->>'state'='missing','expired link unavailable to browser reset');
select pg_temp.ok(business_session_private.reconcile_owned_reset_link_v1(repeat('a',64),'event_one','password_reset_one','https://business.test','client_business','user_one')->>'state'='complete','signed success can reconcile pending reset after link expires');
select pg_temp.ok((select pending_reset is null from business_session_private.owned_auth_fences where principal='98110000-0000-4000-8000-000000000001'),'matching success releases only its pending fence');
select pg_temp.ok((select success_event='event_one' and completed_at is not null from business_session_private.owned_auth_reset_links where token_hash=repeat('b',64)),'minimal success evidence retained');
select business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('1',64),repeat('2',64),repeat('3',64));
select business_session_private.put_owned_session_v1(repeat('a',64),repeat('1',64),repeat('4',64),repeat('x',64),100000,'https://business.test','client_business','user_one','session_fresh');
delete from business_session_private.owned_auth_resets where completed_at is not null;
select pg_temp.ok(business_session_private.reconcile_owned_reset_link_v1(repeat('a',64),'event_one','password_reset_one','https://business.test','client_business','user_one')->>'state'='complete','late success remains idempotent after shorter guard receipt cleanup');
select pg_temp.ok(exists(select 1 from business_session_private.records where key_hash=repeat('4',64)),'late success does not revoke a fresh session');
select pg_temp.ok(business_session_private.reconcile_owned_reset_link_v1(repeat('a',64),'event_unknown','password_reset_unknown','https://business.test','client_business','user_one')->>'state'='ignored','unknown provider reset does not create local state');
select business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('5',64),'password_reset_external',repeat('x',64),(select expiry from reset_clock),'https://business.test','client_business','user_two');
select pg_temp.ok(business_session_private.reconcile_owned_reset_link_v1(repeat('a',64),'event_one','password_reset_external','https://business.test','client_business','user_two')->>'state'='denied','event ID cannot be replayed onto another reset');
select pg_temp.ok(business_session_private.reconcile_owned_reset_link_v1(repeat('a',64),'event_external','password_reset_external','https://business.test','client_business','user_two')->>'state'='complete','pre-dispatch success consumes the exact link');
select pg_temp.ok(business_session_private.begin_owned_reset_link_v1(repeat('a',64),repeat('5',64),repeat('6',64),'https://business.test','client_business','user_two')->>'state'='denied','already-consumed link never starts reset');
select pg_temp.ok(not exists(select 1 from business_session_private.owned_auth_fences where principal='98110000-0000-4000-8000-000000000002'),'pre-dispatch event does not invent an account fence');
select pg_temp.ok(not exists(select 1 from pg_proc p cross join unnest(array['anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver']) role_name
 where p.pronamespace='business_session_private'::regnamespace and p.proname like '%owned_reset_link_v1'
 and has_function_privilege(role_name,p.oid,'execute')),'member employee and public API roles cannot use reset-link commands');
select pg_temp.ok((select relrowsecurity from pg_class where oid='business_session_private.owned_auth_reset_links'::regclass),'reset-link table has RLS');
truncate business_session_private.owned_auth_reset_links;
insert into business_session_private.owned_auth_reset_links(token_hash,reset_id,principal,envelope,expires_at)
 select md5(n::text)||md5(n::text),'password_reset_cap'||n,'98110000-0000-4000-8000-000000000001',repeat('x',64),clock_timestamp()+interval '1 hour' from generate_series(1,128)n;
select pg_temp.ok(business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('7',64),'password_reset_capacity',repeat('x',64),(select expiry from reset_clock),'https://business.test','client_business','user_one')->>'state'='limited','reset-link cardinality bounded at 128');
update business_session_private.owned_auth_reset_links set expires_at=clock_timestamp()-interval '1 day';
update business_session_private.owned_auth_reset_links set operation_hash=repeat('8',64) where reset_id='password_reset_cap1';
select pg_temp.ok(business_session_private.put_owned_reset_link_v1(repeat('a',64),repeat('7',64),'password_reset_capacity',repeat('x',64),(select expiry from reset_clock),'https://business.test','client_business','user_one')->>'state'='ok','on-demand expiry cleanup frees bounded capacity');
select pg_temp.ok((select count(*)=97 from business_session_private.owned_auth_reset_links),'at most 32 expired links cleaned per write');
select pg_temp.ok(exists(select 1 from business_session_private.owned_auth_reset_links where operation_hash=repeat('8',64)),'pending metadata retained regardless of expired token');
