-- Server-controlled, frequency-capped product announcements.
-- Postgres owns eligibility and receipts; clients never write these tables.

create table if not exists public.app_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 600),
  cta_label text check (cta_label is null or char_length(cta_label) between 1 and 40),
  cta_url text check (cta_url is null or cta_url ~ '^(https://|/\(app\))'),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  enabled boolean not null default false,
  priority integer not null default 0,
  max_impressions_per_user integer not null default 1 check (max_impressions_per_user between 1 and 10),
  min_hours_between_impressions integer not null default 24 check (min_hours_between_impressions between 1 and 720),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table if not exists public.app_announcement_receipts (
  announcement_id uuid not null references public.app_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  impression_count integer not null default 0,
  first_impression_at timestamptz,
  last_impression_at timestamptz,
  dismissed_at timestamptz,
  cta_at timestamptz,
  primary key (announcement_id, user_id)
);

alter table public.app_announcements enable row level security;
alter table public.app_announcement_receipts enable row level security;
revoke all on public.app_announcements from anon, authenticated;
revoke all on public.app_announcement_receipts from anon, authenticated;

create or replace function public.claim_active_app_announcement()
returns table (
  id uuid,
  title text,
  body text,
  cta_label text,
  cta_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_announcement public.app_announcements%rowtype;
begin
  if v_user_id is null then return; end if;

  select announcement.* into v_announcement
  from public.app_announcements announcement
  left join public.app_announcement_receipts receipt
    on receipt.announcement_id = announcement.id and receipt.user_id = v_user_id
  where announcement.enabled
    and announcement.starts_at <= now()
    and (announcement.ends_at is null or announcement.ends_at > now())
    and receipt.dismissed_at is null
    and coalesce(receipt.impression_count, 0) < announcement.max_impressions_per_user
    and (
      receipt.last_impression_at is null
      or receipt.last_impression_at <= now() - make_interval(hours => announcement.min_hours_between_impressions)
    )
  order by announcement.priority desc, announcement.starts_at desc, announcement.id
  for update of announcement skip locked
  limit 1;

  if v_announcement.id is null then return; end if;

  insert into public.app_announcement_receipts (
    announcement_id, user_id, impression_count, first_impression_at, last_impression_at
  ) values (
    v_announcement.id, v_user_id, 1, now(), now()
  )
  on conflict (announcement_id, user_id) do update set
    impression_count = public.app_announcement_receipts.impression_count + 1,
    first_impression_at = coalesce(public.app_announcement_receipts.first_impression_at, now()),
    last_impression_at = now();

  return query select v_announcement.id, v_announcement.title, v_announcement.body,
    v_announcement.cta_label, v_announcement.cta_url;
end;
$$;

create or replace function public.record_app_announcement_action(
  p_announcement_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_action not in ('dismissed', 'cta') then raise exception 'Invalid announcement action'; end if;

  update public.app_announcement_receipts set
    dismissed_at = case when p_action = 'dismissed' then coalesce(dismissed_at, now()) else dismissed_at end,
    cta_at = case when p_action = 'cta' then coalesce(cta_at, now()) else cta_at end
  where announcement_id = p_announcement_id and user_id = auth.uid();
end;
$$;

revoke all on function public.claim_active_app_announcement() from public;
revoke all on function public.record_app_announcement_action(uuid, text) from public;
grant execute on function public.claim_active_app_announcement() to authenticated;
grant execute on function public.record_app_announcement_action(uuid, text) to authenticated;
