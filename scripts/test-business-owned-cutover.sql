create function pg_temp.ok(p boolean,label text) returns text language plpgsql as $$begin
 if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text) returns text language plpgsql as $$begin
 begin execute q;exception when insufficient_privilege then return 'PASS: '||label;end;
 raise exception 'FAIL: expected denial %',label;end$$;
update business_session_private.owned_auth_settings set enabled=true,scope_hash=repeat('a',64);
select pg_temp.ok(not has_function_privilege('doji_business_session','business_session_private.put_bound_session(text,text,text,integer,text,text,text,text)','execute'),'cutover revokes legacy bound installer');
select pg_temp.ok(not has_function_privilege('doji_business_session','business_session_private.execute_store(text,text,text,text,text,integer,text,text)','execute'),'cutover revokes legacy raw store');
select pg_temp.ok(has_function_privilege('doji_business_session','business_session_private.execute_owned_store_v1(text,text,text,text,text,integer,text,text)','execute'),'owned bridge remains available');
select pg_temp.ok(not has_function_privilege('authenticated','business_session_private.execute_owned_store_v1(text,text,text,text,text,integer,text,text)','execute'),'member cannot call owned bridge');
select pg_temp.ok(not has_function_privilege('doji_employee','business_session_private.execute_owned_store_v1(text,text,text,text,text,integer,text,text)','execute'),'employee cannot call owned bridge');
set role doji_business_session;
select pg_temp.denied($q$select business_session_private.put_bound_session(repeat('a',64),repeat('b',64),repeat('x',64),10000,'https://business.test','client_business','user_one','session_one')$q$,'stale runtime cannot call old installer');
select pg_temp.denied($q$select business_session_private.execute_store(repeat('a',64),'put','session',repeat('b',64),repeat('x',64),10000,null,null)$q$,'stale runtime cannot call raw session put');
select pg_temp.denied($q$select business_session_private.execute_owned_store_v1(repeat('a',64),'put','session',repeat('b',64),repeat('x',64),10000,null,null)$q$,'bridge never permits unguarded session creation');
select pg_temp.ok(business_session_private.execute_owned_store_v1(repeat('a',64),'put','flow',repeat('b',64),repeat('x',64),10000,null,null)->>'state'='ok','owned bridge keeps encrypted continuation writes');
select business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('c',64),repeat('d',64),repeat('e',64));
select pg_temp.ok(business_session_private.put_owned_session_v1(repeat('a',64),repeat('c',64),repeat('f',64),repeat('x',64),10000,'https://business.test','client_business','user_one','session_one')->>'state'='ok','guarded definer still installs a bound session after cutover');
select pg_temp.ok(business_session_private.execute_owned_store_v1(repeat('a',64),'acquire','session',repeat('f',64),null,null,repeat('d',64),null)->>'state'='ok','existing authorized session leasing uses owned bridge');
reset role;
