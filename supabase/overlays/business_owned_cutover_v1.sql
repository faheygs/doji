-- SEPARATE GATED CUTOVER. NOT a migration or ordinary frontend release.
-- Prerequisites: replacement runtime/bridge verified, new auth ingress in maintenance,
-- old callback entrypoints stopped. Do NOT enable reset until this commits AND old
-- in-flight database calls have drained. Preserve pre-cutover privilege evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
revoke execute on function business_session_private.put_bound_session(text,text,text,integer,text,text,text,text),
 business_session_private.execute_store(text,text,text,text,text,integer,text,text)
 from doji_business_session;
-- Guarded SECURITY DEFINER functions retain their owner's internal invocation.
-- A stale runtime with the old restricted role can no longer install sessions.
commit;
