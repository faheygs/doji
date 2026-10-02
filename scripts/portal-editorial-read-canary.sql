-- Bounded production reads only. No editorial command, announcement or decision.
select set_config('request.jwt.claims',jsonb_build_object('sub','ae62514b-d022-4845-9933-2d10689b5105','role','doji_employee','aal','aal2')::text,true);
set local role doji_employee;
do $$ declare a jsonb;s jsonb;v jsonb;begin
 a:=public.get_admin_editorial_page_v1('announcements',1);
 s:=public.get_admin_editorial_page_v1('suggestions',1);
 if a is null or s is null then raise exception 'Missing editorial read';end if;
 if jsonb_array_length(a->'items')>1 or jsonb_array_length(s->'items')>1 then raise exception 'Read exceeded bound';end if;
 if jsonb_array_length(s->'items')>0 then
   v:=public.get_admin_editorial_item_v1('suggestions',(s->'items'->0->>'id')::uuid);
   if v->>'version' is null then raise exception 'Missing item version';end if;
 end if;
end$$;
reset role;
select jsonb_build_object('editorial_bounded_reads',true,'editorial_writes_executed',false) as editorial_checks;
