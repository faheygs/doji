-- Atomic API contracts for remaining client-side multi-write workflows.
-- Postgres remains the source of truth; realtime messages only prompt clients
-- to reconcile authorized rows after a committed transaction.

create or replace function public.sync_comment_mentions(
  p_comment_id uuid,
  p_body text,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.comments c
    where c.id = p_comment_id and c.user_id = p_actor_id
  ) then
    raise exception 'Comment not found';
  end if;

  -- Remove only mentions that are no longer present/eligible. Keeping unchanged
  -- rows prevents duplicate mention notifications when a comment is edited.
  with parsed as (
    select distinct lower(m[1]) as username
    from regexp_matches(p_body, '@([A-Za-z0-9_]{2,30})', 'g') as m
  ), eligible as (
    select profile.id
    from parsed
    join public.profiles profile on lower(profile.username) = parsed.username
    where profile.id = p_actor_id
       or exists (
         select 1
         from public.friendships friendship
         where friendship.status = 'accepted'
           and (
             (friendship.requester_id = p_actor_id and friendship.addressee_id = profile.id)
             or (friendship.addressee_id = p_actor_id and friendship.requester_id = profile.id)
           )
       )
  )
  delete from public.comment_mentions mention
  where mention.comment_id = p_comment_id
    and mention.mentioned_user_id not in (select id from eligible);

  with parsed as (
    select distinct lower(m[1]) as username
    from regexp_matches(p_body, '@([A-Za-z0-9_]{2,30})', 'g') as m
  ), eligible as (
    select profile.id
    from parsed
    join public.profiles profile on lower(profile.username) = parsed.username
    where profile.id = p_actor_id
       or exists (
         select 1
         from public.friendships friendship
         where friendship.status = 'accepted'
           and (
             (friendship.requester_id = p_actor_id and friendship.addressee_id = profile.id)
             or (friendship.addressee_id = p_actor_id and friendship.requester_id = profile.id)
           )
       )
  )
  insert into public.comment_mentions (comment_id, mentioned_user_id)
  select p_comment_id, id from eligible
  on conflict (comment_id, mentioned_user_id) do nothing;
end;
$$;

