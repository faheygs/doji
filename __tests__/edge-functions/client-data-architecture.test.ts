import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('mobile data architecture', () => {
  it('uses one socket transport and repairs state from Postgres', () => {
    const layout = read('app/(app)/_layout.tsx');
    const realtime = read('hooks/useDomainRealtime.ts');
    expect(layout).toContain('useDomainRealtime(session?.user?.id)');
    expect(layout).not.toContain('useAppRealtime');
    expect(realtime).toContain('subscribeToRealtimeChannel');
    expect(realtime).toContain('reconcileAppQueries');
  });

  it('scopes viewer-sensitive poll caches to the signed-in user', () => {
    const card = read('components/feed/PollResultCard.tsx');
    expect(card).toContain("['pollResults', dailyEventId, feedAudience, userId]");
    expect(card).toContain(
      "['pollVotersDetail', dailyEventId, voterModal?.optionId, feedAudience, userId]",
    );
  });

  it('keeps cached cards correct when comment moderation changes', () => {
    const card = read('components/feed/PostCard.tsx');
    expect(card).toContain('a.comments_disabled !== b.comments_disabled');
  });

  it('does not flash a feed empty state while cold cached data reconciles', () => {
    const feed = read('app/(app)/index.tsx');
    expect(feed).toContain('isFetchedAfterMount: feedFetchedAfterMount');
    expect(feed).toContain('feedFetching && !feedFetchedAfterMount');
    expect(feed).toContain('if (feedError && posts.length === 0)');
    expect(feed).toContain('loading={showInitialFeedSkeleton}');
  });

  it('registers native push endpoints and keeps Expo only as a migration fallback', () => {
    const client = read('lib/pushNotifications.ts');
    const fanout = read('supabase/functions/fanout-doji-push/index.ts');
    const schema = read('supabase/migrations/20260818160000_native_push_endpoints.sql');
    expect(client).toContain('getDevicePushTokenAsync');
    expect(client).toContain("rpc('register_native_push_endpoint'");
    expect(schema).toContain('create table public.device_push_endpoints');
    expect(fanout).toContain('sendApnsMessage');
    expect(fanout).toContain('sendFcmMessage');
    expect(fanout).toContain('expoFallback');
  });

  it('routes engagement to mounted post channels without granting history access', () => {
    const migration = read('supabase/migrations/20260818170000_post_scoped_realtime.sql');
    const token = read('supabase/functions/realtime-token/index.ts');
    expect(migration).toContain("'post:' || post_id::text");
    expect(migration).toContain("effective_available_at := date_trunc('second'");
    expect(token).toContain("capability[`post:${postId}`] = ['subscribe']");
    expect(token).toContain(".from('posts')");
    expect(token).not.toContain("'post:*': ['subscribe']");
    expect(token).not.toContain("['subscribe', 'history']");
    const postHook = read('hooks/usePostRealtimeInvalidation.ts');
    expect(postHook).toContain("{ rewind: '10s' }");
    const client = read('lib/realtimeClient.ts');
    expect(client).toContain('subscriptionCounts');
    expect(client).toContain('.detach()');
    expect(client).toContain('realtime.channels.release(channelName)');
  });

  it('authorizes admin realtime without exposing private profile columns', () => {
    const token = read('supabase/functions/realtime-token/index.ts');
    const profileContract = read(
      'supabase/migrations/20260818090000_profile_privacy_and_age_assurance.sql',
    );
    expect(token).toContain("rpc('is_current_user_admin')");
    expect(token).not.toContain("select('is_admin')");
    expect(profileContract).toContain('create or replace function public.is_current_user_admin()');
  });

  it('keeps authenticated RLS helpers executable after function hardening', () => {
    const grants = read('supabase/migrations/20260818240000_restore_policy_helper_execute.sql');
    expect(grants).toContain('grant execute on function public.can_access_daily_event(uuid, uuid)');
    expect(grants).toContain(
      'grant execute on function public.can_view_full_post(uuid, uuid, uuid, uuid, boolean)',
    );
    expect(grants).toContain('grant execute on function public.is_current_user_admin()');
    expect(grants).toContain('drop policy if exists posts_read_own');
    expect(grants).toContain('drop policy if exists posts_read_friends');
  });
});
