-- Freeze candidate access and invalidate retained envelopes, even if re-enabled.
-- Existing member/business legacy sessions are not in these tables.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update employee_session_private.settings set enabled=false,generation=gen_random_uuid() where singleton;
revoke execute on function employee_session_private.execute_store(text,text,text,text,text,integer,text,text) from doji_employee_session;
commit;