revoke all on function public.sync_comment_mentions(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.submit_comment(
  p_post_id uuid,
  p_body text,
  p_parent_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  comment_row public.comments%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if length(trim(p_body)) < 1 or length(trim(p_body)) > 2000 then
    raise exception 'Comment must be between 1 and 2000 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));

  select * into comment_row
  from public.comments
  where idempotency_key = p_idempotency_key and user_id = uid;
  if found then return to_jsonb(comment_row); end if;

  if not exists (
    select 1 from public.posts post
    where post.id = p_post_id and not post.comments_disabled
  ) then
    raise exception 'Comments are not available';
  end if;
  if p_parent_id is not null and not exists (
    select 1 from public.comments parent
    where parent.id = p_parent_id
      and parent.post_id = p_post_id
      and parent.parent_id is null
  ) then
    raise exception 'Reply target not found';
  end if;

  insert into public.comments (post_id, user_id, body, parent_id, idempotency_key)
  values (p_post_id, uid, trim(p_body), p_parent_id, p_idempotency_key)
  returning * into comment_row;

  perform public.sync_comment_mentions(comment_row.id, comment_row.body, uid);
  return to_jsonb(comment_row);
end;
$$;

create or replace function public.edit_comment(
  p_comment_id uuid,
  p_body text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  comment_row public.comments%rowtype;
  saved jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if length(trim(p_body)) < 1 or length(trim(p_body)) > 2000 then
    raise exception 'Comment must be between 1 and 2000 characters';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));

  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  update public.comments
  set body = trim(p_body), body_edited = true, updated_at = now()
  where id = p_comment_id and user_id = uid
  returning * into comment_row;
  if not found then raise exception 'Comment not found'; end if;

  perform public.sync_comment_mentions(comment_row.id, comment_row.body, uid);
  saved := to_jsonb(comment_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;

create or replace function public.delete_comment(
  p_comment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  saved jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  delete from public.comments where id = p_comment_id and user_id = uid;
  if not found then raise exception 'Comment not found'; end if;
  saved := jsonb_build_object('id', p_comment_id, 'deleted', true);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;

create or replace function public.set_post_comments_disabled(
  p_post_id uuid,
  p_disabled boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  saved jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  update public.posts set comments_disabled = p_disabled
  where id = p_post_id and user_id = uid;
  if not found then raise exception 'Post not found'; end if;
  saved := jsonb_build_object('id', p_post_id, 'comments_disabled', p_disabled);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;

revoke all on function public.submit_comment(uuid, text, uuid, text) from public, anon;
revoke all on function public.edit_comment(uuid, text, text) from public, anon;
revoke all on function public.delete_comment(uuid, text) from public, anon;
revoke all on function public.set_post_comments_disabled(uuid, boolean, text) from public, anon;
grant execute on function public.submit_comment(uuid, text, uuid, text) to authenticated;
grant execute on function public.edit_comment(uuid, text, text) to authenticated;
grant execute on function public.delete_comment(uuid, text) to authenticated;
grant execute on function public.set_post_comments_disabled(uuid, boolean, text) to authenticated;

-- Notification state is monotonic. Device and server state merge atomically,
-- and clear/dismiss operations serialize per account so cleared items stay gone.
create or replace function public.sync_notification_center_state(
  p_cleared_at timestamptz,
  p_last_opened_at timestamptz,
  p_dismissals jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  state_row public.notification_center_state%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_dismissals is null or jsonb_typeof(p_dismissals) <> 'object' then raise exception 'Invalid dismissals'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));

  insert into public.notification_center_state (user_id, cleared_at, last_opened_at, updated_at)
  values (uid, p_cleared_at, p_last_opened_at, now())
  on conflict (user_id) do update set
    cleared_at = case
      when public.notification_center_state.cleared_at is null then excluded.cleared_at
      when excluded.cleared_at is null then public.notification_center_state.cleared_at
      else greatest(public.notification_center_state.cleared_at, excluded.cleared_at)
    end,
    last_opened_at = case
      when public.notification_center_state.last_opened_at is null then excluded.last_opened_at
      when excluded.last_opened_at is null then public.notification_center_state.last_opened_at
      else greatest(public.notification_center_state.last_opened_at, excluded.last_opened_at)
    end,
    updated_at = now()
  returning * into state_row;

  insert into public.notification_dismissals (user_id, notification_key, dismissed_at)
  select uid, entry.key, entry.value::timestamptz
  from jsonb_each_text(p_dismissals) entry
  where length(entry.key) between 1 and 500
  on conflict (user_id, notification_key) do update
  set dismissed_at = greatest(public.notification_dismissals.dismissed_at, excluded.dismissed_at);

  return to_jsonb(state_row);
end;
$$;

create or replace function public.mark_notification_center_opened(p_opened_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); state_row public.notification_center_state%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));
  insert into public.notification_center_state (user_id, last_opened_at, updated_at)
  values (uid, p_opened_at, now())
  on conflict (user_id) do update set
    last_opened_at = greatest(public.notification_center_state.last_opened_at, excluded.last_opened_at),
    updated_at = now()
  returning * into state_row;
  return to_jsonb(state_row);
end; $$;

create or replace function public.dismiss_notification(
  p_notification_key text,
  p_dismissed_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_notification_key) not between 1 and 500 then raise exception 'Invalid notification key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));
  insert into public.notification_dismissals (user_id, notification_key, dismissed_at)
  values (uid, p_notification_key, p_dismissed_at)
  on conflict (user_id, notification_key) do update
  set dismissed_at = greatest(public.notification_dismissals.dismissed_at, excluded.dismissed_at);
  return jsonb_build_object('notification_key', p_notification_key, 'dismissed_at', p_dismissed_at);
end; $$;

create or replace function public.clear_notification_history(p_cleared_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); state_row public.notification_center_state%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));
  insert into public.notification_center_state (user_id, cleared_at, updated_at)
  values (uid, p_cleared_at, now())
  on conflict (user_id) do update set
    cleared_at = greatest(public.notification_center_state.cleared_at, excluded.cleared_at),
    updated_at = now()
  returning * into state_row;
  delete from public.notification_dismissals where user_id = uid;
  return to_jsonb(state_row);
