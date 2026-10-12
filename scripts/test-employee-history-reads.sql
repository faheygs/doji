-- Inside a synthetic rollback transaction; the harness supplies six sources.
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: expected denial %',label;end$$;
create function pg_temp.employee(n integer,aal text default 'aal2') returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','98000000-0000-4000-8000-'||lpad(n::text,12,'0'),
 'role','doji_employee','aal',aal)::text,true)
$$;
select pg_temp.employee(1);
set local role doji_employee;
select pg_temp.denied('select public.get_admin_personal_work_page_v1()','personal read defaults disabled','55000');
select pg_temp.denied('select public.get_admin_announcement_lifecycle_page_v1()','announcement read defaults disabled','55000');
reset role;
update staff_workflow_private.settings set history_reads_enabled=true;
create function pg_temp.personal_pages(state text,size integer) returns jsonb language plpgsql as $$
declare page jsonb; at timestamptz; key text; keys text[]:='{}'; row jsonb; count integer:=0;begin
 loop
  page:=public.get_admin_personal_work_page_v1('all',state,size,at,key);
  perform pg_temp.ok(jsonb_array_length(page->'items')<=size,'size bound');
  for row in select value from jsonb_array_elements(page->'items') loop
   perform pg_temp.ok(not row->>'key'=any(keys),'unique key');
   perform pg_temp.ok(row->>'assigned_to'=current_setting('request.jwt.claims')::jsonb->>'sub','only current employee');
   perform pg_temp.ok(state='all' or (row->>'work_state'='closed')=(state='completed'),'state before pagination');
   perform pg_temp.ok(row->>'work_state'<>'closed' or row->'due_at'='null','completed has no active SLA');
   keys:=array_append(keys,row->>'key');
  end loop;
  count:=count+1;if count>200 then raise exception 'Cursor did not terminate';end if;
  exit when page->'next_cursor'='null';
  at:=(page#>>'{next_cursor,at}')::timestamptz;key:=page#>>'{next_cursor,key}';
  perform pg_temp.ok(key=keys[cardinality(keys)],'cursor equals actual tail');
 end loop;
 return to_jsonb(keys);
end$$;
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(pg_temp.personal_pages('open',5))=90,'all six open personal sources, tied timestamps');
select pg_temp.ok(jsonb_array_length(pg_temp.personal_pages('completed',5))=90,'all six completed sources, no skipped or duplicated rows');
select pg_temp.ok(jsonb_array_length(pg_temp.personal_pages('all',25))=180,'same personal queue includes history');
select pg_temp.ok(pg_temp.personal_pages('all',5)=pg_temp.personal_pages('all',25),'page size preserves exact global order');
select pg_temp.ok(public.get_admin_personal_work_page_v1()=public.get_admin_personal_work_page_v1('all','open',25),'default excludes done');
select pg_temp.ok(public.get_admin_personal_work_page_v1('external_intake','all')::text not like '%synthetic-volume%','external payload stays private');
select pg_temp.denied($q$select public.get_admin_personal_work_page_v1('all','all',26)$q$,'page bound rejected','22023');
select pg_temp.denied($q$select public.get_admin_personal_work_page_v1('all','all',5,now(),null)$q$,'partial cursor rejected','22023');
select pg_temp.denied($q$select public.get_admin_personal_work_page_v1('all','all',5,'infinity','report:00000000-0000-0000-0000-000000000000')$q$,'infinite cursor rejected','22023');
select pg_temp.denied($q$select public.get_admin_personal_work_page_v1('all',null)$q$,'null state rejected','22023');
select pg_temp.employee(2);
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(public.get_admin_personal_work_page_v1('all','all')->'items') i
 where i->>'kind' not in ('report','appeal','external_intake')),'moderator cannot see business, privacy or ideas');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements_text(pg_temp.personal_pages('all',25)) i
 where right(i,12)::integer%4=0),'restricted reports, appeals and external cases hidden from moderator');
