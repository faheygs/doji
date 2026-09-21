-- Serialize claims only per account. Locking the shared announcement row would
-- make a global campaign a hotspot and cause concurrent users to skip it.
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
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

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

revoke all on function public.claim_active_app_announcement() from public;
grant execute on function public.claim_active_app_announcement() to authenticated;
