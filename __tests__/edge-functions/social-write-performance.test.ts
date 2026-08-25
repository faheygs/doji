import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260817120000_streamline_social_writes.sql'),
  'utf8',
);

describe('interactive social write performance policy', () => {
  it('wakes the relay only for actual inserts and once per transaction', () => {
    expect(sql).toContain('referencing new table as inserted_domain_events');
    expect(sql).toContain("current_setting('doji.outbox_wake_queued', true)");
    expect(sql).toContain("set_config('doji.outbox_wake_queued', '1', true)");
  });

  it('publishes one semantic event for a comment heart', () => {
    expect(sql).toContain("set_config('doji.comment_counter_only', '1', true)");
    expect(sql).toContain("current_setting('doji.comment_counter_only', true) = '1'");
  });

  it('returns the maintained counter instead of scanning all likes', () => {
    const toggleBody = sql.slice(
      sql.indexOf('create or replace function public.toggle_comment_like'),
    );
    expect(toggleBody).toContain('select comment.like_count into total');
    expect(toggleBody).not.toContain('count(*)');
  });

  it('bounds the private social graph before per-friend realtime fanout', () => {
    const friendGraph = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20260818180000_bound_friend_graph.sql'),
      'utf8',
    );
    expect(friendGraph).toContain('first_count >= 500 or second_count >= 500');
    expect(friendGraph).toContain("friendship.status = 'pending'");
    expect(friendGraph).toContain('>= 100');
  });

  it('moves friend graph expansion out of interactive write transactions', () => {
    const fanout = fs.readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20260818210000_async_friend_activity_fanout.sql',
      ),
      'utf8',
    );
    const relay = fs.readFileSync(
      path.join(process.cwd(), 'supabase/functions/relay-domain-events/index.ts'),
      'utf8',
    );
    expect(fanout).toContain("'internal:friend-fanout'");
    expect(fanout).toContain("'fanout.friend_completion'");
    expect(fanout).toContain("'fanout.community_reaction'");
    expect(fanout).toContain("'fanout.community_comment'");
    expect(relay).toContain("group[0].topic === 'internal:friend-fanout'");
    expect(relay).toContain("rpc('process_friend_fanout_event'");
    expect(relay).toContain("'https://main.realtime.ably.net/messages'");
    expect(relay).toContain('MAX_ABLY_BATCH_CHANNELS = 100');
    expect(fanout).toContain('get_friend_fanout_realtime_topics');
    expect(fanout).toContain("'friend-completion:first:' || aggregate_id::text");
    expect(fanout).toContain('on conflict (delivery_key) do nothing');

    const presentationFanout = fs.readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20260818220000_async_profile_badge_fanout.sql',
      ),
      'utf8',
    );
    expect(presentationFanout).toContain("'fanout.profile_presentation'");
    expect(presentationFanout).toContain("'fanout.badge'");
    expect(presentationFanout).toContain("'realtimeOnly', true");
  });

  it('coalesces write bursts into bounded durable outbox alarm pages', () => {
    const worker = fs.readFileSync(
      path.join(process.cwd(), 'infra/doji-orchestrator/src/index.ts'),
      'utf8',
    );
    const config = fs.readFileSync(
      path.join(process.cwd(), 'infra/doji-orchestrator/wrangler.jsonc'),
      'utf8',
    );
    expect(worker).toContain('OUTBOX_MAX_PAGES_PER_ALARM = 8');
    expect(worker).toContain('OUTBOX_WAKE_COALESCE_MS = 250');
    expect(worker).toContain('export class OutboxRelayAlarm');
    expect(worker).toContain("'https://alarm.internal/wake'");
    expect(config).toContain('"name": "OUTBOX_RELAY_ALARM"');
  });

  it('runs push fanout from durable tasks instead of account-limited queues', () => {
    const worker = fs.readFileSync(
      path.join(process.cwd(), 'infra/doji-orchestrator/src/index.ts'),
      'utf8',
    );
    expect(worker).toContain('export class PushFanoutAlarm');
    expect(worker).toContain('PUSH_FANOUT_CONCURRENCY = 8');
    expect(worker).toContain('tasks: PushFanoutTask[]');
    expect(worker).not.toContain('MessageBatch');
  });

  it('routes pushes by user_id and claims every installation independently', () => {
    const endpoints = fs.readFileSync(
      path.join(
        process.cwd(),
        'supabase/migrations/20260818160000_native_push_endpoints.sql',
      ),
      'utf8',
    );
    const relay = fs.readFileSync(
      path.join(process.cwd(), 'supabase/functions/relay-domain-events/index.ts'),
      'utf8',
    );
    expect(endpoints).toContain('claim_push_delivery_targets_batch');
    expect(endpoints).toContain("'installationId', endpoint.installation_id");
    expect(endpoints).toContain('ranked.position > 5');
    expect(relay).toContain('profilesById.set(String(profile.user_id)');
    expect(relay).toContain("endpointKey: `native:${endpoint.installationId}`");
  });
});
