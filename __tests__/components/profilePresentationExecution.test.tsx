import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, Modal, Text as NativeText } from 'react-native';
import { Image } from 'expo-image';
import { lightColors, darkColors } from '../../constants/theme';
import { ProfileStats } from '../../components/profile/ProfileStats';
import {
  ProfileHeroRow,
  ProfileStatChip,
  ProfileStatsStrip,
  ProfileStreakPair,
} from '../../components/profile/ProfileSections';
import { ProfilePostsGrid } from '../../components/profile/ProfilePostsGrid';
import { ProfileCurrentPost } from '../../components/profile/ProfileCurrentPost';
import { ProfileManageMenu } from '../../components/profile/ProfileManageMenu';
import { SubmissionCard } from '../../components/profile/SubmissionCard';
import { ProfileSubmissions } from '../../components/profile/ProfileSubmissions';
import { Skeleton } from '../../components/ui/Skeleton';
import { BORDER_CATALOG, TITLE_CATALOG } from '../../lib/cosmetics';
import { postDetailHref } from '../../lib/routes';
import type { ChallengeSuggestion, Post, Profile } from '../../types/database';

let mockColors = lightColors;
let mockMedia: { photo_url: string | null; front_photo_url: string | null };
const mockRouter = { push: jest.fn() };
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/profile',
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../hooks/usePostMedia', () => ({ usePostMedia: () => mockMedia }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
// No Supabase client is needed by the pure suggestion formatting functions.
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
const profile = {
  id: 'synthetic',
  avatar_url: null,
  username: 'synthetic',
  display_name: 'Synthetic Member',
  bio: ' A private test bio ',
  level: 3,
  equipped_border_key: null,
  equipped_title_key: null,
  current_streak: 2,
  longest_streak: 8,
  total_completions: 10,
  total_missed: 2,
} as Profile;
const post = (overrides: Partial<Post> = {}): Post =>
  ({
    id: 'post-1',
    photo_url: null,
    front_photo_url: null,
    caption: 'A response',
    ...overrides,
  }) as Post;
const suggestion = (overrides: Partial<ChallengeSuggestion> = {}): ChallengeSuggestion => ({
  id: 'idea-1',
  user_id: 'synthetic',
  kind: 'photo',
  body: 'Show a sunset',
  body_hash: '',
  options: null,
  status: 'pending',
  admin_note: null,
  selected_at: null,
  reviewed_at: null,
  reviewed_by: null,
  created_at: '2026-09-01T00:00:00Z',
  ...overrides,
});
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockColors = lightColors;
  mockMedia = { photo_url: null, front_photo_url: null };
});
afterEach(() => jest.useRealTimers());

