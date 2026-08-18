begin;

select plan(117);

select has_table('public', 'domain_event_outbox', 'transactional outbox exists');
select has_column(
  'public', 'domain_event_outbox', 'available_at',
  'outbox supports durable delayed notification delivery'
);
select has_function(
  'public', 'next_domain_event_available_at', array[]::text[],
  'relay can schedule the next one-shot delayed wake'
);
select has_function(
  'public', 'mark_domain_events_realtime_published', array['jsonb'],
  'relay durably separates realtime publication from optional push delivery'
);
select has_table(
  'public', 'notification_once_keys',
  'first reaction and like alerts remain one-time'
);
select has_function(
  'public', 'get_public_profile_view', array['text'],
  'public profile read returns an explicit blocked-view state'
);
select unalike(
  pg_get_functiondef('public.get_public_profile_view(text)'::regprocedure),
  '%''is_admin''%',
  'public profile JSON excludes administrator state'
);
select unalike(
  pg_get_functiondef('public.get_public_profile_view(text)'::regprocedure),
  '%''is_banned''%',
  'public profile JSON excludes ban state'
);
select unalike(
  pg_get_functiondef('public.get_public_profile_view(text)'::regprocedure),
  '%''is_demo_account''%',
  'public profile JSON excludes internal demo state'
);
select has_function(
  'public', 'is_current_user_admin', array[]::text[],
  'private realtime capability checks do not expose administrative profile fields'
);
select has_function(
  'public', 'assert_friend_capacity', array['uuid', 'uuid'],
  'friend-only realtime fanout is bounded by an authoritative graph limit'
);
select has_function(
  'public', 'get_pending_reports_snapshot', array['integer'],
  'admin moderation evidence uses a bounded safe snapshot'
);
select unalike(
  pg_get_functiondef('public.block_user(uuid,text)'::regprocedure),
  '%insert into public.reports%',
  'blocking stays separate from explicit moderation reports'
);
select hasnt_trigger(
  'public', 'blocks', 'trg_block_notify_admin',
  'blocking stays private and does not email the moderation administrator'
);
select hasnt_trigger(
  'public', 'comments', 'comments_reply_push',
  'replies use only the idempotent consolidated notification outbox'
);
select alike(
  pg_get_functiondef('public.get_current_doji_state()'::regprocedure),
  '%participant_deadline%',
  'current Doji state exposes the participant-specific authorized deadline'
);
select alike(
  pg_get_functiondef('public.submit_poll_vote(uuid,uuid,text,text)'::regprocedure),
  '%participant_deadline%',
  'late poll submissions use the participant-specific deadline'
);
select alike(
  pg_get_functiondef('public.complete_doji_with_post(uuid,text,text,text,text,text,text,text)'::regprocedure),
  '%participant_deadline%',
  'late post submissions use the participant-specific deadline'
);
select alike(
  pg_get_functiondef('public.close_daily_event(uuid)'::regprocedure),
  '%signup_day_grace is true%',
  'shared close preserves active signup-day grace'
);
select has_table('public', 'command_receipts', 'idempotent command receipts exist');
select has_table('public', 'poll_vote_count_shards', 'poll totals use fixed shards');
select has_table('public', 'post_engagement_shards', 'post totals use fixed shards');
select has_table('public', 'post_reaction_count_shards', 'reaction types use fixed shards');
select has_table('public', 'daily_participant_shards', 'participation uses fixed shards');
select has_table('public', 'push_fanout_shards', 'push fanout uses fixed durable partitions');
select has_function(
  'public', 'get_doji_push_recipients_shard_page',
  array['uuid', 'smallint', 'uuid', 'integer'],
  'push recipients are keyset paged inside a fixed partition'
);
select has_function(
  'public', 'claim_doji_push_fanout_shard', array['uuid', 'smallint'],
  'push partitions use resumable leases'
);
select unalike(
  pg_get_functiondef('public.activate_daily_event(uuid)'::regprocedure),
  '%insert into public.user_events%',
  'activation does not scan or materialize every account'
);
select unalike(
  pg_get_functiondef('public.begin_daily_event_prelive(uuid)'::regprocedure),
  '%delete from public.posts%',
  'pre-live rollover does not synchronously delete the old feed'
);
select has_function(
  'public', 'claim_push_deliveries_batch', array['uuid', 'jsonb', 'text', 'text'],
  'push idempotency claims are batched'
);
select has_function(
  'public', 'complete_push_deliveries_batch', array['uuid', 'jsonb'],
  'successful push batches are durably completed'
);
select has_column(
  'public', 'push_delivery_claims', 'terminal_at',
  'push claims become terminal before provider handoff'
);
select has_column(
  'public', 'push_delivery_claims', 'outcome',
  'push claims retain provider outcome telemetry'
);
select has_column(
  'public', 'push_delivery_claims', 'provider_ticket_id',
  'push claims retain Expo ticket identifiers'
);
select has_function(
  'public', 'record_push_delivery_results', array['jsonb'],
  'provider outcomes are recorded separately from delivery permission'
);
select alike(
  pg_get_functiondef('public.claim_push_delivery(text,uuid,text,text)'::regprocedure),
  '%on conflict (delivery_key) do nothing%',
  'direct push claims are terminal on first insert'
);
select alike(
  pg_get_functiondef('public.claim_push_deliveries_batch(uuid,jsonb,text,text)'::regprocedure),
  '%on conflict (delivery_key) do nothing%',
  'broadcast push claims are terminal on first insert'
);
select unalike(
  pg_get_functiondef('public.claim_push_delivery(text,uuid,text,text)'::regprocedure),
  '%attempts =%',
  'direct delivery claims cannot be reopened for retry'
);
select has_table('public', 'age_assurances', 'minimum-data age assurance is durable');
select has_table('public', 'media_upload_intents', 'media uploads are server-reserved');
select has_function(
  'public', 'reserve_doji_media_upload',
  array['uuid', 'text', 'text', 'text', 'text'],
  'media reservation is an authenticated occurrence command'
);
select alike(
  pg_get_functiondef('public.complete_doji_with_post(uuid,text,text,text,text,text,text,text)'::regprocedure),
  '%media_upload_intents%',
  'post completion accepts only media reserved for the idempotent command'
);
select has_trigger(
  'public', 'poll_votes', 'poll_vote_insert_trigger',
  'poll writes update a bounded shard'
);
select has_trigger(
  'public', 'user_events', 'daily_participant_shard',
  'completion writes update a bounded shard'
);
select has_function('public', 'get_current_doji_state', array[]::text[], 'server state RPC exists');
select has_column('public', 'daily_events', 'prelive_at', 'daily events track the pre-live phase');
select has_function(
  'public', 'begin_daily_event_prelive', array['uuid'],
  'atomic pre-live transition exists'
);
select has_function(
  'public', 'get_upcoming_doji_state', array[]::text[],
  'safe upcoming Doji read exists'
);
select has_function('public', 'activate_daily_event', array['uuid'], 'atomic activation exists');
select has_function('public', 'close_daily_event', array['uuid'], 'atomic close exists');
select has_function(
  'public', 'submit_poll_vote', array['uuid', 'uuid', 'text', 'text'],
  'atomic poll submission exists'
);
select has_function(
  'public', 'complete_doji_with_post',
  array['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
  'atomic post completion exists'
);
select has_function(
  'public', 'toggle_post_reaction', array['uuid', 'text', 'text'],
  'idempotent reaction command exists'
);
select has_function(
  'public', 'submit_comment', array['uuid', 'text', 'uuid', 'text'],
  'idempotent comment command exists'
);
select has_function(
  'public', 'get_poll_votes_for_feed', array['uuid', 'text'],
  'authoritative audience-scoped poll read exists'
);
select has_function(
  'public', 'publish_private_profile_change', array[]::text[],
  'private wallet and account publisher exists'
);
select has_function(
  'public', 'publish_shop_ownership_change', array[]::text[],
  'shop ownership publisher exists'
);
select has_function(
  'public', 'publish_user_event_change', array[]::text[],
  'user occurrence publisher exists'
);
select has_function(
  'public', 'publish_public_badge_change', array[]::text[],
  'public badge publisher exists'
);
select has_trigger(
  'public', 'profiles', 'publish_private_profile_change',
  'wallet and private profile changes are live'
);
select has_trigger(
  'public', 'user_shop_items', 'publish_shop_ownership_change',
  'store ownership changes are live'
);
select has_trigger(
  'public', 'user_events', 'publish_user_event_change',
  'occurrence state changes are live'
);
select has_trigger(
  'public', 'user_badge_progress', 'publish_public_badge_progress_change',
  'badge progress is publicly live'
);
select has_trigger(
  'public', 'comment_mentions', 'comment_mentions_push',
  'mentions use transactional alerts'
);
select has_trigger(
  'public', 'comments', 'comments_push_notify',
  'comment and reply alerts are installed'
);
select has_trigger(
  'public', 'reactions', 'reactions_push_notify',
  'reaction alerts are installed'
);
select has_trigger(
  'public', 'comment_likes', 'comment_likes_push_notify',
  'comment-like alerts are installed'
);
select has_function(
  'public', 'assert_acceptable_content', array['text'],
  'authoritative UGC filter exists'
);
select has_trigger(
  'public', 'comments', 'reject_objectionable_comments',
  'comments are filtered at the database boundary'
);
select has_trigger(
  'public', 'posts', 'reject_objectionable_posts',
  'post captions are filtered at the database boundary'
);
select has_trigger(
  'public', 'poll_votes', 'reject_objectionable_poll_votes',
  'custom poll answers are filtered at the database boundary'
);
select has_trigger(
  'public', 'challenge_suggestions', 'reject_objectionable_suggestions',
  'challenge suggestions are filtered at the database boundary'
);
select has_trigger(
  'public', 'profiles', 'reject_objectionable_profiles',
  'profile text is filtered at the database boundary'
);
select alike(
  pg_get_functiondef('public.wake_domain_event_relay()'::regprocedure),
  '%outbox_wake_queued%',
  'the relay wake is deduplicated within each transaction'
);
select alike(
  pg_get_triggerdef(
    (
      select oid
      from pg_trigger
      where tgrelid = 'public.domain_event_outbox'::regclass
        and tgname = 'wake_domain_event_relay_after_insert'
        and not tgisinternal
    )
  ),
  '%REFERENCING NEW TABLE AS inserted_domain_events%',
  'the relay wakes only when an outbox row was actually inserted'
);
select alike(
  pg_get_functiondef('public.publish_core_social_change()'::regprocedure),
  '%comment_counter_only%',
  'comment-like counters do not publish duplicate comment events'
);
select unalike(
  pg_get_functiondef('public.toggle_comment_like(uuid,text)'::regprocedure),
  '%count(*)%',
  'comment-like commands return the maintained counter without rescanning likes'
);
select has_function(
  'public', 'delete_stale_committed_media_upload_intents', array['integer'],
  'committed upload reservation bookkeeping has bounded retention'
);
select has_function(
  'public', 'get_doji_push_fanout_health', array['uuid'],
  'partitioned launch progress has a service-only health snapshot'
);
select has_function(
  'public', 'viewer_relationship_status', array['uuid'],
  'paged social sheets derive relationship labels without a full graph download'
);
select has_function(
  'public', 'get_post_reaction_voters_page',
  array['uuid', 'text', 'integer', 'timestamp with time zone', 'uuid'],
  'reaction voters use a keyset-paged relationship-aware snapshot'
);
select has_function(
  'public', 'get_comment_like_voters_page',
  array['uuid', 'integer', 'timestamp with time zone', 'uuid'],
  'comment likes use a keyset-paged relationship-aware snapshot'
);
select has_function(
  'public', 'get_poll_option_voters_page',
  array['uuid', 'uuid', 'text', 'integer', 'timestamp with time zone', 'uuid'],
  'poll voters use a keyset-paged relationship-aware snapshot'
);
select has_function(
  'public', 'get_post_reaction_summaries', array['uuid[]'],
  'profile post hydration aggregates reactions in the database'
);
select has_table(
  'public', 'media_objects_pending_delete',
  'moderated or deleted post media has a durable physical deletion queue'
);
select has_trigger(
  'public', 'posts', 'queue_deleted_post_media',
  'post deletion durably queues its committed storage objects'
);
select has_function(
  'public', 'claim_pending_media_deletions', array['integer'],
  'maintenance can lease physical media deletion work'
);
select has_function(
  'public', 'delete_pending_media_deletions', array['uuid[]'],
  'maintenance acknowledges physical media deletion only after storage succeeds'
);
select has_table(
  'public', 'device_push_endpoints',
  'native push endpoints are private per-installation records'
);
select has_function(
  'public', 'register_native_push_endpoint', array['text', 'text', 'text', 'text', 'text'],
  'clients atomically register native and fallback endpoint identities'
);
select has_function(
  'public', 'get_push_recipients', array['uuid[]'],
  'recipient push routing reads one bounded multi-installation contract'
);
select has_function(
  'public', 'claim_push_delivery_targets_batch',
  array['uuid', 'jsonb', 'text', 'text'],
  'provider handoffs are independently idempotent per installation'
);
select alike(
  pg_get_functiondef('public.get_push_recipients(uuid[])'::regprocedure),
  '%installationId%',
  'push recipient routing includes every bounded active installation'
);
select has_function(
  'public', 'invalidate_expo_push_token', array['uuid', 'text'],
  'single-recipient invalid Expo cleanup cannot clear a transferred token'
);
select has_function(
  'public', 'invalidate_expo_push_tokens', array['text[]'],
  'batch invalid Expo cleanup is an explicit service-only command'
);
select has_function(
  'public', 'unregister_push_installation', array['text', 'text'],
  'sign-out disables only the current installation endpoint'
);
select has_function(
  'public', 'invalidate_native_push_tokens', array['text[]'],
  'provider-invalid native tokens are disabled centrally'
);
select has_function(
  'public', 'list_my_friends_page',
  array['timestamp with time zone', 'uuid', 'integer'],
  'the current user friend list uses stable keyset pagination'
);
select has_function(
  'public', 'list_profile_friends_page', array['uuid', 'uuid', 'integer'],
  'public profile friend lists use stable keyset pagination'
);
select has_function(
  'public', 'list_blocked_users_page',
  array['timestamp with time zone', 'uuid', 'integer'],
  'blocked-account management uses stable keyset pagination'
);
select has_function(
  'public', 'blocked_user_count', array[]::text[],
  'settings reads a constant-size blocked-account count'
);
select has_function(
  'public', 'list_friend_requests_page',
  array['timestamp with time zone', 'uuid', 'integer'],
  'friend requests use stable keyset pagination'
);
select has_function(
  'public', 'friend_request_count', array[]::text[],
  'the friends tab reads a constant-size request count'
);
select has_function(
  'public', 'get_post_detail', array['uuid'],
  'post detail uses an explicit server-owned safe-field contract'
);
select unalike(
  pg_get_functiondef('public.get_leaderboard_snapshot(text,text,integer)'::regprocedure),
  '%profile.is_admin%',
  'leaderboard rows do not expose administrative profile metadata'
);
select unalike(
  pg_get_functiondef('public.get_leaderboard_snapshot(text,text,integer)'::regprocedure),
  '%from public.blocks%',
  'public leaderboard standings remain visible across personal blocks'
);
select function_lang_is(
  'public', 'get_profile_by_username', array['text'], 'plpgsql',
  'legacy profile lookup is retained behind the explicit public/owner contract'
);
select has_function(
  'public', 'enqueue_friend_fanout', array['text', 'uuid', 'jsonb', 'text'],
  'social writes enqueue one durable friend fanout command'
);
select has_function(
  'public', 'process_friend_fanout_event', array['uuid'],
  'the relay expands committed friend fanout work asynchronously'
);
select has_function(
  'public', 'get_friend_fanout_realtime_topics', array['uuid'],
  'friend realtime invalidations use a bounded relay batch contract'
);
select alike(
  pg_get_functiondef('public.trg_user_event_completion_push()'::regprocedure),
  '%enqueue_friend_fanout%',
  'Doji completion does not expand the friend graph in the user transaction'
);
select alike(
  pg_get_functiondef('public.publish_core_social_change()'::regprocedure),
  '%fanout.post_membership%',
  'new post friend-feed membership uses asynchronous fanout'
);
select alike(
  pg_get_functiondef('public.publish_public_profile_change()'::regprocedure),
  '%fanout.profile_%',
  'profile presentation and stats avoid synchronous friend expansion'
);
select alike(
  pg_get_functiondef('public.publish_public_badge_change()'::regprocedure),
  '%fanout.badge%',
  'badge and badge-progress writes avoid synchronous friend expansion'
);
select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.prosecdef is true
      and has_function_privilege('anon', function_row.oid, 'execute')
  ),
  0::bigint,
  'anonymous sessions cannot execute security-definer functions'
);
select is(
  (
    select count(*)
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(function_row.proconfig, array[]::text[])) config
        where config like 'search_path=%'
      )
  ),
  0::bigint,
  'public functions pin their name-resolution path'
);
select is(
  (
    select count(*)
    from pg_class index_row
    join pg_namespace namespace_row on namespace_row.oid = index_row.relnamespace
    where namespace_row.nspname = 'public'
      and index_row.relname in ('idx_profiles_username', 'reactions_post_user_emoji_idx')
  ),
  0::bigint,
  'redundant social indexes do not add duplicate write cost'
);

select * from finish();
rollback;
