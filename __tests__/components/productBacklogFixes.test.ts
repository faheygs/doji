import fs from 'node:fs';
import path from 'node:path';

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('staged product backlog regressions', () => {
  it('uses reactions given for both owner and member profile top stats', () => {
    const owner = source('app/(app)/profile/index.tsx');
    const member = source('app/(app)/member/[username].tsx');
    expect(owner).toContain('reactions={reactionsGiven}');
    expect(member).toContain('reactions={profile.reactions_given ?? 0}');
    expect(member).not.toContain('reactions={profile.reactions_received ?? 0}');
  });

  it('optimistically acknowledges friend requests and accepts', () => {
    const profile = source('hooks/useProfile.ts');
    const cache = source('lib/friendshipCache.ts');
    const requests = source('hooks/useFriendRequests.ts');
    const member = source('app/(app)/member/[username].tsx');
    expect(cache).toContain('friendship_status: status');
    expect(cache).toContain("'pending_out'");
    expect(profile).toContain('optimisticallyRequestFriendship');
    expect(requests).toContain("status: 'accepted'");
    expect(requests).toContain("'friends'");
    expect(member).toContain("? 'Requested'");
  });

  it('renders a shared poll skeleton or five challenge-shaped post skeletons', () => {
    const skeleton = source('components/feed/FeedSkeleton.tsx');
    const feed = source('app/(app)/index.tsx');
    expect(skeleton).toContain('const cards = isPoll ? 1 : 5');
    expect(skeleton).toContain("challenge?.poll_kind === 'wyr' ? 2 : 4");
    expect(skeleton).toContain('<PhotoSkeleton');
    expect(skeleton).toContain('<TextSkeleton');
    expect(feed).toContain('<FeedSkeleton challenge={userEvent?.challenge} />');
  });

  it('hosts notification swipe rows in their Android modal gesture root', () => {
    const sheet = source('components/notifications/NotificationSheet.tsx');
    expect(sheet).toContain('GestureHandlerRootView, Swipeable');
    expect(sheet).toContain('<GestureHandlerRootView style={styles.flex} unstable_forceActive>');
    expect(sheet).toContain('onDismissItem?.(key)');
  });

  it('keeps cached feed media covered until the authorized native image displays', () => {
    const feed = source('app/(app)/index.tsx');
    const card = source('components/feed/PostCard.tsx');
    const media = source('hooks/usePostMedia.ts');
    expect(feed).toContain('usePreparedFeedPosts');
    expect(feed).toContain('useStableFeedPresentation(presentationReadyPosts');
    expect(card).toContain('onDisplay={() => setMainMediaReady(true)}');
    expect(card).toContain('!mainMediaReady && styles.mediaHidden');
    expect(card).toContain('<Skeleton height="100%" radius={0} style={styles.mediaSkeleton} />');
    expect(media).toContain('enabled && hasPrivatePostMedia(post)');
  });

  it('records native release identity without dropping support for older endpoint RPCs', () => {
    const push = source('lib/pushNotifications.ts');
    const commands = source('contracts/authenticatedCommands.ts');
    const layout = source('app/_layout.tsx');
    expect(push).toContain("executeCommand('register_native_push_endpoint_v3'");
    expect(push).toContain("executeCommand('register_native_push_endpoint_v2'");
    expect(push).toContain("executeCommand('register_native_push_endpoint'");
    expect(commands).toContain("'register_native_push_endpoint_v3'");
    expect(layout).toContain('...sentryReleaseIdentity()');
  });

  it('uses the system camera UI and preserves the approved 3:4 photo', () => {
    const camera = source('app/(app)/camera.tsx');
    const upload = source('utils/upload.ts');
    const postCard = source('components/feed/PostCard.tsx');
    expect(camera).toContain('ImagePicker.launchCameraAsync');
    expect(camera).toContain('Use phone camera');
    expect(camera).toContain('const pickerQuality = 1');
    expect(camera).not.toContain('<CameraView');
    expect(camera).toContain('setCapturedPhoto(await preparePostImage');
    expect(camera).toContain('source={{ uri: capturedPhoto.uri }}');
    expect(camera).toContain('contentFit="cover"');
    expect(upload).toContain('const POST_IMAGE_WIDTH = 1536');
    expect(upload).toContain('const POST_IMAGE_HEIGHT = 2048');
    expect(upload).toContain('uri: prepared.uri');
    expect(postCard).toMatch(/source=\{mainImageSource\}[\s\S]*?contentFit="cover"/);
  });

  it('keeps Android resizable and edge-to-edge without forcing portrait', () => {
    const config = JSON.parse(source('app.json')) as {
      expo: {
        orientation: string;
        android: Record<string, unknown>;
        ios: { infoPlist: { UISupportedInterfaceOrientations: string[] } };
      };
    };
    expect(config.expo.orientation).toBe('default');
    // Expo SDK 57 follows Android 16's mandatory edge-to-edge behavior and
    // rejects the retired edgeToEdgeEnabled customization.
    expect(config.expo.android).not.toHaveProperty('edgeToEdgeEnabled');
    expect(config.expo.ios.infoPlist.UISupportedInterfaceOrientations).toEqual([
      'UIInterfaceOrientationPortrait',
    ]);
  });

  it('time-scopes new-friend activity and limits leaderboard invalidations', () => {
    const friendship = source(
      'supabase/migrations/20260909223000_friendship_time_scoped_activity.sql',
    );
    const leaderboard = source('supabase/migrations/20260909224000_scope_leaderboard_realtime.sql');
    expect(friendship).toContain('event.completed_at >= friend.accepted_at');
    expect(friendship).toContain('r.created_at >= friend.accepted_at');
    expect(friendship).toContain('c.created_at >= friend.accepted_at');
    expect(leaderboard).toContain('if leaderboard_changed then');
    const leaderboardBlock = leaderboard.slice(leaderboard.indexOf('leaderboard_changed :='));
    expect(leaderboardBlock).not.toContain(
      'old.reactions_given is distinct from new.reactions_given',
    );
  });
});
