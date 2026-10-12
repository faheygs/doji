create function pg_temp.ok(p boolean,label text) returns text language plpgsql as $$begin
 if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: expected denial %',label;end$$;
select pg_temp.denied($q$select business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',md5('a')||md5('a'),repeat('b',64),repeat('c',64))$q$,'candidate starts disabled');
update business_session_private.owned_auth_settings set enabled=true,scope_hash=repeat('a',64);
select pg_temp.denied($q$select business_session_private.admit_owned_auth_v1(repeat('b',64),'signin',repeat('1',64),repeat('b',64),repeat('c',64))$q$,'wrong scope denied');
select pg_temp.denied($q$select business_session_private.admit_owned_auth_v1(repeat('a',64),'unknown',repeat('1',64),repeat('b',64),repeat('c',64))$q$,'unknown action denied','22023');
select pg_temp.denied($q$select business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('1',64),'email@example.test',repeat('c',64))$q$,'plaintext identity rejected','22023');
set local role doji_business_session;
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('1',64),repeat('b',64),repeat('c',64))->>'state'='allowed','restricted server role admits one attempt');
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('1',64),repeat('b',64),repeat('c',64))->>'state'='duplicate','replay cannot authorize a second provider call');
select pg_temp.denied($q$select * from business_session_private.owned_auth_tickets$q$,'server role cannot directly read tickets');
select pg_temp.denied($q$select business_session_private.owned_auth_lock_v1(repeat('a',64))$q$,'private lock helper is not callable');
reset role;
select pg_temp.ok((select attempts=1 from business_session_private.owned_auth_buckets where kind='identity'),'replay does not double charge');
do $$begin for n in 2..10 loop
 perform business_session_private.admit_owned_auth_v1(repeat('a',64),'verify',md5(n::text)||md5(n::text),repeat('b',64),repeat('c',64));end loop;end$$;
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'recover',repeat('2',64),repeat('b',64),repeat('d',64))->>'state'='limited','changing action or network cannot bypass identity cap');
select pg_temp.ok((select count(*)=10 from business_session_private.owned_auth_tickets),'denial creates no ticket');
select pg_temp.ok((select attempts=10 from business_session_private.owned_auth_buckets where kind='global'),'denial does not consume unrelated budget');
update business_session_private.owned_auth_buckets set started_at=clock_timestamp()-interval '11 minutes';
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('2',64),repeat('b',64),repeat('c',64))->>'state'='allowed','expired budgets recover on demand');

-- Two real independent principals and one existing session each.
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('1',64),repeat('3',64),repeat('x',64),100000,'https://business.test','client_business','user_one','session_one')->>'state'='ok','ticket installs an atomically bound business session');
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('1',64),repeat('3',64),repeat('x',64),100000,'https://business.test','client_business','user_one','session_one')->>'state'='ok','identical install is idempotent');
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('1',64),repeat('4',64),repeat('x',64),100000,'https://business.test','client_business','user_two','session_two')->>'state'='denied','ticket cannot install a second account');
select business_session_private.put_bound_session(repeat('a',64),repeat('4',64),repeat('x',64),100000,'https://business.test','client_business','user_two','session_two');
select business_session_private.execute_store(repeat('a',64),'acquire','session',repeat('3',64),null,null,repeat('5',64),null);
select pg_temp.ok(business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('6',64),'https://business.test','client_business','user_one')->>'state'='started','reset guard commits before provider operation');
select pg_temp.ok(not exists(select 1 from business_session_private.records where key_hash=repeat('3',64)),'reset removes target session even while leased');
select pg_temp.ok(exists(select 1 from business_session_private.records where key_hash=repeat('4',64)),'other business session remains');
select pg_temp.ok(business_session_private.execute_store(repeat('a',64),'replace','session',repeat('3',64),repeat('y',64),null,repeat('5',64),null)->>'state'='missing','old lease cannot recreate a removed session');
select pg_temp.ok(business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('6',64),'https://business.test','client_business','user_one')->>'state'='pending','begin replay cannot authorize another provider write');
select pg_temp.ok(business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('7',64),'https://business.test','client_business','user_one')->>'state'='pending','different operation cannot take over uncertain reset');
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('2',64),repeat('8',64),repeat('x',64),100000,'https://business.test','client_business','user_one','session_one')->>'state'='denied','inflight sign-in cannot pass pending reset');
select pg_temp.ok(business_session_private.complete_owned_reset_v1(repeat('a',64),repeat('6',64),'https://business.test','client_business','user_two')->>'state'='denied','completion proof must match original subject');
select pg_temp.ok(business_session_private.complete_owned_reset_v1(repeat('a',64),repeat('6',64),'https://business.test','client_business','user_one')->>'state'='complete','confirmed reset completes');
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('2',64),repeat('8',64),repeat('x',64),100000,'https://business.test','client_business','user_one','session_one')->>'state'='denied','old sign-in remains fenced after reset completion');
select business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('9',64),repeat('b',64),repeat('c',64));
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('9',64),repeat('8',64),repeat('x',64),100000,'https://business.test','client_business','user_one','session_new')->>'state'='ok','new sign-in after completed reset works');
select business_session_private.complete_owned_reset_v1(repeat('a',64),repeat('6',64),'https://business.test','client_business','user_one');
select pg_temp.ok(exists(select 1 from business_session_private.records where key_hash=repeat('8',64)),'completion replay preserves newly created session');
select pg_temp.denied($q$select business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('e',64),'https://employee.test','client_employee','user_staff')$q$,'employee realm cannot be reset');
select pg_temp.denied($q$select business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('e',64),'https://business.test','client_business','user_member')$q$,'unmapped member cannot be reset');
select pg_temp.denied($q$select business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('e',64),'https://business.test','wrong_client','user_one')$q$,'wrong audience cannot reset business');
update business_private.accounts set disabled=true where id='98110000-0000-4000-8000-000000000001';
select pg_temp.denied($q$select business_session_private.begin_owned_reset_v1(repeat('a',64),repeat('e',64),'https://business.test','client_business','user_one')$q$,'disabled account is not revived by reset');
update business_private.accounts set disabled=false where id='98110000-0000-4000-8000-000000000001';
select pg_temp.ok(not exists(select 1 from pg_proc p,unnest(array['anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver','doji_employee_session']) role_name
 where p.pronamespace='business_session_private'::regnamespace and p.proname like '%owned%'
 and has_function_privilege(role_name,p.oid,'execute')),'member, employee and public API roles have no candidate function access');
