-- Exact retaining inverse: no content, cursor, permission or index is removed.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';
do $patch$
declare
  target regprocedure := 'public.get_feed_page_snapshot_v2(uuid,text,integer,timestamptz,uuid)'::regprocedure;
  body text;
  definition text;
  fingerprint text;
begin
  select prosrc, pg_get_functiondef(oid) into body, definition from pg_proc where oid=target;
  fingerprint := md5(replace(body, E'\r\n', E'\n'));
  if fingerprint = 'd0194984794dd930ee2bf54bd40738f2' then return; end if;
  if fingerprint <> '878b16d7842424bcc421b63673286a0a' then
    raise exception 'Intervening feed reader change; refusing rollback';
  end if;
  body := replace(body, ') post, page.post_created_at, page.post_id', ') post, page.post_created_at');
  body := replace(body, 'jsonb_agg(post order by post_created_at desc, post_id desc)',
    'jsonb_agg(post order by post_created_at desc)');
  if md5(replace(body, E'\r\n', E'\n')) <> 'd0194984794dd930ee2bf54bd40738f2' then
    raise exception 'Feed cursor rollback did not match reviewed original';
  end if;
  execute replace(definition, (select prosrc from pg_proc where oid=target), body);
end;
$patch$;
commit;
