-- Poll vote likes use the same serialized, idempotent command path as all other
-- social mutations and publish an identifier-only realtime domain event.

create or replace function public.toggle_poll_vote_like(
  p_poll_vote_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_active boolean;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if not exists(select 1 from public.poll_votes where id = p_poll_vote_id) then
    raise exception 'Poll vote not found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_poll_vote_id::text || ':' || uid::text, 0));

  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  if exists(
    select 1 from public.poll_vote_likes
    where poll_vote_id = p_poll_vote_id and user_id = uid
  ) then
    delete from public.poll_vote_likes
    where poll_vote_id = p_poll_vote_id and user_id = uid;
    is_active := false;
  else
    insert into public.poll_vote_likes (poll_vote_id, user_id)
    values (p_poll_vote_id, uid);
    is_active := true;
  end if;

  select count(*)::integer into total
  from public.poll_vote_likes where poll_vote_id = p_poll_vote_id;

  final_result := jsonb_build_object(
    'poll_vote_id', p_poll_vote_id,
    'active', is_active,
    'count', total
  );

  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);

  return final_result;
end;
$$;

revoke all on function public.toggle_poll_vote_like(uuid, text) from public, anon;
grant execute on function public.toggle_poll_vote_like(uuid, text) to authenticated;

create or replace function public.request_friendship(
  p_addressee_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  friendship_row public.friendships%rowtype;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_addressee_id = uid then raise exception 'Cannot add yourself'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(uid::text, p_addressee_id::text) || ':' || greatest(uid::text, p_addressee_id::text), 0)
  );

  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into friendship_row from public.friendships
  where (requester_id = uid and addressee_id = p_addressee_id)
     or (requester_id = p_addressee_id and addressee_id = uid)
  order by created_at desc limit 1 for update;

  if found then
    if friendship_row.status = 'pending'
       and friendship_row.requester_id = p_addressee_id then
      update public.friendships set status = 'accepted', accepted_at = clock_timestamp()
      where id = friendship_row.id returning * into friendship_row;
    elsif friendship_row.status = 'blocked' then
      raise exception 'Friend request unavailable';
    end if;
  else
    if exists(
      select 1 from public.blocks
      where (blocker_id = uid and blocked_id = p_addressee_id)
         or (blocker_id = p_addressee_id and blocked_id = uid)
    ) then
      raise exception 'Friend request unavailable';
    end if;
    insert into public.friendships (requester_id, addressee_id, status)
    values (uid, p_addressee_id, 'pending') returning * into friendship_row;
  end if;

  final_result := to_jsonb(friendship_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.request_friendship(uuid, text) from public, anon;
grant execute on function public.request_friendship(uuid, text) to authenticated;

create or replace function public.respond_to_friendship(
  p_friendship_id uuid,
  p_accept boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  friendship_row public.friendships%rowtype;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_friendship_id::text, 0));

  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into friendship_row from public.friendships
  where id = p_friendship_id and addressee_id = uid for update;
  if not found then raise exception 'Friend request not found'; end if;

  if p_accept then
    update public.friendships set status = 'accepted', accepted_at = clock_timestamp()
    where id = p_friendship_id returning * into friendship_row;
    final_result := to_jsonb(friendship_row);
  else
    delete from public.friendships where id = p_friendship_id;
    final_result := jsonb_build_object('id', p_friendship_id, 'status', 'declined');
  end if;

  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.respond_to_friendship(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_friendship(uuid, boolean, text) to authenticated;

create or replace function public.remove_friendship(
  p_friendship_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_friendship_id::text, 0));
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  delete from public.friendships
  where id = p_friendship_id and (requester_id = uid or addressee_id = uid);
  final_result := jsonb_build_object('id', p_friendship_id, 'removed', true);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.remove_friendship(uuid, text) from public, anon;
grant execute on function public.remove_friendship(uuid, text) to authenticated;

