import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FlatList, RefreshControl } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyProfile from '../../app/(app)/(tabs)/profile';
import Member from '../../app/(app)/member/[username]';
import { ProfileFriendsSheet } from '../../components/profile/ProfileFriendsSheet';
import {
  ProfileHeroRow,
  ProfileStatsStrip,
  ProfileStreakPair,
} from '../../components/profile/ProfileSections';
import { ProfileManageMenu } from '../../components/profile/ProfileManageMenu';
import { ProfileSubmissions } from '../../components/profile/ProfileSubmissions';
import { AppSheetModal } from '../../components/ui/AppSheetModal';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { useProfileNavigationStore } from '../../stores/useProfileNavigationStore';
import type { Profile } from '../../types/database';
import type { ProfileFriendListRow } from '../../hooks/useProfile';
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
let mockParams: { username?: string | string[]; returnTo?: string } = { username: 'other' };
const mockAuth = { session: { user: { id: 'self' } }, profile: null as Profile | null, fetchProfile: jest.fn() };
const mockProfile = {
  data: undefined as Partial<Profile> | undefined,
  isLoading: false,
  isFetched: true,
  blockedByUser: false,
  isError: false,
  refetch: jest.fn(),
};
const mockPhoto = {
  openChangePhotoDialog: jest.fn(),
  uploading: false,
  error: null as string | null,
};
const mockSuggestions = {
  data: [] as { status: string }[] | undefined,
  error: null,
  isPending: false,
  isFetching: false,
  refetch: jest.fn(),
};
const mutation = () => ({ mutate: jest.fn(), isPending: false });
const mockSend = mutation(),
  mockRemove = mutation(),
  mockRespond = mutation(),
  mockBlock = mutation(),
  mockUnblock = mutation();
let mockFriendship = { id: 'friendship' } as { id: string } | undefined,
  mockStatus = 'none',
  mockBlocked = false;
let mockRelationshipPending = false;
let mockRelationshipError = false;
let mockRelationshipStale = false;
let mockRelationshipTarget = 'other';
const mockRelationshipRetry = jest.fn();
const mockDialog = jest.fn(),
  mockReport = jest.fn();
