-- The client renders a dedicated banned-account screen, but UI state is not a
-- security boundary.  Reject every authenticated content/social/economy write
-- for a banned actor at the table boundary, including calls through older
-- SECURITY DEFINER RPCs.  Deletes remain available so account deletion and
-- privacy cleanup cannot be trapped by the guard.

create or replace function public.reject_banned_actor_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is not null and exists (
    select 1 from public.profiles profile
    where profile.id = uid and profile.is_banned is true
  ) then
    raise exception using
      errcode = '42501',
      message = 'This account is suspended';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_banned_actor_write()
  from public, anon, authenticated;

drop trigger if exists reject_banned_profile_write on public.profiles;
create trigger reject_banned_profile_write
before update on public.profiles
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_user_event_write on public.user_events;
create trigger reject_banned_user_event_write
before insert or update on public.user_events
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_post_write on public.posts;
create trigger reject_banned_post_write
before insert or update on public.posts
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_poll_vote_write on public.poll_votes;
create trigger reject_banned_poll_vote_write
before insert or update on public.poll_votes
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_reaction_write on public.reactions;
create trigger reject_banned_reaction_write
before insert or update on public.reactions
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_comment_write on public.comments;
create trigger reject_banned_comment_write
before insert or update on public.comments
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_comment_like_write on public.comment_likes;
create trigger reject_banned_comment_like_write
before insert or update on public.comment_likes
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_poll_vote_like_write on public.poll_vote_likes;
create trigger reject_banned_poll_vote_like_write
before insert or update on public.poll_vote_likes
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_friendship_write on public.friendships;
create trigger reject_banned_friendship_write
before insert or update on public.friendships
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_block_write on public.blocks;
create trigger reject_banned_block_write
before insert or update on public.blocks
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_report_write on public.reports;
create trigger reject_banned_report_write
before insert or update on public.reports
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_suggestion_write on public.challenge_suggestions;
create trigger reject_banned_suggestion_write
before insert or update on public.challenge_suggestions
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_shop_ownership_write on public.user_shop_items;
create trigger reject_banned_shop_ownership_write
before insert or update on public.user_shop_items
for each row execute function public.reject_banned_actor_write();

drop trigger if exists reject_banned_push_endpoint_write on public.device_push_endpoints;
create trigger reject_banned_push_endpoint_write
before insert or update on public.device_push_endpoints
for each row execute function public.reject_banned_actor_write();

-- Ejecting an abusive account also removes its UGC and active social graph.
-- Reports remain as the moderation audit trail; their content foreign keys use
-- ON DELETE SET NULL.  This is intentionally irreversible moderation action.
create or replace function public.purge_newly_banned_user_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.is_banned is not true and new.is_banned is true then
    delete from public.poll_vote_likes where user_id = new.id;
    delete from public.comment_likes where user_id = new.id;
    delete from public.reactions where user_id = new.id;
    delete from public.comments where user_id = new.id;
    delete from public.poll_votes where user_id = new.id;
    delete from public.posts where user_id = new.id;
    delete from public.friendships
      where requester_id = new.id or addressee_id = new.id;
    delete from public.blocks
      where blocker_id = new.id or blocked_id = new.id;
    delete from public.device_push_endpoints where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.purge_newly_banned_user_content()
  from public, anon, authenticated;

drop trigger if exists purge_newly_banned_user_content on public.profiles;
create trigger purge_newly_banned_user_content
after update of is_banned on public.profiles
for each row execute function public.purge_newly_banned_user_content();
