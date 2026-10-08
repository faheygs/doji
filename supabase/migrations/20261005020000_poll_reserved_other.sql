-- Normalize only newly approved general polls. Preserve original submissions,
-- existing challenge options, permissions, idempotency and all review effects.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $patch$
declare
  target regprocedure := 'public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)'::regprocedure;
  definition text := pg_get_functiondef(target);
  old_parts text[] := array[
    'needs_photo boolean:=false; needs_text boolean:=true; rule jsonb;',
    'challenge_type:=''poll''; category:=''social''; needs_text:=false;',
    'select challenge_id,value,(ordinality-1)::int,0,false from jsonb_array_elements_text(s.options) with ordinality;'
  ];
  new_parts text[] := array[
    'needs_photo boolean:=false; needs_text boolean:=true; rule jsonb; approval_options jsonb;',
    $replacement$-- Match JavaScript trim whitespace; only the exact reserved label is removed.
        approval_options:=s.options;
        if s.kind='poll' then
          select coalesce(jsonb_agg(value order by ordinality),'[]'::jsonb) into approval_options
          from jsonb_array_elements_text(s.options) with ordinality
          where lower(btrim(value,U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))<>'other';
          if jsonb_array_length(approval_options)<2 then
            raise exception using errcode='22023',message='Poll needs at least two choices besides the automatic Other option';
          end if;
        end if;
        challenge_type:='poll'; category:='social'; needs_text:=false;$replacement$,
    'select challenge_id,value,(ordinality-1)::int,0,false from jsonb_array_elements_text(approval_options) with ordinality;'
  ];
  i integer;
begin
  -- Fail closed if the target has drifted or this patch has already been applied.
  for i in 1..array_length(old_parts,1) loop
    if (length(definition)-length(replace(definition,old_parts[i],'')))/length(old_parts[i])<>1 then
      raise exception 'Poll approval patch target mismatch at anchor %',i;
    end if;
    definition:=replace(definition,old_parts[i],new_parts[i]);
  end loop;
  execute definition;
end $patch$;
commit;
