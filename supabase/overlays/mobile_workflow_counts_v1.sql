-- Optional device-reported observations, never authoritative participation/reward evidence.
begin;
create schema mobile_workflow_private;
revoke all on schema mobile_workflow_private from public,anon,authenticated,service_role;
create table mobile_workflow_private.settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 salt uuid not null default gen_random_uuid()
);
insert into mobile_workflow_private.settings(id) values(true);
-- Fixed admission slots bound storage; hash collisions conservatively drop reports.
-- Hashes never enter the aggregate/read projection; no account/content identifier is stored.
create table mobile_workflow_private.admission (
 slot integer primary key check(slot between 0 and 65535), actor_hash text not null,
 batch_hash text not null, accepted_at timestamptz not null
);
create table mobile_workflow_private.hours (
 slot smallint not null check(slot between 0 and 23), hour timestamptz not null,
 platform text not null check(platform in ('ios','android')),
 phase text not null check(phase in ('upload','submit','receipt','feed','profile_read','doji_read','feed_read','social_read','economy_read','avatar_upload')),
 outcome text not null check(outcome in ('started','confirmed','request_failed','rendered')),
 count bigint not null check(count between 1 and 1000000000), capped boolean not null,
 received_at timestamptz not null,
 primary key(slot,platform,phase,outcome),
 check((outcome<>'rendered' or phase='feed') and (phase<>'feed' or outcome<>'confirmed'))
);
alter table mobile_workflow_private.settings enable row level security;
alter table mobile_workflow_private.admission enable row level security;
alter table mobile_workflow_private.hours enable row level security;
revoke all on all tables in schema mobile_workflow_private from public,anon,authenticated,service_role;

create function public.record_mobile_workflow_counts_v1(p_actor uuid,p_batch jsonb)
returns text language plpgsql security definer set search_path='' set lock_timeout='250ms' set statement_timeout='2s' as $$
declare observed timestamptz:=clock_timestamp(); secret_salt uuid; actor_digest text; batch_digest text;
 position integer; accepted mobile_workflow_private.admission%rowtype; row jsonb; bucket timestamptz; hour_slot smallint;
begin
 if p_actor is null or p_batch is null or jsonb_typeof(p_batch)<>'object' or octet_length(p_batch::text)>8192
  or (select array_agg(key order by key) from jsonb_object_keys(p_batch) key) is distinct from array['id','issuedAt','platform','rows']
  or jsonb_typeof(p_batch->'id') is distinct from 'string' or (p_batch->>'id') !~ '^wf:[a-z0-9:-]{10,180}$'
  or jsonb_typeof(p_batch->'issuedAt') is distinct from 'number' or (p_batch->>'issuedAt') !~ '^[0-9]{1,16}$'
  or (p_batch->>'issuedAt')::numeric < extract(epoch from observed)*1000-300000
  or (p_batch->>'issuedAt')::numeric > extract(epoch from observed)*1000+30000
  or jsonb_typeof(p_batch->'platform') is distinct from 'string'
  or p_batch->>'platform' not in ('ios','android') or jsonb_typeof(p_batch->'rows') is distinct from 'array' then
  raise exception using errcode='22023',message='Invalid device observations';end if;
 if jsonb_array_length(p_batch->'rows') not between 1 and 30 then
  raise exception using errcode='22023',message='Invalid device observations';end if;
 for row in select value from jsonb_array_elements(p_batch->'rows') loop
  if jsonb_typeof(row)<>'object'
   or (select array_agg(key order by key) from jsonb_object_keys(row) key) is distinct from array['capped','count','outcome','phase']
   or jsonb_typeof(row->'phase') is distinct from 'string' or jsonb_typeof(row->'outcome') is distinct from 'string'
   or row->>'phase' not in ('upload','submit','receipt','feed','profile_read','doji_read','feed_read','social_read','economy_read','avatar_upload')
   or row->>'outcome' not in ('started','confirmed','request_failed','rendered')
   or (row->>'outcome'='rendered' and row->>'phase'<>'feed') or (row->>'phase'='feed' and row->>'outcome'='confirmed')
   or jsonb_typeof(row->'count') is distinct from 'number' or (row->>'count') !~ '^[0-9]{1,5}$'
   or (row->>'count')::integer not between 1 and 15000 or jsonb_typeof(row->'capped') is distinct from 'boolean' then
   raise exception using errcode='22023',message='Invalid device observations';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p_batch->'rows')) <>
  (select count(distinct (value->>'phase',value->>'outcome')) from jsonb_array_elements(p_batch->'rows')) then
  raise exception using errcode='22023',message='Duplicate device category';end if;
 select salt into secret_salt from mobile_workflow_private.settings where id and enabled for share;
 if not found then return 'disabled';end if;
 actor_digest:=md5(p_actor::text||secret_salt::text);
 batch_digest:=md5(p_batch::text);
 position:=(('x'||substr(actor_digest,1,4))::bit(16)::integer);
 insert into mobile_workflow_private.admission values(position,actor_digest,batch_digest,observed)
 on conflict do nothing;
 if not found then
  select * into accepted from mobile_workflow_private.admission where slot=position for update;
  if accepted.actor_hash=actor_digest and accepted.batch_hash=batch_digest then return 'duplicate';end if;
  if accepted.accepted_at>observed-interval '15 minutes' then return 'limited';end if;
  update mobile_workflow_private.admission set actor_hash=actor_digest,batch_hash=batch_digest,accepted_at=observed where slot=position;
 end if;
 bucket:=date_trunc('hour',observed);hour_slot:=mod(floor(extract(epoch from bucket)/3600)::bigint,24)::smallint;
 -- Stable order prevents reports with different row order from reversing lock order.
 for row in select value from jsonb_array_elements(p_batch->'rows') order by value->>'phase',value->>'outcome' loop
  insert into mobile_workflow_private.hours as h values(hour_slot,bucket,p_batch->>'platform',row->>'phase',row->>'outcome',(row->>'count')::bigint,(row->>'capped')::boolean,observed)
  on conflict(slot,platform,phase,outcome) do update set hour=excluded.hour,
   count=case when h.hour=excluded.hour then least(1000000000,h.count+excluded.count) else excluded.count end,
   capped=excluded.capped or (h.hour=excluded.hour and (h.capped or h.count+excluded.count>1000000000)),received_at=observed;
 end loop;
 return 'accepted';
end$$;

create function public.get_mobile_workflow_counts_v1()
returns jsonb language sql security definer set search_path='' set statement_timeout='2s' as $$
 select jsonb_build_object('source','device_reported','enabled',s.enabled,'checked_at',clock_timestamp(),
  'rows',case when s.enabled then (select coalesce(jsonb_agg(jsonb_build_object('hour',h.hour,'platform',h.platform,
   'phase',h.phase,'outcome',h.outcome,'count',h.count,'capped',h.capped,'received_at',h.received_at)
   order by h.hour,h.platform,h.phase,h.outcome),'[]') from mobile_workflow_private.hours h
   where h.hour>=date_trunc('hour',now())-interval '23 hours') else '[]'::jsonb end)
 from mobile_workflow_private.settings s where id;
$$;
revoke all on function public.record_mobile_workflow_counts_v1(uuid,jsonb),public.get_mobile_workflow_counts_v1() from public,anon,authenticated;
grant execute on function public.record_mobile_workflow_counts_v1(uuid,jsonb),public.get_mobile_workflow_counts_v1() to service_role;
commit;
