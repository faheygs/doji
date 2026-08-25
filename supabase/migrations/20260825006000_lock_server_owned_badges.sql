-- Badge ownership is server-controlled. Legacy MVP policies allowed a signed-in
-- client to forge rows in user_badges. Keep badge reads
-- public-to-authenticated, but make every badge write reachable only from trusted
-- database triggers/service-role maintenance.

drop policy if exists "user_badges_insert_own" on public.user_badges;
drop policy if exists "user_badges_delete_own" on public.user_badges;

revoke insert, update, delete, truncate on table public.user_badges
  from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.user_badge_progress
  from public, anon, authenticated;

revoke all on function public.upsert_badge_tier(uuid, text, text)
  from public, anon, authenticated;

comment on function public.upsert_badge_tier(uuid, text, text) is
  'Server-only monotonic badge-tier projection. Called by trusted triggers and maintenance; never by app clients.';
