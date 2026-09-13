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

  it('uses the system camera UI and preserves high-resolution post media', () => {
    const camera = source('app/(app)/camera.tsx');
    const upload = source('utils/upload.ts');
    expect(camera).toContain('ImagePicker.launchCameraAsync');
    expect(camera).toContain('Use phone camera');
    expect(camera).toContain('const pickerQuality = 1');
    expect(camera).not.toContain('<CameraView');
    expect(upload).toContain('width: 2048, quality: 0.92');
  });

  it('keeps Android resizable and edge-to-edge without forcing portrait', () => {
    const config = JSON.parse(source('app.json')) as {
      expo: {
        orientation: string;
        android: { edgeToEdgeEnabled: boolean };
        ios: { infoPlist: { UISupportedInterfaceOrientations: string[] } };
      };
    };
    expect(config.expo.orientation).toBe('default');
    expect(config.expo.android.edgeToEdgeEnabled).toBe(true);
    expect(config.expo.ios.infoPlist.UISupportedInterfaceOrientations).toEqual([
      'UIInterfaceOrientationPortrait',
    ]);
  });

  it('time-scopes new-friend activity and limits leaderboard invalidations', () => {
    const friendship = source(
      'supabase/migrations/20260909223000_friendship_time_scoped_activity.sql',
    );
    const leaderboard = source(
      'supabase/migrations/20260909224000_scope_leaderboard_realtime.sql',
    );
    expect(friendship).toContain('event.completed_at >= friend.accepted_at');
    expect(friendship).toContain('r.created_at >= friend.accepted_at');
    expect(friendship).toContain('c.created_at >= friend.accepted_at');
    expect(leaderboard).toContain('if leaderboard_changed then');
    const leaderboardBlock = leaderboard.slice(leaderboard.indexOf('leaderboard_changed :='));
    expect(leaderboardBlock).not.toContain('old.reactions_given is distinct from new.reactions_given');
  });
});