end; $$;

revoke all on function public.sync_notification_center_state(timestamptz, timestamptz, jsonb) from public, anon;
revoke all on function public.mark_notification_center_opened(timestamptz) from public, anon;
revoke all on function public.dismiss_notification(text, timestamptz) from public, anon;
revoke all on function public.clear_notification_history(timestamptz) from public, anon;
grant execute on function public.sync_notification_center_state(timestamptz, timestamptz, jsonb) to authenticated;
grant execute on function public.mark_notification_center_opened(timestamptz) to authenticated;
grant execute on function public.dismiss_notification(text, timestamptz) to authenticated;
grant execute on function public.clear_notification_history(timestamptz) to authenticated;

-- Profile writes expose only user-editable columns. Economy, moderation, admin,
-- level, and notification-token fields remain server-owned.
create or replace function public.create_own_profile(
  p_username text,
  p_display_name text,
  p_avatar_gradient text[],
  p_timezone text,
  p_app_theme text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); profile_row public.profiles%rowtype; normalized text := lower(trim(p_username));
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':profile-create', 0));
  select * into profile_row from public.profiles where id = uid;
  if found then return to_jsonb(profile_row); end if;
  if normalized !~ '^[a-z0-9_]{3,30}$' then raise exception 'Invalid username'; end if;

  insert into public.profiles (
    id, username, display_name, avatar_gradient, timezone, app_theme,
    appearance_mode, accent_theme, onboarding_completed_at
  ) values (
    uid, normalized, coalesce(nullif(trim(p_display_name), ''), normalized),
    coalesce(p_avatar_gradient, array['#F97316','#8B5CF6']::text[]),
    coalesce(nullif(trim(p_timezone), ''), 'America/Denver'),
    coalesce(nullif(trim(p_app_theme), ''), 'dark'),
    coalesce(nullif(trim(p_app_theme), ''), 'dark'), 'doji_orange', null
  ) returning * into profile_row;
  return to_jsonb(profile_row);
end; $$;

