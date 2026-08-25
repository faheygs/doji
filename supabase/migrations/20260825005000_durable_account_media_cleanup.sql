-- Account deletion must not depend on Storage availability.  The identity is
-- deleted synchronously; this durable intent lets maintenance finish media
-- cleanup after an outage without retaining an authenticated account.

create table if not exists public.account_deletion_cleanup (
  user_id uuid primary key,
  requested_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  claim_token uuid,
  attempts integer not null default 0,
  retry_at timestamptz not null default clock_timestamp(),
  last_error text
);

alter table public.account_deletion_cleanup enable row level security;
revoke all on table public.account_deletion_cleanup from public, anon, authenticated;
grant select, insert, update, delete on table public.account_deletion_cleanup to service_role;

create index if not exists account_deletion_cleanup_retry_idx
  on public.account_deletion_cleanup (retry_at, requested_at)
  where claim_token is null;

create or replace function public.claim_account_deletion_cleanup(
  p_limit integer default 100
)
returns table(user_id uuid, claim_token uuid)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  return query
  with candidates as (
    select cleanup.user_id
    from public.account_deletion_cleanup cleanup
    where cleanup.retry_at <= clock_timestamp()
      and (
        cleanup.claim_token is null
        or cleanup.claimed_at < clock_timestamp() - interval '15 minutes'
      )
      -- Never remove media for an identity whose deletion failed.
      and not exists (
        select 1 from auth.users account where account.id = cleanup.user_id
      )
    order by cleanup.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  )
  update public.account_deletion_cleanup cleanup
  set claim_token = gen_random_uuid(),
      claimed_at = clock_timestamp(),
      attempts = cleanup.attempts + 1
  from candidates
  where cleanup.user_id = candidates.user_id
  returning cleanup.user_id, cleanup.claim_token;
end;
$$;

create or replace function public.finish_account_deletion_cleanup(
  p_user_id uuid,
  p_claim_token uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_error is null then
    delete from public.account_deletion_cleanup cleanup
    where cleanup.user_id = p_user_id
      and cleanup.claim_token = p_claim_token;
  else
    update public.account_deletion_cleanup cleanup
    set claim_token = null,
        claimed_at = null,
        last_error = left(p_error, 2000),
        retry_at = clock_timestamp()
          + make_interval(secs => least(21600, 30 * power(2, least(cleanup.attempts, 9)))::integer)
    where cleanup.user_id = p_user_id
      and cleanup.claim_token = p_claim_token;
  end if;
end;
$$;

revoke all on function public.claim_account_deletion_cleanup(integer)
  from public, anon, authenticated;
revoke all on function public.finish_account_deletion_cleanup(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_account_deletion_cleanup(integer) to service_role;
grant execute on function public.finish_account_deletion_cleanup(uuid, uuid, text) to service_role;
