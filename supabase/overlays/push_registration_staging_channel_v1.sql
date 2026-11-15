-- Release identity is metadata, independent of the APNs signing environment.
-- Replace only the reviewed channel allowlist; retain authorization and ACLs.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
do $patch$
declare
  target regprocedure := 'public.register_native_push_endpoint_v3(text,text,text,text,text,smallint,text,text,text)'::regprocedure;
  body text;
  definition text;
  fingerprint text;
begin
  select prosrc, pg_get_functiondef(oid) into body, definition from pg_proc where oid=target;
  fingerprint := md5(replace(body, E'\r\n', E'\n'));
  if fingerprint = '9028ce7a438e38a4b5feab80211c942f' then return; end if;
  if fingerprint <> '3d1d1fe43170cf0c5edd2f33ea4ffe56' then
    raise exception 'Unexpected push registration body; review before installation';
  end if;
  body := replace(body, '''preview'', ''development''', '''preview'', ''development'', ''staging''');
  if md5(replace(body, E'\r\n', E'\n')) <> '9028ce7a438e38a4b5feab80211c942f' then
    raise exception 'Push registration patch did not match reviewed result';
  end if;
  execute replace(definition, (select prosrc from pg_proc where oid=target), body);
end;
$patch$;
commit;