create or replace function public.update_own_profile(
  p_patch jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); profile_row public.profiles%rowtype; saved jsonb; unknown_keys text[];
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'Invalid profile patch'; end if;
  select array_agg(key) into unknown_keys
  from jsonb_object_keys(p_patch) key
  where key not in (
    'username', 'display_name', 'bio', 'avatar_url', 'notification_preferences',
    'onboarding_completed_at', 'timezone', 'app_theme', 'appearance_mode'
  );
  if unknown_keys is not null then raise exception 'Unsupported profile field'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  update public.profiles set
    username = case when p_patch ? 'username' then lower(trim(p_patch->>'username')) else username end,
    display_name = case when p_patch ? 'display_name' then coalesce(nullif(trim(p_patch->>'display_name'), ''), username) else display_name end,
    bio = case when p_patch ? 'bio' then nullif(trim(p_patch->>'bio'), '') else bio end,
    avatar_url = case when p_patch ? 'avatar_url' then nullif(trim(p_patch->>'avatar_url'), '') else avatar_url end,
    notification_preferences = case
      when p_patch ? 'notification_preferences' and jsonb_typeof(p_patch->'notification_preferences') = 'object'
        then p_patch->'notification_preferences'
      else notification_preferences
    end,
    onboarding_completed_at = case when p_patch ? 'onboarding_completed_at' then (p_patch->>'onboarding_completed_at')::timestamptz else onboarding_completed_at end,
    timezone = case when p_patch ? 'timezone' then coalesce(nullif(trim(p_patch->>'timezone'), ''), timezone) else timezone end,
    app_theme = case when p_patch ? 'app_theme' then coalesce(nullif(trim(p_patch->>'app_theme'), ''), app_theme) else app_theme end,
    appearance_mode = case when p_patch ? 'appearance_mode' then coalesce(nullif(trim(p_patch->>'appearance_mode'), ''), appearance_mode) else appearance_mode end
  where id = uid returning * into profile_row;
  if not found then raise exception 'Profile not found'; end if;
  saved := to_jsonb(profile_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end; $$;

revoke all on function public.create_own_profile(text, text, text[], text, text) from public, anon;
revoke all on function public.update_own_profile(jsonb, text) from public, anon;
grant execute on function public.create_own_profile(text, text, text[], text, text) to authenticated;
grant execute on function public.update_own_profile(jsonb, text) to authenticated;

-- Suggestion submission/review are single transactions. Approval can no longer
-- leave an orphan challenge or partially-created poll options behind.
create or replace function public.submit_challenge_suggestion(
  p_kind text,
  p_body text,
  p_body_hash text,
  p_options jsonb,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); suggestion_row public.challenge_suggestions%rowtype; saved jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_kind not in ('poll','wyr','question','photo_idea','format_question') then raise exception 'Invalid suggestion kind'; end if;
  if length(trim(p_body)) < 8 or length(trim(p_body)) > 2000 then raise exception 'Invalid suggestion'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;
  insert into public.challenge_suggestions (user_id, kind, body, body_hash, options)
  values (uid, p_kind, trim(p_body), p_body_hash, coalesce(p_options, '[]'::jsonb))
  returning * into suggestion_row;
  saved := to_jsonb(suggestion_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end; $$;

create or replace function public.review_challenge_suggestion(
  p_suggestion_id uuid,
  p_status text,
  p_admin_note text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); suggestion_row public.challenge_suggestions%rowtype;
  v_challenge_id uuid; saved jsonb; challenge_type text; challenge_category text;
  needs_photo boolean; needs_text boolean; answer_rule jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = uid and is_admin) then raise exception 'Admin access required'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  select * into suggestion_row from public.challenge_suggestions
  where id = p_suggestion_id for update;
  if not found then raise exception 'Suggestion not found'; end if;
  if suggestion_row.status <> 'pending' then raise exception 'Suggestion was already reviewed'; end if;

  if p_status = 'approved' then
    if suggestion_row.kind in ('poll','wyr') then
      if jsonb_typeof(suggestion_row.options) <> 'array' or jsonb_array_length(suggestion_row.options) < 2 then
        raise exception 'Suggestion is missing poll options';
      end if;
      challenge_type := 'poll'; challenge_category := 'social'; needs_photo := false; needs_text := false;
    elsif suggestion_row.kind = 'photo_idea' then
      challenge_type := 'photo'; challenge_category := 'creative'; needs_photo := true; needs_text := false;
    elsif suggestion_row.kind = 'format_question' then
      challenge_type := 'format'; challenge_category := 'mental'; needs_photo := false; needs_text := true;
      answer_rule := suggestion_row.options->'answer_rule';
      if answer_rule is null or jsonb_typeof(answer_rule) <> 'object' then raise exception 'Suggestion is missing an answer rule'; end if;
    else
      challenge_type := 'task'; challenge_category := 'mental'; needs_photo := false; needs_text := true;
    end if;

    insert into public.challenges (
      title, description, type, category, difficulty, xp_reward,
      requires_photo, requires_video, requires_text, answer_rule,
      is_active, is_demo, schedule_count, emoji, participant_count
    ) values (
      left(suggestion_row.body, 200), suggestion_row.body, challenge_type, challenge_category,
      2, 50, needs_photo, false, needs_text, answer_rule, true, false, 0, null, 0
    ) returning id into v_challenge_id;

    if suggestion_row.kind in ('poll','wyr') then
      insert into public.poll_options (challenge_id, text, position, vote_count)
      select v_challenge_id, left(value, 200), (ordinality - 1)::integer, 0
      from jsonb_array_elements_text(suggestion_row.options) with ordinality;
    end if;
  end if;

  update public.challenge_suggestions set
    status = p_status,
    admin_note = nullif(trim(p_admin_note), ''),
    reviewed_at = now(),
    reviewed_by = uid,
    selected_at = case when p_status = 'approved' then now() else selected_at end
  where id = p_suggestion_id
  returning * into suggestion_row;

  saved := to_jsonb(suggestion_row) || jsonb_build_object('challenge_id', v_challenge_id);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end; $$;

revoke all on function public.submit_challenge_suggestion(text, text, text, jsonb, text) from public, anon;
revoke all on function public.review_challenge_suggestion(uuid, text, text, text) from public, anon;
grant execute on function public.submit_challenge_suggestion(text, text, text, jsonb, text) to authenticated;
grant execute on function public.review_challenge_suggestion(uuid, text, text, text) to authenticated;

-- Once callers use commands, clients no longer need direct write grants.
revoke insert, update on public.profiles from authenticated;
revoke update, delete on public.comments from authenticated;
revoke insert, delete on public.comment_mentions from authenticated;
revoke update on public.posts from authenticated;
revoke insert, update on public.challenge_suggestions from authenticated;
revoke insert, delete on public.challenges from authenticated;
revoke insert, delete on public.poll_options from authenticated;
revoke insert, update, delete on public.notification_center_state from authenticated;
revoke insert, update, delete on public.notification_dismissals from authenticated;

-- Read-path indexes aligned with occurrence-scoped feed and realtime queries.
create index if not exists user_events_daily_event_user_idx
  on public.user_events (daily_event_id, user_id);
create index if not exists poll_votes_user_event_created_idx
  on public.poll_votes (user_event_id, created_at desc);
create index if not exists posts_daily_event_created_idx
  on public.posts (daily_event_id, created_at desc);
create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at);
create index if not exists friendships_accepted_requester_idx
  on public.friendships (requester_id, addressee_id) where status = 'accepted';
