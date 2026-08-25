-- Demo mode was removed from the product. Remove its dormant SECURITY DEFINER
-- helper and synthetic content so a fresh or restored production database has
-- no obsolete command surface or hidden seed data.

drop function if exists public.ensure_demo_user_events(uuid);

delete from public.posts post
where coalesce(post.is_demo, false) is true;

delete from public.user_events occurrence
using public.daily_events event, public.challenges challenge
where occurrence.daily_event_id = event.id
  and event.challenge_id = challenge.id
  and coalesce(challenge.is_demo, false) is true;

delete from public.poll_options option_row
using public.challenges challenge
where option_row.challenge_id = challenge.id
  and coalesce(challenge.is_demo, false) is true;

delete from public.daily_events event
using public.challenges challenge
where event.challenge_id = challenge.id
  and coalesce(challenge.is_demo, false) is true;

delete from public.challenges challenge
where coalesce(challenge.is_demo, false) is true;
