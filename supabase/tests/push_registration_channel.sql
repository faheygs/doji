begin;
set local statement_timeout='20s';
create function pg_temp.check_push(v boolean,label text) returns void language plpgsql as $$
begin
  if v is distinct from true then raise exception 'FAIL: %',label; end if;
end $$;
grant execute on function pg_temp.check_push(boolean,text) to authenticated;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
select ('99510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'authenticated','authenticated','push-channel-'||n||'@test.invalid',now(),
 jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) from generate_series(1,2)n;
insert into public.profiles(id,username,display_name,timezone)
select ('99510000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'push_channel_'||n,'Synthetic push member','America/Denver' from generate_series(1,2)n;
set local request.jwt.claims='{"sub":"99510000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;
do $$
declare channel text; platform text; result boolean;
begin
  foreach channel in array array[/* configured channels */,'internal','alpha','beta','testflight','preview',null,'',' STAGING '] loop
    foreach platform in array array['ios','android'] loop
      result := public.register_native_push_endpoint_v3('synthetic-channel-'||platform,
        'synthetic-native-'||platform,platform,'production',null,2::smallint,'1.0.14','10',channel);
      perform pg_temp.check_push(result,'registration acknowledged');
    end loop;
  end loop;
  foreach channel in array array['unknown','staging/production',repeat('a',100)] loop
    begin
      perform public.register_native_push_endpoint_v3('synthetic-invalid','synthetic-token','ios','production',null,2::smallint,'1.0.14','10',channel);
      raise exception 'FAIL: invalid channel accepted';
    exception when raise_exception then
      if sqlerrm <> 'Invalid release channel' then raise; end if;
    end;
  end loop;
  begin
    perform public.register_native_push_endpoint_v3('synthetic-invalid','synthetic-token','ios','production',null,2::smallint,'bad version','10','staging');
    raise exception 'FAIL: invalid version accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid app version' then raise; end if; end;
  begin
    perform public.register_native_push_endpoint_v3('synthetic-invalid','synthetic-token','ios','production',null,2::smallint,'1.0.14','bad build','staging');
    raise exception 'FAIL: invalid build accepted';
  exception when raise_exception then if sqlerrm <> 'Invalid native build number' then raise; end if; end;
  begin
    perform public.register_native_push_endpoint_v3('synthetic-invalid','synthetic-token','ios','staging',null,2::smallint,'1.0.14','10','staging');
    raise exception 'FAIL: release channel used as APNs environment';
  exception when raise_exception then if sqlerrm <> 'Invalid push environment' then raise; end if; end;
end $$;
reset role;
select pg_temp.check_push((select count(*)=2 and bool_and(release_channel='staging' and native_build_number='10'
 and notification_contract_version=2 and active) from public.device_push_endpoints
 where user_id='99510000-0000-4000-8000-000000000001'),'metadata normalized; repeats do not duplicate');
select pg_temp.check_push(not has_function_privilege('anon','public.register_native_push_endpoint_v3(text,text,text,text,text,smallint,text,text,text)','EXECUTE'),'anonymous denied');
set local request.jwt.claims='{}';
set local role authenticated;
do $$ begin
  begin
    perform public.register_native_push_endpoint_v3('synthetic-invalid','synthetic-token','ios','production',null,2::smallint,'1.0.14','10','staging');
    raise exception 'FAIL: missing identity accepted';
  exception when raise_exception then if sqlerrm <> 'Authentication required' then raise; end if; end;
end $$;
set local request.jwt.claims='{"sub":"99510000-0000-4000-8000-000000000002","role":"authenticated"}';
select public.register_native_push_endpoint_v3('synthetic-channel-ios','synthetic-native-ios','ios','production',null,2::smallint,'1.0.14','10','staging');
select public.register_native_push_endpoint('synthetic-legacy-one','synthetic-legacy-native-one','ios','sandbox',null);
select public.register_native_push_endpoint_v2('synthetic-legacy-two','synthetic-legacy-native-two','android','production',null,2::smallint);
reset role;
select pg_temp.check_push((select count(*)=1 and bool_and(user_id='99510000-0000-4000-8000-000000000002')
 from public.device_push_endpoints where token='synthetic-native-ios'),'native token ownership transfers atomically');
create temp table retained_push as select * from public.device_push_endpoints;
/* retaining rollback */
select pg_temp.check_push(not exists((select * from retained_push except select * from public.device_push_endpoints)
 union all (select * from public.device_push_endpoints except select * from retained_push)),'rollback retains devices and metadata');
rollback;
select 'PASS: registration channels and isolation';