create index if not exists friendships_accepted_addressee_idx
  on public.friendships (addressee_id, requester_id) where status = 'accepted';

-- Fan out a social change with one outbox INSERT statement. The previous row
-- loop called enqueue once per friend, which also woke the relay once per
-- friend. This produces the same recipient topics and a single relay wakeup.
create or replace function public.publish_core_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
  v_post_id uuid;
  owner_id uuid;
  post_visibility text;
  event_name text;
  event_payload jsonb;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;
  event_name := case tg_table_name
    when 'posts' then 'feed.post.' || lower(tg_op)
    when 'reactions' then 'feed.reaction.' || lower(tg_op)
    when 'comments' then 'feed.comment.' || lower(tg_op)
    when 'comment_likes' then 'feed.comment_like.' || lower(tg_op)
    else 'feed.updated'
  end;

  if tg_table_name = 'posts' then
    v_post_id := row_id;
    if tg_op = 'DELETE' then
      owner_id := old.user_id; post_visibility := old.visibility;
    else
      owner_id := new.user_id; post_visibility := new.visibility;
    end if;
  elsif tg_table_name = 'reactions' then
    v_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  elsif tg_table_name = 'comments' then
    v_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  elsif tg_table_name = 'comment_likes' then
    select comment.post_id into v_post_id
    from public.comments comment
    where comment.id = case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;
  end if;

  if owner_id is null and v_post_id is not null then
    select post.user_id, post.visibility into owner_id, post_visibility
    from public.posts post where post.id = v_post_id;
  end if;
  if owner_id is null then return coalesce(new, old); end if;

  event_payload := jsonb_build_object(
    'version', 1, 'postId', v_post_id, 'entityId', row_id
  );

  insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
  select distinct recipient.topic, event_name, row_id, event_payload
  from (
    select 'feed:public'::text as topic where post_visibility = 'public'
    union all
    select 'user:' || owner_id::text || ':events'
    union all
    select 'user:' ||
      (case when friendship.requester_id = owner_id
            then friendship.addressee_id else friendship.requester_id end)::text ||
      ':events'
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = owner_id or friendship.addressee_id = owner_id)
  ) recipient;

  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_core_social_change() from public, anon, authenticated;
