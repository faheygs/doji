create function pg_temp.ok(p boolean,label text) returns text language plpgsql as $$begin
 if p is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: expected denial %',label;end$$;
update business_session_private.owned_auth_settings set enabled=true,scope_hash=repeat('a',64);
select pg_temp.ok(business_session_private.admit_owned_acceptance_v1(repeat('a',64),'register',repeat('1',64),repeat('b',64),repeat('c',64))->>'state'='denied','acceptance defaults closed');
select pg_temp.ok(not business_session_private.reserve_owned_acceptance_v1(repeat('a',64),repeat('b',64),repeat('1',64),repeat('2',64)),'closed acceptance cannot spend slot');
update business_session_private.owned_auth_acceptance set enabled=true,scope_hash=repeat('a',64),identity_hmac=repeat('b',64),started_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour';
select pg_temp.denied($q$update business_session_private.owned_auth_acceptance set expires_at=started_at+interval '3 hours'$q$,'acceptance cannot exceed two hours','23514');
select pg_temp.denied($q$select business_session_private.admit_owned_acceptance_v1(repeat('d',64),'register',repeat('1',64),repeat('b',64),repeat('c',64))$q$,'acceptance enforces business scope');
select pg_temp.ok(business_session_private.admit_owned_acceptance_v1(repeat('a',64),'register',repeat('1',64),repeat('d',64),repeat('c',64))->>'state'='denied','non-approved identity is denied');
select pg_temp.ok(not exists(select 1 from business_session_private.owned_auth_tickets),'non-approved identity creates no ticket');
select pg_temp.ok(not business_session_private.reserve_owned_acceptance_v1(repeat('a',64),repeat('d',64),repeat('1',64),repeat('2',64)),'non-approved identity cannot reserve');
-- Acceptance deployment revokes the normal entry point: a mode mismatch must
-- deny, not silently open authentication for every business identity.
revoke execute on function business_session_private.admit_owned_auth_v1(text,text,text,text,text) from doji_business_session;
set local role doji_business_session;
select pg_temp.denied($q$select business_session_private.admit_owned_auth_v1(repeat('a',64),'signin',repeat('1',64),repeat('b',64),repeat('c',64))$q$,'acceptance role cannot bypass restricted admission');
select pg_temp.ok(business_session_private.admit_owned_acceptance_v1(repeat('a',64),'register',repeat('1',64),repeat('b',64),repeat('c',64))->>'state'='allowed','approved identity uses existing guard budgets');
select pg_temp.ok(business_session_private.reserve_owned_acceptance_v1(repeat('a',64),repeat('b',64),repeat('1',64),repeat('2',64)),'one approved slot is reserved');
select pg_temp.ok(not business_session_private.reserve_owned_acceptance_v1(repeat('a',64),repeat('b',64),repeat('1',64),repeat('2',64)),'same reservation cannot redispatch provider create');
select pg_temp.ok(not business_session_private.reserve_owned_acceptance_v1(repeat('a',64),repeat('b',64),repeat('3',64),repeat('2',64)),'new request cannot exceed one slot');
select pg_temp.denied($q$select * from business_session_private.owned_auth_acceptance$q$,'restricted role cannot read acceptance target');
select pg_temp.denied($q$update business_session_private.owned_auth_acceptance set reserved_at=null$q$,'restricted role cannot refund allowance');
reset role;
select pg_temp.ok(not exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role','doji_employee','doji_business','doji_identity_resolver') and
 (has_function_privilege(r.rolname,'business_session_private.admit_owned_acceptance_v1(text,text,text,text,text)','execute') or
 has_function_privilege(r.rolname,'business_session_private.reserve_owned_acceptance_v1(text,text,text,text)','execute'))),'member and employee roles cannot use acceptance');
update business_session_private.owned_auth_acceptance set started_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 second';
select pg_temp.ok(business_session_private.admit_owned_acceptance_v1(repeat('a',64),'verify',repeat('4',64),repeat('b',64),repeat('c',64))->>'state'='denied','expiry also denies verification continuation');
select pg_temp.ok(business_session_private.admit_owned_acceptance_v1(repeat('a',64),'reset',repeat('5',64),repeat('b',64),repeat('c',64))->>'state'='denied','expiry denies new password writes');
select pg_temp.ok((select reserved_at is not null from business_session_private.owned_auth_acceptance),'expiry preserves spent slot');
