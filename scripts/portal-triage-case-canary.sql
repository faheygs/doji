-- Invoked only inside a guarded transaction after installing the additive reads.
-- Inspect contract shape, not private content. Roll back probe audit rows.
savepoint case_read_probe;
do $case$
declare item uuid; result jsonb; reports_checked integer:=0; appeals_checked integer:=0;
begin
 perform set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal2"}',true);
 for item in select id from public.reports order by created_at desc limit 3 loop
   set local role doji_employee;
   result:=public.get_admin_report_case_v3(item);
   if result->>'case_contract_version'<>'3' or jsonb_typeof(result#>'{media_manifest,items}')<>'array'
     or jsonb_array_length(result#>'{media_manifest,items}')>3 then raise exception 'Report contract failed';end if;
   reset role; reports_checked:=reports_checked+1;
 end loop;
 for item in select id from public.moderation_appeals order by submitted_at desc limit 3 loop
   set local role doji_employee;
   result:=public.get_admin_appeal_case_v1(item);
   if result->>'case_contract_version'<>'1' or result#>>'{appeal,id}'<>item::text
     or result#>>'{appeal,decision_id}'<>result#>>'{original_decision,id}' then raise exception 'Appeal contract failed';end if;
   reset role; appeals_checked:=appeals_checked+1;
 end loop;
 if reports_checked=0 then raise exception 'No existing report available for case read canary';end if;
 raise notice 'Case contract reads passed: reports %, appeals %',reports_checked,appeals_checked;
end $case$;
rollback to savepoint case_read_probe;
release savepoint case_read_probe;
