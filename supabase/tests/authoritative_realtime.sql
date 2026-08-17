begin;

select plan(59);

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
select has_function(
  'public', 'get_pending_reports_snapshot', array['integer'],
  'admin moderation evidence uses a bounded safe snapshot'
);
select unlike(
  pg_get_functiondef('public.block_user(uuid,text)'::regprocedure),
  '%insert into public.reports%',
  'blocking stays separate from explicit moderation reports'
);
select like(
  pg_get_functiondef('public.get_current_doji_state()'::regprocedure),
  '%participant_deadline%',
  'current Doji state exposes the participant-specific authorized deadline'
);
select like(
  pg_get_functiondef('public.submit_poll_vote(uuid,uuid,text,text)'::regprocedure),
  '%participant_deadline%',
  'late poll submissions use the participant-specific deadline'
);
select like(
  pg_get_functiondef('public.complete_doji_with_post(uuid,text,text,text,text,text,text,text)'::regprocedure),
  '%participant_deadline%',
  'late post submissions use the participant-specific deadline'
);
select like(
  pg_get_functiondef('public.close_daily_event(uuid)'::regprocedure),
  '%signup_day_grace is true%',
  'shared close preserves active signup-day grace'
);
select has_table('public', 'command_receipts', 'idempotent command receipts exist');
select has_table('public', 'poll_vote_count_shards', 'poll totals use fixed shards');
select has_table('public', 'post_engagement_shards', 'post totals use fixed shards');
select has_table('public', 'post_reaction_count_shards', 'reaction types use fixed shards');
select has_table('public', 'daily_participant_shards', 'participation uses fixed shards');
select has_function(
  'public', 'continue_domain_event_broadcast', array['uuid', 'uuid', 'uuid'],
  'broadcast fanout is resumable'
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
select like(
  pg_get_functiondef('public.claim_push_delivery(text,uuid,text,text)'::regprocedure),
  '%on conflict (delivery_key) do nothing%',
  'direct push claims are terminal on first insert'
);
select like(
  pg_get_functiondef('public.claim_push_deliveries_batch(uuid,jsonb,text,text)'::regprocedure),
  '%on conflict (delivery_key) do nothing%',
  'broadcast push claims are terminal on first insert'
);
select unlike(
  pg_get_functiondef('public.claim_push_delivery(text,uuid,text,text)'::regprocedure),
  '%attempts =%',
  'direct delivery claims cannot be reopened for retry'
);
select has_function(
  'public', 'get_doji_push_recipients_page', array['uuid', 'uuid', 'integer'],
  'push recipients are keyset paged'
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

select * from finish();
rollback;
