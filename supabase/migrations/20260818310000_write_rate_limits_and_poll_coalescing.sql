-- Bound authenticated write bursts per actor at the source of truth. These
-- limits protect the free tier today and remain useful abuse controls after a
-- compute upgrade. Service-owned work has no auth.uid() and is not throttled.

create table if not exists public.api_rate_limit_buckets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  bucket_started_at timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (user_id, action, bucket_started_at)
);

create index if not exists api_rate_limit_buckets_retention_idx
  on public.api_rate_limit_buckets (bucket_started_at);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;

create or replace function public.enforce_api_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer default 60
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  window_seconds integer := least(greatest(p_window_seconds, 10), 3600);
  bucket_start timestamptz;
  observed_count integer;
begin
  if uid is null then return; end if;
  if p_action is null or length(p_action) > 80 or p_limit < 1 then
    raise exception 'Invalid rate-limit contract';
  end if;

  bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / window_seconds) * window_seconds
  );
  insert into public.api_rate_limit_buckets (
    user_id, action, bucket_started_at, request_count
  ) values (uid, p_action, bucket_start, 1)
  on conflict (user_id, action, bucket_started_at) do update
    set request_count = public.api_rate_limit_buckets.request_count + 1
  returning request_count into observed_count;

  if observed_count > p_limit then
    raise exception using
      errcode = 'P0001',
      message = 'Too many requests. Please wait a moment and try again.',
      detail = 'rate_limited:' || p_action,
      hint = 'retry_after_seconds=' || greatest(
        1,
        ceil(extract(epoch from bucket_start + make_interval(secs => window_seconds)
          - clock_timestamp()))::integer
      )::text;
  end if;
end;
$$;

create or replace function public.trg_enforce_write_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enforce_api_rate_limit(
    tg_argv[0],
    tg_argv[1]::integer,
    coalesce(nullif(tg_argv[2], '')::integer, 60)
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists enforce_reaction_write_rate on public.reactions;
create trigger enforce_reaction_write_rate
before insert or update on public.reactions
for each row execute function public.trg_enforce_write_rate_limit('reaction', '120', '60');

drop trigger if exists enforce_comment_write_rate on public.comments;
create trigger enforce_comment_write_rate
before insert or update on public.comments
for each row execute function public.trg_enforce_write_rate_limit('comment', '30', '60');

drop trigger if exists enforce_comment_like_write_rate on public.comment_likes;
create trigger enforce_comment_like_write_rate
before insert on public.comment_likes
for each row execute function public.trg_enforce_write_rate_limit('comment_like', '120', '60');

drop trigger if exists enforce_poll_vote_like_write_rate on public.poll_vote_likes;
create trigger enforce_poll_vote_like_write_rate
before insert on public.poll_vote_likes
for each row execute function public.trg_enforce_write_rate_limit('poll_vote_like', '120', '60');

drop trigger if exists enforce_poll_vote_write_rate on public.poll_votes;
create trigger enforce_poll_vote_write_rate
before insert or update on public.poll_votes
for each row execute function public.trg_enforce_write_rate_limit('poll_vote', '10', '60');

drop trigger if exists enforce_friendship_write_rate on public.friendships;
create trigger enforce_friendship_write_rate
before insert or update on public.friendships
for each row execute function public.trg_enforce_write_rate_limit('friendship', '30', '60');

drop trigger if exists enforce_report_write_rate on public.reports;
create trigger enforce_report_write_rate
before insert on public.reports
for each row execute function public.trg_enforce_write_rate_limit('report', '10', '300');

drop trigger if exists enforce_suggestion_write_rate on public.challenge_suggestions;
create trigger enforce_suggestion_write_rate
before insert on public.challenge_suggestions
for each row execute function public.trg_enforce_write_rate_limit('suggestion', '10', '3600');

revoke all on function public.enforce_api_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.trg_enforce_write_rate_limit()
  from public, anon, authenticated;

-- A shared community poll may receive thousands of votes per second, but an
-- Ably channel and every handset need only the newest invalidation for that
-- second. Override per-vote keys for post-scoped poll events with a time bucket.
create or replace function public.enqueue_domain_event(
  p_topic text,
  p_event_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  effective_key text := p_idempotency_key;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
  effective_available_at timestamptz := clock_timestamp();
begin
  if p_topic like 'post:%' and p_event_type like 'poll.vote.%' then
    effective_key := 'coalesce:post-poll:' || p_topic || ':' || epoch_second::text;
  elsif p_topic = 'doji:global' and p_event_type like 'poll.vote.%' then
    effective_key := 'coalesce:poll:' || coalesce(p_payload ->> 'dailyEventId', 'unknown')
      || ':' || epoch_second::text;
  elsif p_topic = 'profiles:global' then
    effective_key := 'coalesce:profiles:' || p_event_type || ':' || epoch_second::text;
  elsif p_topic = 'leaderboard:global' then
    effective_key := 'coalesce:leaderboard:' || (epoch_second / 5)::text;
    effective_available_at := to_timestamp(((epoch_second / 5) + 1) * 5);
  end if;

  if effective_key like 'coalesce:post:%'
     or effective_key like 'coalesce:post-poll:%'
     or effective_key like 'coalesce:feed-posts:%'
     or effective_key like 'coalesce:poll:%'
     or effective_key like 'coalesce:profiles:%' then
    effective_available_at := date_trunc('second', clock_timestamp()) + interval '1 second';
  end if;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key, available_at
  ) values (
    p_topic, p_event_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb),
    effective_key, effective_available_at
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set
    topic = excluded.topic,
    event_type = excluded.event_type,
    aggregate_id = excluded.aggregate_id,
    payload = excluded.payload
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.enqueue_domain_event(text, text, uuid, jsonb, text)
  from public, anon, authenticated;