create or replace function public.block_user(
  p_blocked_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  block_id uuid;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_blocked_user_id = uid then raise exception 'Cannot block yourself'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(
    hashtextextended(least(uid::text, p_blocked_user_id::text) || ':' || greatest(uid::text, p_blocked_user_id::text), 0)
  );
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (uid, p_blocked_user_id)
  on conflict (blocker_id, blocked_id) do update set blocked_id = excluded.blocked_id
  returning id into block_id;

  delete from public.friendships
  where (requester_id = uid and addressee_id = p_blocked_user_id)
     or (requester_id = p_blocked_user_id and addressee_id = uid);

  if not exists(
    select 1 from public.reports
    where reporter_id = uid and reported_user_id = p_blocked_user_id and status = 'pending'
  ) then
    insert into public.reports (
      reporter_id, reported_user_id, reason, notes
    ) values (
      uid, p_blocked_user_id, 'other', 'Created automatically when this account was blocked.'
    );
  end if;

  final_result := jsonb_build_object('id', block_id, 'blocked_user_id', p_blocked_user_id);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.block_user(uuid, text) from public, anon;
grant execute on function public.block_user(uuid, text) to authenticated;

create or replace function public.unblock_user(
  p_blocked_user_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_blocked_user_id::text, 0));
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;
  delete from public.blocks where blocker_id = uid and blocked_id = p_blocked_user_id;
  final_result := jsonb_build_object('blocked_user_id', p_blocked_user_id, 'blocked', false);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.unblock_user(uuid, text) from public, anon;
grant execute on function public.unblock_user(uuid, text) to authenticated;

