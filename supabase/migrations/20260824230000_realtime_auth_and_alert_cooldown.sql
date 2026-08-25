-- Keep Ably authorization to one bounded database round trip and make
-- operational email dedupe a true rolling cooldown rather than a clock-hour
-- bucket. Both entry points expose the narrowest role needed by their caller.

create or replace function public.get_realtime_token_capabilities(
  p_post_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  requested_count integer := coalesce(cardinality(p_post_ids), 0);
  is_admin boolean := false;
  authorized_post_ids jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if requested_count > 64 then
    raise exception 'Too many realtime post subscriptions' using errcode = '22023';
  end if;

  select coalesce(profile.is_admin, false)
  into is_admin
  from public.profiles profile
  where profile.id = uid;

  if requested_count > 0 then
    select coalesce(jsonb_agg(visible.id order by visible.id), '[]'::jsonb)
    into authorized_post_ids
    from (
      select distinct post_id as id
      from unnest(p_post_ids) post_id
      where post_id is not null
        and public.can_view_full_post(post_id, uid)
    ) visible;
  end if;

  return jsonb_build_object(
    'isAdmin', coalesce(is_admin, false),
    'authorizedPostIds', authorized_post_ids
  );
end;
$$;

revoke all on function public.get_realtime_token_capabilities(uuid[])
  from public, anon;
grant execute on function public.get_realtime_token_capabilities(uuid[])
  to authenticated;

create or replace function public.claim_operational_alert_delivery(
  p_issue_family text,
  p_payload jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_family text := left(regexp_replace(
    coalesce(nullif(p_issue_family, ''), 'health-degraded'),
    '[^a-zA-Z0-9:_-]', '-', 'g'
  ), 120);
  receipt_key text;
begin
  -- Serialize only callers for this issue family. The table check then covers
  -- the previous rolling 60 minutes even across a clock-hour boundary.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(normalized_family, 0)
  );

  if exists (
    select 1
    from public.operational_alert_deliveries delivery
    where delivery.issue_family = normalized_family
      and delivery.created_at > clock_timestamp() - interval '60 minutes'
  ) then
    return null;
  end if;

  receipt_key := 'ops:' || gen_random_uuid()::text;
  insert into public.operational_alert_deliveries (
    idempotency_key, issue_family, payload
  ) values (
    receipt_key, normalized_family, coalesce(p_payload, '{}'::jsonb)
  );
  return receipt_key;
end;
$$;

revoke all on function public.claim_operational_alert_delivery(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_operational_alert_delivery(text, jsonb)
  to service_role;

comment on function public.get_realtime_token_capabilities(uuid[]) is
  'Returns the authenticated caller realtime capability inputs in one bounded RPC.';
comment on function public.claim_operational_alert_delivery(text, jsonb) is
  'Claims a true rolling 60-minute operational email cooldown for one issue family.';
