-- Rate-limit buckets are operational data, not user history. Remove old
-- windows in bounded batches so protection cannot become unbounded storage.

create or replace function public.delete_expired_api_rate_limit_buckets(
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
  batch_limit integer := least(greatest(coalesce(p_limit, 5000), 100), 10000);
begin
  with doomed as (
    select bucket.ctid
    from public.api_rate_limit_buckets bucket
    where bucket.bucket_started_at < clock_timestamp() - interval '2 days'
    order by bucket.bucket_started_at
    limit batch_limit
  )
  delete from public.api_rate_limit_buckets bucket using doomed
  where bucket.ctid = doomed.ctid;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_expired_api_rate_limit_buckets(integer)
  from public, anon, authenticated;
grant execute on function public.delete_expired_api_rate_limit_buckets(integer)
  to service_role;