const mockFriends = {
  data: undefined as { pages: ProfileFriendListRow[][] } | undefined,
  isPending: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
};
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/member/other',
  useFocusEffect: jest.fn(),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mockAuth) => unknown) => selector(mockAuth), {
    getState: () => mockAuth,
  }),
}));
jest.mock('../../hooks/useProfile', () => ({
  useProfile: () => mockProfile,
  deriveFriendshipStatus: jest.requireActual('../../hooks/useProfile').deriveFriendshipStatus,
  useFriendship: () => ({
    data: mockRelationshipPending ? undefined : mockStatus === 'none' ? null : mockFriendship ? {
      ...mockFriendship,
      requester_id: mockStatus === 'pending_out' ? 'self' : mockRelationshipTarget,
      addressee_id: mockStatus === 'pending_out' ? mockRelationshipTarget : 'self',
      status: mockStatus === 'friends' ? 'accepted' : mockStatus === 'blocked' ? 'blocked' : 'pending',
    } : undefined,
    isError: mockRelationshipError,
    isStale: mockRelationshipStale,
    isFetchedAfterMount: !mockRelationshipStale,
    refetch: mockRelationshipRetry,
  }),
  useFriendshipStatus: () => ({ data: mockStatus }),
  useFriendCount: () => ({ data: 2 }),
  useSendFriendRequest: () => mockSend,
  useRemoveFriend: () => mockRemove,
}));
jest.mock('../../hooks/useFriendRequests', () => ({
  useRespondToFriendRequest: () => mockRespond,
}));
jest.mock('../../hooks/useBlockUser', () => ({
  useBlockUser: () => mockBlock,
  useUnblockUser: () => mockUnblock,
  useIsBlockedByMe: () => ({ data: mockBlocked, refetch: jest.fn() }),
}));
jest.mock('../../hooks/useCurrentProfilePost', () => ({
  useCurrentProfilePost: () => ({ data: null, isLoading: false }),
}));
jest.mock('../../hooks/useReactionsGivenCount', () => ({
  useReactionsGivenCount: () => ({ data: 3 }),
}));
jest.mock('../../hooks/usePollVotesCount', () => ({ usePollVotesCount: () => ({ data: 4 }) }));
jest.mock('../../hooks/useChangeProfilePhoto', () => ({ useChangeProfilePhoto: () => mockPhoto }));
jest.mock('../../hooks/useSparks', () => ({ useSparksBalance: () => 500 }));
jest.mock('../../hooks/useSuggestions', () => ({
  ...jest.requireActual('../../hooks/useSuggestions'),
  useMySuggestions: () => mockSuggestions,
}));
jest.mock('../../hooks/useBadges', () => ({
  useBadgeCategories: () => ({ data: [{ id: 'category', name: 'Explorer', icon: 'star' }] }),
  useBadgeTiers: () => ({ data: [] }),
  useUserBadgeProgress: () => ({ data: [] }),
}));
jest.mock('../../hooks/useProfileFriendsPaged', () => ({
  useProfileFriendsPaged: () => mockFriends,
}));
jest.mock('../../contexts/DialogContext', () => ({
  useAppDialog: () => ({ showDialog: mockDialog }),
}));
jest.mock('../../contexts/ReportFlowContext', () => ({ useReportFlow: () => mockReport }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
const clients: QueryClient[] = [];
const shell = (node: React.ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return (
    <QueryClientProvider client={client}>
      <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>
    </QueryClientProvider>
  );
};
const profile = (id = 'other', full = true) =>
  ({
    id,
    username: id,
    display_name: full ? 'Synthetic Member' : '',
    avatar_url: null,
    ...(full
      ? {
          xp: 100,
          level: 2,
          current_streak: 3,
          longest_streak: 4,
          total_completions: 5,
          reactions_received: 6,
          reactions_given: 7,
        }
      : {}),
  }) as Profile;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockParams = { username: 'other' };
  mockAuth.profile = profile('self');
  mockAuth.fetchProfile.mockResolvedValue(undefined);
  Object.assign(mockProfile, {
    data: profile(),
    isLoading: false,
    isFetched: true,
    blockedByUser: false,
  });
  mockPhoto.error = null;
  mockPhoto.uploading = false;
  mockSuggestions.data = [];
  mockStatus = 'none';
  mockRelationshipPending = false;
  mockRelationshipError = false;
  mockRelationshipStale = false;
  mockRelationshipTarget = 'other';
  mockProfile.isError = false;
  mockFriendship = { id: 'friendship' };
  mockBlocked = false;
  [mockSend, mockRemove, mockRespond, mockBlock, mockUnblock].forEach((m) => {
    m.isPending = false;
  });
  Object.assign(mockFriends, {
    data: undefined,
    isPending: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  useProfileNavigationStore.getState().clear();
});
it('never guesses a friendship action while the authoritative relationship is unknown', () => {
  mockRelationshipPending = true;
  const ui = render(shell(<Member />));
  expect(ui.getByLabelText('Loading friendship status')).toBeTruthy();
  expect(ui.getByLabelText('Loading friendship status').props.accessibilityRole).toBe('button');
  expect(ui.queryByText('Add friend')).toBeNull();
  expect(ui.queryByText('Accept')).toBeNull();
  expect(ui.queryByText('Unfriend')).toBeNull();
  const menu = ui.getByLabelText('Manage profile connection');
  expect(menu.props.accessibilityState.disabled).toBe(true);
  mockRelationshipPending = false;
  mockStatus = 'friends';
  ui.rerender(shell(<Member />));
  expect(ui.getByText('Unfriend')).toBeTruthy();
  expect(ui.getByLabelText('Manage profile connection')).toBe(menu);
  expect(menu.props.accessibilityState.disabled).toBe(false);
});

it('background action errors retain the label/menu and disable commands until retry succeeds', () => {
  mockStatus = 'pending_in'; mockRelationshipStale = true;
  const ui = render(shell(<Member />));
  mockStatus = 'friends'; mockRelationshipStale = false;
  ui.rerender(shell(<Member />));
  const menu = ui.getByLabelText('Manage profile connection');
  expect(ui.getByText('Unfriend')).toBeTruthy();
  mockRelationshipError = true;
  ui.rerender(shell(<Member />));
  expect(ui.getByText('Unfriend')).toBeTruthy();
  expect(ui.queryByLabelText('Loading friendship status')).toBeNull();
  expect(ui.getByLabelText('Manage profile connection')).toBe(menu);
  expect(menu.props.accessibilityState.disabled).toBe(true);
  expect(ui.getByText('Could not load friendship status')).toBeTruthy();
  fireEvent.press(ui.getByText('Unfriend'));
  expect(mockDialog).not.toHaveBeenCalled();
  mockRelationshipError = false;
  ui.rerender(shell(<Member />));
  expect(menu.props.accessibilityState.disabled).toBe(false);
  expect(ui.queryByText('Could not load friendship status')).toBeNull();
});

it('a stale incoming request is revalidated before offering Accept', () => {
  mockStatus = 'pending_in'; mockRelationshipStale = true;
  const ui = render(shell(<Member />));
  expect(ui.queryByText('Accept')).toBeNull();
  expect(ui.getByLabelText('Loading friendship status')).toBeTruthy();
  mockStatus = 'friends'; mockRelationshipStale = false;
  ui.rerender(shell(<Member />));
  expect(ui.getByText('Unfriend')).toBeTruthy();
});

it('a previous profile relationship cannot flash Accept on the next member', () => {
  mockStatus = 'pending_in';
  const ui = render(shell(<Member />));
  expect(ui.getByText('Accept')).toBeTruthy();
  mockParams = { username: 'next' };
  mockProfile.data = profile('next');
  ui.rerender(shell(<Member />));
  expect(ui.queryByText('Accept')).toBeNull();
  expect(ui.getByLabelText('Loading friendship status')).toBeTruthy();
  mockStatus = 'friends'; mockRelationshipTarget = 'next';
  ui.rerender(shell(<Member />));
  expect(ui.getByText('Unfriend')).toBeTruthy();
});

it('relationship read errors retain the profile and expose retry, not Add friend', () => {
  mockRelationshipPending = true; mockRelationshipError = true;
  const ui = render(shell(<Member />));
  expect(ui.getByText('Could not load friendship status')).toBeTruthy();
  expect(ui.queryByText('Add friend')).toBeNull();
  fireEvent.press(ui.getByText('Retry actions'));
  expect(mockRelationshipRetry).toHaveBeenCalled();
});

it('profile read failure is not User not found', () => {
  mockProfile.data = undefined; mockProfile.isError = true;
  const ui = render(shell(<Member />));
  expect(ui.getByText('Could not load profile')).toBeTruthy();
  expect(ui.queryByText('User not found')).toBeNull();
  fireEvent.press(ui.getByText('Retry'));
  expect(mockProfile.refetch).toHaveBeenCalled();
});

afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  jest.useRealTimers();
});
it.each([true, false])(
  'renders and refreshes the current profile with complete=%s counters',
  async (full) => {
    mockAuth.profile = profile('self', full);
    mockSuggestions.data = [{ status: 'approved' }, { status: 'pending' }];
    mockPhoto.error = 'Photo upload failed';
    const ui = render(shell(<MyProfile />));
    const client = clients[clients.length - 1];
    client.setQueryData(['badgeCategories'], []);
    client.setQueryData(['badgeTiers'], []);
    expect(ui.getByText('Badges')).toBeTruthy();
    expect(ui.getByText('Could not update photo')).toBeTruthy();
    fireEvent(ui.getByLabelText('Settings'), 'pressIn');
    fireEvent.press(ui.getByLabelText('Settings'));
    expect(String(mockRouter.push.mock.calls[0][0])).toContain('/profile/settings');
    act(() => ui.UNSAFE_getByType(ProfileHeroRow).props.onChangePhoto());
    expect(mockPhoto.openChangePhotoDialog).toHaveBeenCalled();
    act(() => ui.UNSAFE_getByType(ProfileStreakPair).props.onPressShop());
    expect(String(mockRouter.push.mock.calls[1][0])).toContain('/profile/shop');
    await act(async () => ui.UNSAFE_getByType(RefreshControl).props.onRefresh());
    expect(mockAuth.fetchProfile).toHaveBeenCalledWith('self');
    expect(client.getQueryState(['badgeCategories'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(['badgeTiers'])?.isInvalidated).toBe(true);
    act(() => ui.UNSAFE_getByType(ProfileSubmissions).props.onRetry());
    expect(mockSuggestions.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    act(() => ui.UNSAFE_getByType(ProfileStatsStrip).props.onPressFriends());
    expect(ui.UNSAFE_getByType(ProfileFriendsSheet).props.profileUserId).toBe('self');
    act(() => ui.UNSAFE_getByType(ProfileFriendsSheet).props.onClose());
    expect(ui.UNSAFE_queryByType(ProfileFriendsSheet)).toBeNull();
  },
);
it('does not render private profile content without the authenticated profile', () => {
  mockAuth.profile = null;
  const ui = render(shell(<MyProfile />));
  expect(ui.toJSON()).toBeNull();
});
it.each(['self', 'loading', 'pending route', 'blocked', 'missing', 'mismatch', 'empty username'])(
  'handles member route %s',
  (mode) => {
    if (mode === 'self') mockParams.username = 'self';
    if (mode === 'loading') {
      mockProfile.isLoading = true;
      mockProfile.data = undefined;
    }
    if (mode === 'pending route') useProfileNavigationStore.getState().begin('different');
    if (mode === 'blocked') mockProfile.blockedByUser = true;
    if (mode === 'missing') mockProfile.data = undefined;
    if (mode === 'mismatch') mockProfile.data = profile('another');
    if (mode === 'empty username') mockParams.username = undefined;
    const ui = render(shell(<Member />));
    if (mode === 'self') {
      expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/profile');
      expect(ui.toJSON()).toBeNull();
    } else if (mode === 'blocked') expect(ui.getByText('This user has blocked you')).toBeTruthy();
    else if (['missing', 'mismatch', 'empty username'].includes(mode))
      expect(ui.getByText('User not found')).toBeTruthy();
    else expect(ui.queryByText('Synthetic Member')).toBeNull();
    if (mode !== 'self') {
      fireEvent(ui.getByLabelText('Back'), 'pressIn');
      fireEvent.press(ui.getByLabelText('Back'));
      expect(mockRouter.back).toHaveBeenCalled();
    }
  },
);
it.each(['none', 'pending_in', 'pending_out', 'friends', 'blocked'])(
  'respects friendship state %s and reports errors',
  (status) => {
    mockStatus = status;
    mockParams.username = ['OTHER'];
    mockProfile.data = profile('other', false);
    const ui = render(shell(<Member />));
    const label =
      status === 'friends'
        ? 'Unfriend'
        : status === 'pending_in'
          ? 'Accept'
          : status === 'pending_out'
            ? 'Requested'
            : 'Add friend';
    fireEvent.press(ui.getByText(label));
    if (status === 'none') {
      expect(mockSend.mutate.mock.calls[0][0]).toEqual({ addresseeId: 'other' });
      act(() => mockSend.mutate.mock.calls[0][1].onError());
      expect(
        ui.getByText('Could not send the request. Check your connection and try again.'),
      ).toBeTruthy();
    }
    if (status === 'pending_in') {
      expect(mockRespond.mutate.mock.calls[0][0]).toEqual({
        friendshipId: 'friendship',
        accept: true,
      });
      act(() => mockRespond.mutate.mock.calls[0][1].onError());
      expect(
        ui.getByText('Could not accept the request. Your previous status was restored; try again.'),
      ).toBeTruthy();
    }
    if (status === 'friends') {
      expect(mockRemove.mutate).not.toHaveBeenCalled();
      act(() => mockDialog.mock.calls[0][0].actions[1].onPress());
      expect(mockRemove.mutate).toHaveBeenCalledWith({ friendshipId: 'friendship' });
    }
    if (status === 'blocked' || status === 'pending_out') {
      expect(mockSend.mutate).not.toHaveBeenCalled();
      expect(mockRespond.mutate).not.toHaveBeenCalled();
    }
  },
);
it.each([false, true])(
  'confirms block/unblock and does not report implicitly blocked=%s',
  (blocked) => {
    mockBlocked = blocked;
    const ui = render(shell(<Member />));
    act(() => ui.UNSAFE_getByType(ProfileManageMenu).props[blocked ? 'onUnblock' : 'onBlock']());
    expect(mockBlock.mutate).not.toHaveBeenCalled();
    expect(mockUnblock.mutate).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
    act(() => mockDialog.mock.calls[0][0].actions[1].onPress());
    const m = blocked ? mockUnblock : mockBlock;
    expect(m.mutate.mock.calls[0][0]).toMatchObject({ blockedUserId: 'other' });
    act(() => m.mutate.mock.calls[0][1].onSuccess());
    act(() => ui.UNSAFE_getByType(ProfileManageMenu).props.onReport());
    expect(mockReport).toHaveBeenCalledWith({ reportedUserId: 'other' });
  },
);
it('refreshes public profile reads and opens/closes the exact friends list', async () => {
  const ui = render(shell(<Member />));
  const invalidate = jest.spyOn(clients[0], 'invalidateQueries');
  await act(async () => ui.UNSAFE_getByType(RefreshControl).props.onRefresh());
  expect(invalidate).toHaveBeenCalled();
  act(() => ui.UNSAFE_getByType(ProfileStatsStrip).props.onPressFriends());
  expect(ui.UNSAFE_getByType(ProfileFriendsSheet).props.profileUserId).toBe('other');
  act(() => ui.UNSAFE_getByType(ProfileFriendsSheet).props.onClose());
  expect(ui.UNSAFE_queryByType(ProfileFriendsSheet)).toBeNull();
});
it.each(['loading', 'empty', 'populated'])(
  'renders profile friends %s and defers navigation until dismissal',
  (mode) => {
    mockFriends.isPending = mode === 'loading';
    if (mode === 'populated') {
      mockFriends.data = {
        pages: [
          [
            {
              friend_id: 'friend',
              username: 'friend',
              display_name: 'Friend',
              avatar_url: null,
            } as ProfileFriendListRow,
          ],
        ],
      };
      mockFriends.hasNextPage = true;
    }
    const close = jest.fn();
    const ui = render(
      shell(
        <ProfileFriendsSheet
          visible
          profileUserId="other"
          ownerDisplayName={mode === 'empty' ? null : 'Other'}
          onClose={close}
        />,
      ),
    );
    if (mode === 'loading') expect(ui.getByLabelText('Loading friends')).toBeTruthy();
    if (mode === 'empty') expect(ui.getByText('No friends yet')).toBeTruthy();
    if (mode === 'populated') {
      fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
      expect(mockFriends.fetchNextPage).toHaveBeenCalledTimes(1);
      fireEvent.press(ui.getByText('@friend'));
      expect(close).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).not.toHaveBeenCalled();
      act(() => ui.UNSAFE_getByType(AppSheetModal).props.onDismiss());
      expect(String(mockRouter.push.mock.calls[0][0])).toContain('/member/friend');
      mockFriends.isFetchingNextPage = true;
      ui.rerender(shell(<ProfileFriendsSheet visible profileUserId="other" onClose={close} />));
      fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
      expect(mockFriends.fetchNextPage).toHaveBeenCalledTimes(1);
    }
    fireEvent.press(ui.getAllByLabelText('Close')[0]);
    expect(close).toHaveBeenCalled();
  },
);
