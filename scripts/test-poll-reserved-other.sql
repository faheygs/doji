-- Synthetic offline fixtures only; caller supplies the editorial fixture and transaction.
reset role;
select set_config('request.jwt.claims','{}',true);
create function pg_temp.poll_command(id uuid,version text,key text) returns jsonb language plpgsql as $$
declare result jsonb;
begin
 if current_setting('test.poll_bridge',true)='yes' then
  set local role doji_employee_application;
  result:=portal_identity_private.employee_rpc_v1('https://employee.test/','employee','user_test','session_test',true,
   'admin_editorial_command_v1',jsonb_build_object('p_kind','suggestions','p_action','approved','p_id',id,
   'p_version',version,'p_input','{}'::jsonb,'p_reason','Synthetic reserved choice review','p_idempotency_key',key));
 else
  set local role doji_employee;
  result:=public.admin_editorial_command_v1('suggestions','approved',id,version,'{}','Synthetic reserved choice review',key);
 end if;
 reset role;
 return result;
exception when others then reset role; raise;
end$$;
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,options)
 select ('a5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,current_setting('test.member')::uuid,
 case when n=4 then 'wyr' else 'poll' end,'Synthetic poll '||n,'reserved-other-'||n,options
 from (values
 (1,'["Basketball","Football","Baseball","Hockey","Soccer","Other"]'::jsonb),
 (2,jsonb_build_array(' OTHER ', 'Tea', E'\tOtHeR\n', 'Coffee', chr(160)||'other'||chr(65279))),
 (3,'["Help other people","Other ideas","Others"]'::jsonb),
 (4,'["Other","Tea"]'::jsonb),
 (5,'["Tea","Other"]'::jsonb),
 (6,'["Other"," other "]'::jsonb),
 (7,'["Tea","Coffee"]'::jsonb)
 ) fixtures(n,options);
create temp table poll_original as select id,options from public.challenge_suggestions where body_hash like 'reserved-other-%';
select set_config('request.jwt.claims',current_setting('test.claims'),true);
do $$<<poll_block>>declare n integer; id uuid; v text; a jsonb; b jsonb; before_counts jsonb; after_counts jsonb; begin
 for n in 1..7 loop
  id:=('a5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
  select md5(to_jsonb(s)::text) into v from public.challenge_suggestions s where s.id=poll_block.id;
  if n in (5,6) then
   select jsonb_build_array((select count(*) from public.challenges),(select count(*) from public.poll_options),
    (select count(*) from public.admin_audit_log),(select count(*) from public.admin_employee_command_receipts),
    (select count(*) from public.domain_event_outbox),(select count(*) from public.spark_ledger)) into before_counts;
   begin
    perform pg_temp.poll_command(id,v,'reserved-other-'||n);
    raise exception 'FAIL: insufficient poll accepted';
   exception when invalid_parameter_value then
    if sqlerrm not like 'Poll needs at least two choices%' then raise; end if;
   end;
   select jsonb_build_array((select count(*) from public.challenges),(select count(*) from public.poll_options),
    (select count(*) from public.admin_audit_log),(select count(*) from public.admin_employee_command_receipts),
    (select count(*) from public.domain_event_outbox),(select count(*) from public.spark_ledger)) into after_counts;
   if before_counts<>after_counts or (select status from public.challenge_suggestions s where s.id=poll_block.id)<>'pending' then
    raise exception 'FAIL: invalid poll left effects'; end if;
  else
   a:=pg_temp.poll_command(id,v,'reserved-other-'||n);
   b:=pg_temp.poll_command(id,v,'reserved-other-'||n);
   if a<>b then raise exception 'FAIL: approval replay changed'; end if;
  end if;
 end loop;
end$$;
-- Exact ordered choices, contiguous positions, one automatic write-in for poll, none for WYR.
do $$declare row record; actual jsonb; positions jsonb; begin
 for row in select * from (values
  (1,'["Basketball","Football","Baseball","Hockey","Soccer","Other"]'::jsonb,'[0,1,2,3,4,99]'::jsonb,1),
  (2,'["Tea","Coffee","Other"]'::jsonb,'[0,1,99]'::jsonb,1),
  (3,'["Help other people","Other ideas","Others","Other"]'::jsonb,'[0,1,2,99]'::jsonb,1),
  (4,'["Other","Tea"]'::jsonb,'[0,1]'::jsonb,0),
  (7,'["Tea","Coffee","Other"]'::jsonb,'[0,1,99]'::jsonb,1)
 ) expected(n,choices,positions,other_count) loop
  select jsonb_agg(o.text order by o.position),jsonb_agg(o.position order by o.position) into actual,positions
  from public.poll_options o join public.admin_suggestion_reviews r on r.challenge_id=o.challenge_id
  where r.suggestion_id=('a5000000-0000-4000-8000-'||lpad(row.n::text,12,'0'))::uuid;
  if actual<>row.choices or positions<>row.positions or
   (select count(*) from public.poll_options o join public.admin_suggestion_reviews r on r.challenge_id=o.challenge_id
    where r.suggestion_id=('a5000000-0000-4000-8000-'||lpad(row.n::text,12,'0'))::uuid and o.is_other)<>row.other_count then
   raise exception 'FAIL: choice mapping %',row.n; end if;
 end loop;
 if exists(select 1 from poll_original p join public.challenge_suggestions s using(id) where p.options<>s.options) then
  raise exception 'FAIL: original submission changed'; end if;
end$$;
select 'PASS: reserved Other, whitespace, phrases, WYR, minimum choices, atomic failure, replay, order and original submission';