select pg_temp.employee(4);
select pg_temp.ok(public.get_admin_personal_work_page_v1('all','all')->'items'='[]','no other employee assignments leaked to business reviewer');
select pg_temp.denied('select public.get_admin_announcement_lifecycle_page_v1()','business reviewer lacks editorial permission');
select pg_temp.employee(5);
select pg_temp.denied('select public.get_admin_personal_work_page_v1()','disabled employee denied');
select pg_temp.employee(1,'aal1');
select pg_temp.denied('select public.get_admin_personal_work_page_v1()','MFA required');
select pg_temp.employee(1);
reset role;
-- Seven precise lifecycle fixtures, including legacy, exact end and start boundaries.
insert into public.app_announcements(id,title,body,enabled,starts_at,ends_at,created_at)
select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic '||n,'Private full body',n not in(1,5,6),
 case n when 3 then now()+interval '1 day' when 4 then now()-interval '1 day' when 7 then now()+interval '3 days' else now() end,
 case n when 2 then now()+interval '1 hour' when 4 then now() when 7 then now()+interval '4 days' else now()+interval '2 days' end,
 '2026-01-01' from generate_series(1,7) n;
insert into public.admin_announcement_state(announcement_id,state,actor_id)
select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n when 1 then 'draft' when 5 then 'cancelled' else 'published' end,
 '98000000-0000-4000-8000-000000000001' from generate_series(1,6) n;
create function pg_temp.announcement_pages(filter text,size integer) returns jsonb language plpgsql as $$
declare page jsonb; at timestamptz; id uuid; ids text[]:='{}'; row jsonb; count integer:=0;begin
 loop
  page:=public.get_admin_announcement_lifecycle_page_v1(filter,size,at,id);
  perform pg_temp.ok(jsonb_array_length(page->'items')<=size,'announcement size');
  for row in select value from jsonb_array_elements(page->'items') loop
   perform pg_temp.ok(not row->>'id'=any(ids),'announcement unique');
   perform pg_temp.ok(not row ? 'body','list omits full body');
   perform pg_temp.ok(filter='all' or row->>'display_state'=filter or (filter='active' and row->>'display_state' in('draft','live','scheduled')),'lifecycle before limit');
   ids:=array_append(ids,row->>'id');
  end loop;
  count:=count+1;if count>30 then raise exception 'Announcement cursor did not terminate';end if;
  exit when page->'next_cursor'='null';
  at:=(page#>>'{next_cursor,at}')::timestamptz;id:=(page#>>'{next_cursor,id}')::uuid;
 end loop;return to_jsonb(ids);
end$$;
-- Member eligibility and domain rows must remain identical across every read.
create function pg_temp.member_claim() returns jsonb language plpgsql as $$declare result jsonb;begin
 begin
  select to_jsonb(x) into result from public.claim_active_app_announcement() x;
  raise exception using errcode='ZX001',message='Rollback synthetic impression';
 exception when sqlstate 'ZX001' then null;end;
 return result;
end$$;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select set_config('test.member_claim',pg_temp.member_claim()::text,true);
reset role;
select pg_temp.employee(1);
-- Function-name-independent fingerprints also cover existing member eligibility code in harness.
create temp table data_before as select md5(string_agg(value,'|' order by value)) fingerprint from (
 select to_jsonb(a)::text value from public.app_announcements a
 union all select to_jsonb(a)::text from public.admin_announcement_state a
 union all select to_jsonb(a)::text from auth.users a
 union all select to_jsonb(a)::text from public.profiles a
 union all select to_jsonb(a)::text from public.domain_event_outbox a) d;
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('active',1))=4,'active includes draft, live, scheduled and legacy scheduled');
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('expired',1))=1,'exact end boundary is expired');
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('live',1))=1,'exact start is live');
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('scheduled',1))=2,'scheduled includes managed and legacy records');
select pg_temp.ok(pg_temp.announcement_pages('all',1)=pg_temp.announcement_pages('all',25),'all history paging stable for timestamp ties');
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('all',25))=7,'all lifecycle records retained');
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('disabled',1))=1,'disabled differs from cancelled');
select pg_temp.ok(jsonb_array_length(pg_temp.announcement_pages('cancelled',1))=1,'cancelled filter');
select pg_temp.ok(public.get_admin_announcement_lifecycle_page_v1()=public.get_admin_announcement_lifecycle_page_v1('active',25),'active is default');
select pg_temp.denied($q$select public.get_admin_announcement_lifecycle_page_v1('unknown')$q$,'unknown lifecycle rejected','22023');
select pg_temp.denied($q$select public.get_admin_announcement_lifecycle_page_v1('all',26)$q$,'announcement maximum bound','22023');
select pg_temp.denied($q$select public.get_admin_announcement_lifecycle_page_v1('all',5,now(),null)$q$,'announcement partial cursor rejected','22023');
select pg_temp.employee(1,'aal1');
select pg_temp.denied('select public.get_admin_announcement_lifecycle_page_v1()','editorial MFA required');
reset role;
select pg_temp.ok((select fingerprint from data_before)=(select md5(string_agg(value,'|' order by value)) from (
 select to_jsonb(a)::text value from public.app_announcements a
 union all select to_jsonb(a)::text from public.admin_announcement_state a
 union all select to_jsonb(a)::text from auth.users a
 union all select to_jsonb(a)::text from public.profiles a
 union all select to_jsonb(a)::text from public.domain_event_outbox a) d),'reads cause no member, announcement or notification mutations');
