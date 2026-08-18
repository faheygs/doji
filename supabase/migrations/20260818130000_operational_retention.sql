-- Operational idempotency and delivery tables are bounded. Business content,
-- moderation evidence, user rewards, and account history are intentionally not
-- removed by this job.

create index if not exists domain_event_outbox_published_retention_idx
  on public.domain_event_outbox (published_at) where published_at is not null;
create index if not exists command_receipts_retention_idx
  on public.command_receipts (created_at);
create index if not exists push_delivery_claims_retention_idx
  on public.push_delivery_claims (claimed_at) where terminal_at is not null;
create index if not exists notification_once_keys_retention_idx
  on public.notification_once_keys (created_at);
create index if not exists notification_dismissals_retention_idx
  on public.notification_dismissals (dismissed_at);

create or replace function public.run_operational_retention_batch(p_limit integer default 5000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_limit integer := least(greatest(coalesce(p_limit, 5000), 100), 10000);
  outbox_count integer := 0;
  receipt_count integer := 0;
  push_count integer := 0;
  once_count integer := 0;
  dismissal_count integer := 0;
  fanout_count integer := 0;
begin
  with doomed as (
    select event.ctid from public.domain_event_outbox event
    where event.published_at < clock_timestamp() - interval '7 days'
    order by event.published_at limit batch_limit
  )
  delete from public.domain_event_outbox event using doomed
  where event.ctid = doomed.ctid;
  get diagnostics outbox_count = row_count;

  with doomed as (
    select receipt.ctid from public.command_receipts receipt
    where receipt.created_at < clock_timestamp() - interval '30 days'
    order by receipt.created_at limit batch_limit
  )
  delete from public.command_receipts receipt using doomed
  where receipt.ctid = doomed.ctid;
  get diagnostics receipt_count = row_count;

  with doomed as (
    select claim.ctid from public.push_delivery_claims claim
    where claim.terminal_at is not null
      and claim.claimed_at < clock_timestamp() - interval '30 days'
    order by claim.claimed_at limit batch_limit
  )
  delete from public.push_delivery_claims claim using doomed
  where claim.ctid = doomed.ctid;
  get diagnostics push_count = row_count;

  with doomed as (
    select once_key.ctid from public.notification_once_keys once_key
    where once_key.created_at < clock_timestamp() - interval '180 days'
    order by once_key.created_at limit batch_limit
  )
  delete from public.notification_once_keys once_key using doomed
  where once_key.ctid = doomed.ctid;
  get diagnostics once_count = row_count;

  with doomed as (
    select dismissal.ctid from public.notification_dismissals dismissal
    where dismissal.dismissed_at < clock_timestamp() - interval '90 days'
    order by dismissal.dismissed_at limit batch_limit
  )
  delete from public.notification_dismissals dismissal using doomed
  where dismissal.ctid = doomed.ctid;
  get diagnostics dismissal_count = row_count;

  with doomed as (
    select shard.ctid
    from public.push_fanout_shards shard
    join public.daily_events event on event.id = shard.daily_event_id
    where shard.status in ('completed', 'expired')
      and coalesce(event.closed_at, event.closes_at, event.fires_at)
          < clock_timestamp() - interval '7 days'
    order by coalesce(event.closed_at, event.closes_at, event.fires_at)
    limit batch_limit
  )
  delete from public.push_fanout_shards shard using doomed
  where shard.ctid = doomed.ctid;
  get diagnostics fanout_count = row_count;

  return jsonb_build_object(
    'outbox', outbox_count,
    'command_receipts', receipt_count,
    'push_claims', push_count,
    'notification_once_keys', once_count,
    'notification_dismissals', dismissal_count,
    'push_fanout_shards', fanout_count,
    'has_more', greatest(outbox_count, receipt_count, push_count, once_count,
      dismissal_count, fanout_count) >= batch_limit
  );
end;
$$;

revoke all on function public.run_operational_retention_batch(integer)
  from public, anon, authenticated;
grant execute on function public.run_operational_retention_batch(integer) to service_role;
