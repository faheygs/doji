-- Close legacy function grants and remove per-row auth evaluation from RLS.
-- Client writes continue through the explicitly granted atomic RPC surface.

alter default privileges in schema public
  revoke execute on functions from public;

do $$
declare
  fn record;
  client_rpc_names constant text[] := array[
    'block_user',
    'blocked_user_count',
    'buy_in_today',
    'clear_notification_history',
    'complete_doji_with_post',
    'create_own_profile',
    'delete_comment',
    'dismiss_notification',
    'edit_comment',
    'equip_shop_item',
    'friend_count',
    'friend_request_count',
    'get_comment_like_voters_page',
    'get_comment_thread_snapshot',
    'get_current_doji_state',
    'get_feed_page_snapshot_v2',
    'get_leaderboard_snapshot',
    'get_locked_feed_previews',
    'get_notification_center_snapshot',
    'get_own_profile',
    'get_pending_reports_snapshot',
    'get_poll_option_voters_page',
    'get_poll_results_summary',
    'get_post_detail',
    'get_post_reaction_summaries',
    'get_post_reaction_voters_page',
    'get_public_profile_view',
    'get_reactions_given_count',
    'get_upcoming_doji_state',
    'list_blocked_users_page',
    'list_friend_requests_page',
    'list_my_friends_page',
    'list_profile_friends_page',
    'mark_notification_center_opened',
    'moderate_report',
    'purchase_shop_item',
    'register_native_push_endpoint',
    'remove_friendship',
    'request_friendship',
    'reserve_doji_media_upload',
    'respond_to_friendship',
    'review_challenge_suggestion',
    'search_mentionable_profiles',
    'search_profiles',
    'set_post_comments_disabled',
    'submit_challenge_suggestion',
    'submit_comment',
    'submit_content_report',
    'submit_poll_vote',
    'sync_notification_center_state',
    'toggle_comment_like',
    'toggle_poll_vote_like',
    'toggle_post_reaction',
    'unblock_user',
    'unregister_push_installation',
    'update_own_profile'
  ];
begin
  for fn in
    select function_row.oid::regprocedure::text as signature
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.prosecdef is true
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated',
      fn.signature
    );
  end loop;

  for fn in
    select function_row.oid::regprocedure::text as signature
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.proname = any(client_rpc_names)
  loop
    execute format(
      'grant execute on function %s to authenticated',
      fn.signature
    );
  end loop;
end;
$$;

-- These legacy helpers did not pin their resolution path. Keeping the fixed
-- path preserves their existing unqualified references without caller input.
alter function public.update_updated_at() set search_path = public, extensions;
alter function public.are_friends(uuid, uuid) set search_path = public, extensions;
alter function public.touch_friendship_accepted_at() set search_path = public, extensions;
alter function public.level_from_xp(integer) set search_path = public, extensions;
alter function public.trg_profile_xp_level() set search_path = public, extensions;
alter function public.shields_for_level(integer) set search_path = public, extensions;
alter function public.trg_award_streak_shields() set search_path = public, extensions;
alter function public.comments_enforce_parent() set search_path = public, extensions;
alter function public.validate_format_post_caption() set search_path = public, extensions;
alter function public.sparks_for_xp(integer) set search_path = public, extensions;
alter function public.sparks_for_level(integer) set search_path = public, extensions;
alter function public.sparks_for_badge_tier(text) set search_path = public, extensions;
alter function public.ensure_demo_user_events(uuid) set search_path = public, extensions;

-- Likes are insert/delete commands. The former ALL policy overlapped the
-- audience read policy and exposed it to roles that never use the app.
drop policy if exists poll_vote_likes_own on public.poll_vote_likes;
drop policy if exists poll_vote_likes_select on public.poll_vote_likes;
create policy poll_vote_likes_select on public.poll_vote_likes
  for select to authenticated using (true);
create policy poll_vote_likes_insert_own on public.poll_vote_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy poll_vote_likes_delete_own on public.poll_vote_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Public feed access requires an authenticated app session. One policy owns
-- visibility and one combined policy owns user/admin deletion.
drop policy if exists posts_read_public on public.posts;
drop policy if exists posts_delete_own on public.posts;
drop policy if exists posts_admin_delete on public.posts;
create policy posts_delete_authorized on public.posts
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.profiles profile
      where profile.id = (select auth.uid()) and profile.is_admin is true
    )
  );

-- Reactions inherit visibility from the post policy; the own-row read was a
-- redundant permissive branch.
drop policy if exists reactions_read_own on public.reactions;
alter policy reactions_read on public.reactions to authenticated;

-- Profile updates are RPC-only. Direct client INSERT/UPDATE grants were
-- revoked by the atomic API migration, so obsolete policies add no access.
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;

-- One SELECT policy covers both a user's occurrence and occurrence metadata
-- needed by an already-visible post.
drop policy if exists user_events_select_via_post on public.user_events;
alter policy user_events_select_own on public.user_events
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.posts post
      where post.user_event_id = user_events.id
    )
  );

-- Cache auth context once per statement instead of once per candidate row.
do $$
declare
  policy_row record;
  optimized_using text;
  optimized_check text;
  alter_sql text;
begin
  for policy_row in
    select
      namespace_row.nspname as schema_name,
      table_row.relname as table_name,
      policy.polname as policy_name,
      pg_get_expr(policy.polqual, policy.polrelid) as using_expression,
      pg_get_expr(policy.polwithcheck, policy.polrelid) as check_expression
    from pg_policy policy
    join pg_class table_row on table_row.oid = policy.polrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
  loop
    optimized_using := policy_row.using_expression;
    optimized_check := policy_row.check_expression;

    if optimized_using is not null then
      optimized_using := regexp_replace(optimized_using, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'gi');
      optimized_using := regexp_replace(optimized_using, '(?<!SELECT )auth\.role\(\)', '(select auth.role())', 'gi');
      optimized_using := regexp_replace(optimized_using, '(?<!SELECT )auth\.jwt\(\)', '(select auth.jwt())', 'gi');
    end if;
    if optimized_check is not null then
      optimized_check := regexp_replace(optimized_check, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'gi');
      optimized_check := regexp_replace(optimized_check, '(?<!SELECT )auth\.role\(\)', '(select auth.role())', 'gi');
      optimized_check := regexp_replace(optimized_check, '(?<!SELECT )auth\.jwt\(\)', '(select auth.jwt())', 'gi');
    end if;

    if optimized_using is distinct from policy_row.using_expression
       or optimized_check is distinct from policy_row.check_expression then
      alter_sql := format(
        'alter policy %I on %I.%I',
        policy_row.policy_name, policy_row.schema_name, policy_row.table_name
      );
      if optimized_using is not null then
        alter_sql := alter_sql || ' using (' || optimized_using || ')';
      end if;
      if optimized_check is not null then
        alter_sql := alter_sql || ' with check (' || optimized_check || ')';
      end if;
      execute alter_sql;
    end if;
  end loop;
end;
$$;

drop index if exists public.reactions_post_user_uniq;
drop index if exists public.idx_profiles_username;
drop index if exists public.reactions_post_user_emoji_idx;