select pg_temp.ok(not exists(select 1 from unnest(array['anon','authenticated','service_role','doji_business','doji_employee_application']) r
 where has_function_privilege(r,'public.get_admin_personal_work_page_v1(text,text,integer,timestamptz,text)','execute')
 or has_function_privilege(r,'public.get_admin_announcement_lifecycle_page_v1(text,integer,timestamptz,uuid)','execute')),'only employee role gets direct grants');
set local role authenticated;
select pg_temp.denied('select public.get_admin_personal_work_page_v1()','member cannot invoke personal history');
select pg_temp.denied('select public.get_admin_announcement_lifecycle_page_v1()','member cannot invoke editorial history');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select pg_temp.ok(pg_temp.member_claim()=current_setting('test.member_claim')::jsonb,'member announcement eligibility unchanged across employee reads');
reset role;
update portal_identity_private.realms set enabled=true where realm='employee';
select portal_identity_private.set_principal_state(id,revision,'active','synthetic history bridge test')
 from portal_identity_private.principals where realm='employee';
update portal_identity_private.employee_rpc_settings set enabled=true;
grant doji_employee_application to postgres;
select set_config('test.history.args','{"p_kind":"all","p_state":"completed","p_limit":5,"p_after_at":null,"p_after_key":null}',true);
select set_config('test.lifecycle.args','{"p_filter":"active","p_limit":5,"p_before_at":null,"p_before_id":null}',true);
select set_config('request.jwt.claims','{"synthetic":"prior context"}',true);
set local role doji_employee_application;
select pg_temp.ok(portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','user_history_1','session_history',true,
 'get_admin_personal_work_page_v1',current_setting('test.history.args')::jsonb)->>'scope'='personal_work_v1','verified employee bridge reads completed work');
select pg_temp.ok(portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','user_history_1','session_history',true,
 'get_admin_announcement_lifecycle_page_v1',current_setting('test.lifecycle.args')::jsonb)->>'filter'='active','verified employee bridge reads active announcements');
select pg_temp.ok(current_setting('request.jwt.claims')::jsonb='{"synthetic":"prior context"}','bridge restores prior claims after success');
select pg_temp.denied($q$select portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','user_history_1','session_history',false,
 'get_admin_personal_work_page_v1',current_setting('test.history.args')::jsonb)$q$,'bridge requires verified MFA');
select pg_temp.denied($q$select portal_identity_private.employee_history_rpc_v1('https://wrong.test','employee','user_history_1','session_history',true,
 'get_admin_personal_work_page_v1',current_setting('test.history.args')::jsonb)$q$,'wrong issuer denied');
select pg_temp.denied($q$select portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','unknown','session_history',true,
 'get_admin_personal_work_page_v1',current_setting('test.history.args')::jsonb)$q$,'unknown independent employee denied');
select pg_temp.denied($q$select portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','user_history_1','session_history',true,
 'get_admin_personal_work_page_v1',current_setting('test.history.args')::jsonb||'{"p_filter":"all"}')$q$,'caller cannot broaden personal scope','22023');
select pg_temp.denied($q$select portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','user_history_1','session_history',true,
 'admin_editorial_command_v1','{}')$q$,'read bridge cannot execute commands');
select pg_temp.denied($q$select portal_identity_private.employee_history_rpc_v1('https://employee.test','employee','user_history_1','session_history',true,
 'get_admin_announcement_lifecycle_page_v1',current_setting('test.lifecycle.args')::jsonb||'{"p_limit":26}')$q$,'bridge preserves bounded contract','22023');
select pg_temp.ok(current_setting('request.jwt.claims')::jsonb='{"synthetic":"prior context"}','bridge restores prior claims after read failure');
reset role;