describe.each(['light', 'dark'])('%s profile content', (mode) => {
  beforeEach(() => {
    mockColors = mode === 'dark' ? darkColors : lightColors;
  });
  it.each([0, 40, 41, 70, 71, 100])(
    'colors completion rate %s without changing values',
    (completionRate) => {
      const ui = render(<ProfileStats profile={profile} completionRate={completionRate} />);
      const expected =
        completionRate > 70
          ? mockColors.success
          : completionRate > 40
            ? mockColors.warning
            : mockColors.textSecondary;
      expect(ui.getByText(`${completionRate}%`)).toHaveStyle({ color: expected });
      ui.rerender(
        <ProfileStats
          profile={{ ...profile, total_completions: 0, total_missed: 0 }}
          completionRate={completionRate}
        />,
      );
      expect(ui.getByText(`${completionRate}%`)).toHaveStyle({ color: mockColors.textTertiary });
    },
  );
  it('renders static and interactive summary metrics', () => {
    const friends = jest.fn();
    const ui = render(
      <ProfileStatsStrip
        friendCount={2000}
        responses={15}
        reactions={33}
        onPressFriends={friends}
      />,
    );
    expect(ui.getByText('2k')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('View friends'));
    expect(friends).toHaveBeenCalled();
    ui.unmount();
    const chip = render(<ProfileStatChip label="Responses" value={15} />);
    expect(chip.queryByRole('button')).toBeNull();
    expect(chip.getByText('15')).toBeTruthy();
  });
  it('renders cosmetics, trimmed bio and photo-edit loading state', () => {
    const change = jest.fn();
    const styled = {
      ...profile,
      equipped_border_key: Object.keys(BORDER_CATALOG)[0],
      equipped_title_key: Object.keys(TITLE_CATALOG)[0],
    };
    const ui = render(
      <ProfileHeroRow
        profile={styled}
        onChangePhoto={change}
        trailing={<NativeText>Owner</NativeText>}
      />,
    );
    expect(ui.getByText('A private test bio')).toBeTruthy();
    expect(ui.getByText(Object.values(TITLE_CATALOG)[0].label)).toBeTruthy();
    expect(ui.getByText('Owner')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Change profile photo'));
    expect(change).toHaveBeenCalledTimes(1);
    ui.rerender(<ProfileHeroRow profile={styled} onChangePhoto={change} photoUploading />);
    expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Change profile photo'));
    expect(change).toHaveBeenCalledTimes(1);
    ui.rerender(
      <ProfileHeroRow
        profile={{
          ...profile,
          avatar_url: 'https://example.invalid/avatar.jpg',
          bio: '',
          level: 1,
        }}
        showLevel={false}
      />,
    );
    expect(ui.queryByLabelText('Change profile photo')).toBeNull();
    expect(ui.queryByText('A private test bio')).toBeNull();
    // Exercise the defensive fallback for a legacy runtime record missing its level.
    const legacyProfile = { ...profile };
    Reflect.deleteProperty(legacyProfile, 'level');
    ui.rerender(<ProfileHeroRow profile={legacyProfile} />);
    expect(ui.getByText('1')).toBeTruthy();
  });
  it('adds Sparks only when balance and shop action are present, then animates gains', () => {
    const shop = jest.fn();
    const ui = render(<ProfileStreakPair currentStreak={3} bestStreak={9} />);
    expect(ui.queryByText('Sparks')).toBeNull();
    ui.rerender(<ProfileStreakPair currentStreak={3} bestStreak={9} sparks={100} />);
    expect(ui.queryByText('Sparks')).toBeNull();
    ui.rerender(
      <ProfileStreakPair currentStreak={3} bestStreak={9} sparks={100} onPressShop={shop} />,
    );
    fireEvent.press(ui.getByLabelText('Open Shop, 100 Sparks'));
    expect(shop).toHaveBeenCalled();
    ui.rerender(
      <ProfileStreakPair currentStreak={3} bestStreak={9} sparks={150} onPressShop={shop} />,
    );
    expect(ui.getByText('+50')).toBeTruthy();
  });
  it('renders photo and text grid tiles with exact post callbacks and pressed styling', () => {
    const open = jest.fn();
    const ui = render(<ProfilePostsGrid posts={[]} emptyHint="No posts yet" onPostPress={open} />);
    expect(ui.getByText('No posts yet')).toBeTruthy();
    const posts = [post(), post({ id: 'photo', photo_url: 'https://example.invalid/photo' })];
    ui.rerender(<ProfilePostsGrid posts={posts} emptyHint="No posts yet" onPostPress={open} />);
    const buttons = ui.getAllByLabelText('Open post');
    fireEvent.press(buttons[0]);
    fireEvent.press(buttons[1]);
    expect(open.mock.calls).toEqual([[posts[0]], [posts[1]]]);
    fireEvent(buttons[0], 'pressIn');
    fireEvent(buttons[0], 'pressOut');
    expect(ui.UNSAFE_getByType(Image).props.source.uri).toBe(posts[1].photo_url);
  });
  it('distinguishes missing, loading, text and photo current posts', () => {
    const ui = render(<ProfileCurrentPost post={null} />);
    expect(ui.toJSON()).toBeNull();
    ui.rerender(<ProfileCurrentPost post={null} loading />);
    expect(ui.UNSAFE_getByType(Skeleton)).toBeTruthy();
    ui.rerender(<ProfileCurrentPost post={post({ caption: '   ' })} />);
    expect(ui.getByText('Daily Doji')).toBeTruthy();
    expect(ui.getByText('View this response')).toBeTruthy();
    fireEvent.press(ui.getByLabelText("Open today's Doji post"));
    expect(mockRouter.push).toHaveBeenCalledWith(
      postDetailHref('post-1', { returnTo: '/profile' }),
    );
    ui.rerender(
      <ProfileCurrentPost
        post={post({
          caption: 'Custom response',
          challenge: { title: 'My prompt' } as Post['challenge'],
        })}
      />,
    );
    expect(ui.getByText('My prompt')).toBeTruthy();
    expect(ui.getByText('Custom response')).toBeTruthy();
    ui.rerender(<ProfileCurrentPost post={post({ photo_url: 'private-key' })} />);
    expect(ui.UNSAFE_getByType(Skeleton)).toBeTruthy();
    expect(ui.UNSAFE_queryByType(Image)).toBeNull();
    mockMedia.photo_url = 'https://example.invalid/signed';
    ui.rerender(<ProfileCurrentPost post={post({ photo_url: 'private-key' })} />);
    fireEvent(ui.UNSAFE_getByType(Image), 'load');
    expect(ui.UNSAFE_queryByType(Skeleton)).toBeNull();
    mockMedia = { photo_url: null, front_photo_url: 'https://example.invalid/front' };
    ui.rerender(<ProfileCurrentPost post={post({ front_photo_url: 'front-key' })} />);
    expect(ui.UNSAFE_getByType(Skeleton)).toBeTruthy();
  });
});

describe('profile connection menu', () => {
  it.each(['Block user', 'Report user', 'Unblock user'])(
    'dismisses before invoking %s',
    (label) => {
      const onBlock = jest.fn(),
        onUnblock = jest.fn(),
        onReport = jest.fn();
      const ui = render(
        <ProfileManageMenu
          isBlocked={label === 'Unblock user'}
          onBlock={onBlock}
          onUnblock={onUnblock}
          onReport={onReport}
        />,
      );
      fireEvent.press(ui.getByLabelText('Manage profile connection'));
      const action = ui.getByLabelText(label);
      fireEvent(action, 'pressIn');
      fireEvent.press(action);
      expect(ui.UNSAFE_queryByType(Modal)).toBeNull();
      expect(onBlock).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(20));
      expect(
        label === 'Block user' ? onBlock : label === 'Report user' ? onReport : onUnblock,
      ).toHaveBeenCalledTimes(1);
    },
  );
  it('disables destructive actions while busy and supports outside/native dismissal', () => {
    const action = jest.fn();
    const ui = render(
      <ProfileManageMenu
        isBlocked={false}
        busy
        onBlock={action}
        onUnblock={action}
        onReport={action}
      />,
    );
    fireEvent.press(ui.getByLabelText('Manage profile connection'));
    fireEvent.press(ui.getByLabelText('Block user'));
    expect(action).not.toHaveBeenCalled();
    fireEvent.press(ui.getByLabelText('Close manage menu'));
    expect(ui.UNSAFE_queryByType(Modal)).toBeNull();
    fireEvent.press(ui.getByLabelText('Manage profile connection'));
    fireEvent(ui.UNSAFE_getByType(Modal), 'requestClose');
    expect(ui.UNSAFE_queryByType(Modal)).toBeNull();
  });
});