select pg_temp.ok(not exists(select 1 from pg_class c,unnest(array['anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver','doji_employee_session','doji_business_session']) role_name
 where c.relnamespace='business_session_private'::regnamespace and c.relname like 'owned_auth_%' and c.relkind='r'
 and (not c.relrowsecurity or has_table_privilege(role_name,c.oid,'select,insert,update,delete,truncate,references,trigger'))),'all candidate tables have RLS and no API direct access');

truncate business_session_private.owned_auth_buckets,business_session_private.owned_auth_tickets;
do $$begin for n in 1..30 loop
 perform business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',md5('n'||n)||md5('n'||n),md5('i'||n)||md5('i'||n),repeat('c',64));end loop;end$$;
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('f',64),repeat('f',64),repeat('c',64))->>'state'='limited','network cap covers different identities');
truncate business_session_private.owned_auth_buckets,business_session_private.owned_auth_tickets;
do $$begin for n in 1..60 loop
 perform business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',md5('n'||n)||md5('n'||n),md5('i'||n)||md5('i'||n),md5('p'||n)||md5('p'||n));end loop;end$$;
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('f',64),repeat('f',64),repeat('f',64))->>'state'='limited','global cap bounds distributed abuse');
truncate business_session_private.owned_auth_buckets,business_session_private.owned_auth_tickets;
insert into business_session_private.owned_auth_tickets(key_hash,action,epoch,expires_at)
 select md5(n::text)||md5(n::text),'signin',1,clock_timestamp()+interval '5 minutes' from generate_series(1,128) n;
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('f',64),repeat('f',64),repeat('f',64))->>'state'='limited','ticket cardinality cap denies before allocating buckets');
select pg_temp.ok(not exists(select 1 from business_session_private.owned_auth_buckets),'capacity denial does not partially charge budgets');
update business_session_private.owned_auth_tickets set expires_at=clock_timestamp()-interval '1 second';
select pg_temp.ok(business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('f',64),repeat('f',64),repeat('f',64))->>'state'='allowed','bounded expiry cleanup recovers capacity');
select pg_temp.ok((select count(*)=97 from business_session_private.owned_auth_tickets),'cleanup deletes at most 32 tickets per command');
update business_session_private.owned_auth_tickets set expires_at=clock_timestamp()-interval '1 second' where key_hash=repeat('f',64);
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('f',64),repeat('b',64),repeat('x',64),10000,'https://business.test','client_business','user_one','session_new')->>'state'='denied','expired admission never installs a session');