create or replace function public.submit_content_report(
  p_reported_user_id uuid,
  p_post_id uuid,
  p_comment_id uuid,
  p_poll_vote_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  report_row public.reports%rowtype;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_reason not in ('spam', 'inappropriate', 'harassment', 'other') then
    raise exception 'Invalid report reason';
  end if;
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  insert into public.reports (
    reporter_id, reported_user_id, post_id, comment_id, poll_vote_id, reason
  ) values (
    uid, p_reported_user_id, p_post_id, p_comment_id, p_poll_vote_id, p_reason
  ) returning * into report_row;

  final_result := to_jsonb(report_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.submit_content_report(uuid, uuid, uuid, uuid, text, text)
  from public, anon;
grant execute on function public.submit_content_report(uuid, uuid, uuid, uuid, text, text)
  to authenticated;

create or replace function public.moderate_report(
  p_report_id uuid,
  p_action text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  report_row public.reports%rowtype;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id = uid and is_admin = true) then
    raise exception 'Administrator access required';
  end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_action not in ('dismiss', 'remove_content', 'remove_and_ban') then
    raise exception 'Invalid moderation action';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text, 0));
  select receipt.result into prior_result from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into report_row from public.reports where id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;

  if p_action in ('remove_content', 'remove_and_ban') then
    if report_row.post_id is not null then
      delete from public.posts where id = report_row.post_id;
    end if;
    if report_row.comment_id is not null then
      delete from public.comments where id = report_row.comment_id;
    end if;
    if report_row.poll_vote_id is not null then
      delete from public.poll_votes where id = report_row.poll_vote_id;
    end if;
  end if;
  if p_action = 'remove_and_ban' and report_row.reported_user_id is not null then
    update public.profiles set is_banned = true where id = report_row.reported_user_id;
  end if;

  update public.reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end
  where id = p_report_id returning * into report_row;
  final_result := to_jsonb(report_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.moderate_report(uuid, text, text) from public, anon;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;

create or replace function public.publish_poll_vote_like_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vote_id uuid := coalesce(new.poll_vote_id, old.poll_vote_id);
begin
  perform public.enqueue_domain_event(
    'feed:public',
    'poll.vote_like.' || lower(tg_op),
    vote_id,
    jsonb_build_object('version', 1, 'pollVoteId', vote_id),
    null
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_poll_vote_like_change()
  from public, anon, authenticated;

drop trigger if exists publish_poll_vote_like_change on public.poll_vote_likes;
create trigger publish_poll_vote_like_change
after insert or delete on public.poll_vote_likes
for each row execute function public.publish_poll_vote_like_change();

-- Account-scoped changes are sent only to the affected user's private channel.
create or replace function public.publish_account_domain_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
  uid uuid;
  other_uid uuid;
  event_name text;
begin
  if tg_table_name = 'friendships' then
    row_id := coalesce(new.id, old.id);
    uid := coalesce(new.requester_id, old.requester_id);
    other_uid := coalesce(new.addressee_id, old.addressee_id);
    event_name := 'social.friendship.' || lower(tg_op);
  elsif tg_table_name = 'blocks' then
    row_id := coalesce(new.id, old.id);
    uid := coalesce(new.blocker_id, old.blocker_id);
    event_name := 'social.block.' || lower(tg_op);
  elsif tg_table_name = 'challenge_suggestions' then
    row_id := coalesce(new.id, old.id);
    uid := coalesce(new.user_id, old.user_id);
    event_name := 'notification.suggestion.' || lower(tg_op);
  elsif tg_table_name in ('user_badges', 'user_badge_progress') then
    uid := coalesce(new.user_id, old.user_id);
    row_id := uid;
    event_name := 'notification.badge.' || lower(tg_op);
  elsif tg_table_name = 'notification_center_state' then
    uid := coalesce(new.user_id, old.user_id);
    row_id := uid;
    event_name := 'notification.state.' || lower(tg_op);
  else
    uid := coalesce(new.user_id, old.user_id);
    row_id := uid;
    event_name := 'notification.dismissal.' || lower(tg_op);
  end if;

  if uid is not null then
    perform public.enqueue_domain_event(
      'user:' || uid::text || ':events', event_name, row_id,
      jsonb_build_object('version', 1, 'entityId', row_id), null
    );
  end if;

  if other_uid is not null and other_uid is distinct from uid then
    perform public.enqueue_domain_event(
      'user:' || other_uid::text || ':events', event_name, row_id,
      jsonb_build_object('version', 1, 'entityId', row_id), null
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_account_domain_change()
  from public, anon, authenticated;

drop trigger if exists publish_friendship_change on public.friendships;
create trigger publish_friendship_change after insert or update or delete on public.friendships
for each row execute function public.publish_account_domain_change();

drop trigger if exists publish_block_change on public.blocks;
create trigger publish_block_change after insert or delete on public.blocks
for each row execute function public.publish_account_domain_change();

drop trigger if exists publish_suggestion_change on public.challenge_suggestions;
create trigger publish_suggestion_change after insert or update on public.challenge_suggestions
for each row execute function public.publish_account_domain_change();

drop trigger if exists publish_user_badge_change on public.user_badges;
create trigger publish_user_badge_change after insert or update on public.user_badges
for each row execute function public.publish_account_domain_change();

drop trigger if exists publish_user_badge_progress_change on public.user_badge_progress;
create trigger publish_user_badge_progress_change after insert or update on public.user_badge_progress
for each row execute function public.publish_account_domain_change();

drop trigger if exists publish_notification_state_change on public.notification_center_state;
create trigger publish_notification_state_change
after insert or update or delete on public.notification_center_state
for each row execute function public.publish_account_domain_change();

drop trigger if exists publish_notification_dismissal_change on public.notification_dismissals;
create trigger publish_notification_dismissal_change
after insert or update or delete on public.notification_dismissals
for each row execute function public.publish_account_domain_change();

create or replace function public.publish_moderation_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_id uuid := coalesce(new.id, old.id);
begin
  perform public.enqueue_domain_event(
    'moderation:global', 'moderation.report.' || lower(tg_op), report_id,
    jsonb_build_object('version', 1, 'reportId', report_id), null
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_moderation_change()
  from public, anon, authenticated;

drop trigger if exists publish_report_change on public.reports;
create trigger publish_report_change after insert or update on public.reports
for each row execute function public.publish_moderation_change();

-- Public profile and XP changes use narrow global channels. Events contain only
-- identifiers; clients still fetch authorized rows through Postgres RLS.
create or replace function public.publish_public_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := case when tg_table_name = 'profiles'
    then coalesce(new.id, old.id)
    else coalesce(new.user_id, old.user_id)
  end;
begin
  if tg_table_name = 'profiles' then
    perform public.enqueue_domain_event(
      'profiles:global', 'profile.updated', uid,
      jsonb_build_object('version', 1, 'userId', uid), null
    );
  end if;

  perform public.enqueue_domain_event(
    'leaderboard:global', 'leaderboard.updated', uid,
    jsonb_build_object('version', 1, 'userId', uid), null
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;

drop trigger if exists publish_profile_change on public.profiles;
create trigger publish_profile_change
after update of username, display_name, avatar_url, avatar_gradient, xp, level,
  equipped_border_key, equipped_title_key, accent_theme
on public.profiles
for each row execute function public.publish_public_profile_change();

drop trigger if exists publish_weekly_xp_change on public.weekly_xp;
create trigger publish_weekly_xp_change after insert or update or delete on public.weekly_xp
for each row execute function public.publish_public_profile_change();