describe('actual submission record presentation', () => {
  it.each(['pending', 'approved', 'rejected'] as const)(
    'expands %s details and collapses accessibly',
    (status) => {
      const ui = render(
        <SubmissionCard
          submission={suggestion({ status, admin_note: 'Needs a clearer question' })}
        />,
      );
      const button = ui.getByRole('button');
      expect(button.props.accessibilityState.expanded).toBe(false);
      fireEvent.press(button);
      expect(ui.getByRole('button').props.accessibilityState.expanded).toBe(true);
      expect(
        ui.getByText(
          status === 'pending'
            ? 'Waiting for review.'
            : status === 'approved'
              ? 'Approved'
              : 'Needs a clearer question',
        ),
      ).toBeTruthy();
      fireEvent.press(ui.getByRole('button'));
      expect(ui.queryByText('Waiting for review.')).toBeNull();
    },
  );
  it.each([
    [
      { id: 'staff', username: 'reviewer', display_name: ' Reviewer Name ', avatar_url: null },
      'Reviewer Name',
    ],
    [{ id: 'staff', username: 'reviewer', display_name: '', avatar_url: null }, '@reviewer'],
    [{ id: 'staff', username: '', display_name: '', avatar_url: null }, 'Admin'],
  ])('uses safe reviewer fallback %s', (reviewer, label) => {
    const ui = render(
      <SubmissionCard
        submission={suggestion({
          status: 'approved',
          reviewer,
          reviewed_at: '2026-09-02T00:00:00Z',
        })}
      />,
    );
    fireEvent.press(ui.getByRole('button'));
    expect(ui.getByText(new RegExp(`Approved by ${label}`))).toBeTruthy();
    ui.rerender(
      <SubmissionCard
        submission={suggestion({ status: 'rejected', reviewer, admin_note: '   ' })}
      />,
    );
    expect(ui.getByText(`Rejected by ${label}`)).toBeTruthy();
    expect(ui.queryByText('FEEDBACK')).toBeNull();
    ui.rerender(
      <SubmissionCard
        submission={suggestion({
          status: 'rejected',
          reviewer,
          reviewed_at: '2026-09-02T00:00:00Z',
        })}
      />,
    );
    expect(ui.getByText(new RegExp(`Rejected by ${label}`))).toBeTruthy();
  });
  it('preserves actual cards for transient errors but removes them on lost authorization', () => {
    const retry = jest.fn();
    const data = [suggestion()];
    const base = { isPending: false, isFetching: false, onRetry: retry };
    const ui = render(<ProfileSubmissions {...base} data={data} error={{ status: 504 }} />);
    expect(ui.getByText('Show a sunset')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Retry loading submissions'));
    expect(retry).toHaveBeenCalled();
    ui.rerender(<ProfileSubmissions {...base} data={data} error={{ status: 403 }} />);
    expect(ui.queryByText('Show a sunset')).toBeNull();
    ui.rerender(<ProfileSubmissions {...base} isPending error={null} />);
    expect(ui.getByLabelText('Loading submissions')).toBeTruthy();
    ui.rerender(<ProfileSubmissions {...base} data={[]} error={null} />);
    expect(ui.toJSON()).toBeNull();
  });
});
