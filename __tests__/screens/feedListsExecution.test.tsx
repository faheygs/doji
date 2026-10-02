import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FlatList, InteractionManager, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Feed from '../../app/(app)/(tabs)/index';
import Rank from '../../app/(app)/(tabs)/rank';
import Friends from '../../app/(app)/(tabs)/friends';
import { PostCard } from '../../components/feed/PostCard';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import { FeedSkeleton } from '../../components/feed/FeedSkeleton';
import { ErrorState } from '../../components/ui/ErrorState';
import { ReadFailureFeedback } from '../../components/ui/ReadFailureFeedback';
import type { Post, UserEvent, LeaderboardEntry, Challenge } from '../../types/database';
import type { FriendListRow } from '../../hooks/useFriendsPaged';
import type { FeedAudience } from '../../lib/feedAudience';

const mockRouter = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
let mockParams: Record<string, unknown> = {},
  mockAudience: FeedAudience = 'everyone',
  mockDark = false;
const mockSelect = jest.fn(),
  mockPrefetch = jest.fn(),
  mockFocusInvalidation = jest.fn(),
  mockDialog = jest.fn(),
  mockRemove = { mutate: jest.fn() };
let mockFocus: (() => void) | undefined;
let mockAuth = {
  session: { user: { id: 'self' } } as { user: { id: string } } | null,
  profile: { id: 'self', username: 'self' },
};
const mockNotifications = {
  unreadCount: 0,
  markBellOpened: jest.fn(),
  dismissItem: jest.fn(),
  clearNotificationHistory: jest.fn(),
  items: [],
  isLoading: false,
  isClearing: false,
  readError: null,
  isRefetching: false,
  retryRead: jest.fn(),
  markItemsSeen: jest.fn(),
  markScopesSeen: jest.fn(),
};
type Paged<T> = {
  data?: { pages: T[][] };
  isLoading: boolean;
  isFetching: boolean;
  isFetchedAfterMount: boolean;
  isError: boolean;
  error: unknown;
  fetchNextPage: jest.Mock;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  refetch: jest.Mock;
};
let mockFeed: Paged<Post>, mockFriends: Paged<FriendListRow>;
let mockEvent: { data?: UserEvent; isLoading: boolean },
  mockUpcoming: { data?: { fires_at: string } };
let mockRanks: {
  data?: LeaderboardEntry[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  refetch: jest.Mock;
};
let mockRequestCount: number | undefined = 0,
  mockFriendCount: number | undefined = 0;
const mockRankCall = jest.fn();
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
  }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((s: (state: typeof mockAuth) => unknown) => s(mockAuth), {
    getState: () => mockAuth,
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/feed',
  useFocusEffect: (cb: () => void) => {
    mockFocus = cb;
  },
}));
jest.mock('../../hooks/useFeed', () => ({
  useFeed: () => mockFeed,
  prefetchFeedAudience: (...args: unknown[]) => mockPrefetch(...args),
}));
jest.mock('../../hooks/useFeedAudiencePreference', () => ({
  useFeedAudiencePreference: () => ({ audience: mockAudience, selectAudience: mockSelect }),
}));
jest.mock('../../hooks/usePreparedFeedPosts', () => ({
  usePreparedFeedPosts: (posts: Post[]) => posts,
}));
jest.mock('../../hooks/useFocusedRealtimeInvalidation', () => ({
  useFocusedRealtimeInvalidation: (...args: unknown[]) => mockFocusInvalidation(...args),
}));
jest.mock('../../hooks/useUserEvent', () => ({ useUserEvent: () => mockEvent }));
jest.mock('../../hooks/useUpcomingDoji', () => ({ useUpcomingDoji: () => mockUpcoming }));
jest.mock('../../contexts/NotificationCenterContext', () => ({
  useNotificationCenterContext: () => mockNotifications,
}));
jest.mock('../../contexts/DialogContext', () => ({
  useAppDialog: () => ({ showDialog: mockDialog }),
}));
jest.mock('../../hooks/useProfile', () => ({
  useRemoveFriend: () => mockRemove,
  useFriendCount: () => ({ data: mockFriendCount }),
}));
jest.mock('../../hooks/useFriendRequests', () => ({
  useFriendRequestCount: () => ({ data: mockRequestCount }),
}));
jest.mock('../../hooks/useFriendsPaged', () => ({ useFriendsPaged: () => mockFriends }));
jest.mock('../../hooks/useLeaderboard', () => ({
  useLeaderboard: (...args: unknown[]) => {
    mockRankCall(...args);
    return mockRanks;
  },
}));
// Child behavior is verified separately; this suite runs the real screen and list orchestration.
jest.mock('../../components/feed/PostCard', () => ({ PostCard: () => null }));
jest.mock('../../components/notifications/NotificationSheet', () => ({
  NotificationSheet: () => null,
}));
jest.mock('../../components/challenge/ChallengeBanner', () => ({ ChallengeBanner: () => null }));
jest.mock('../../components/challenge/UpcomingDojiBanner', () => ({
  UpcomingDojiBanner: () => null,
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
const clients: QueryClient[] = [];
const shell = (node: React.ReactNode, client?: QueryClient) => {
  const c =
    client ?? new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  if (!client) clients.push(c);
  return <QueryClientProvider client={c}>{node}</QueryClientProvider>;
};
const paged = <T,>(rows: T[] = []): Paged<T> => ({
  data: { pages: [rows] },
  isLoading: false,
  isFetching: false,
  isFetchedAfterMount: true,
  isError: false,
  error: null,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  refetch: jest.fn().mockResolvedValue({}),
});
const post = (id = 'post'): Post => ({ id, type: 'task_complete', caption: 'Answer' }) as Post;
const friend = (id = 'other'): FriendListRow =>
  ({
    id,
    username: id,
    display_name: id,
    current_streak: 2,
    avatar_url: null,
    friendship_id: 'friendship',
  }) as FriendListRow;
const rank = (n: number, id = `member${n}`): LeaderboardEntry =>
  ({
    rank: n,
    user_id: id,
    xp: 1000,
    profile: { username: id, display_name: id, avatar_url: null, level: n },
  }) as LeaderboardEntry;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockParams = {};
  mockAudience = 'everyone';
  mockDark = false;
  mockAuth.session = { user: { id: 'self' } };
  mockFocus = undefined;
  mockFeed = paged();
  mockFriends = paged();
  mockEvent = {
    data: {
      status: 'completed',
      daily_event_id: 'daily',
      daily_event: { fires_at: new Date(Date.now() - 1000).toISOString() },
    } as UserEvent,
    isLoading: false,
  };
  mockUpcoming = {};
  mockRanks = {
    data: [],
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: jest.fn().mockResolvedValue({}),
  };
  mockRequestCount = 0;
  mockFriendCount = 0;
  mockNotifications.unreadCount = 0;
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb) => {
    if (typeof cb === 'function') cb();
    return { cancel: jest.fn(), then: jest.fn(), done: jest.fn() };
  });
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  jest.restoreAllMocks();
  jest.useRealTimers();
});
describe.each([false, true])('lists dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it('feed warms text-only adjacent audience and marks only live event scope', () => {
    const ui = render(shell(<Feed />));
    act(() => mockFocus?.());
    expect(mockNotifications.markScopesSeen).toHaveBeenCalledWith([
      { scope_kind: 'daily_event', scope_id: 'daily' },
    ]);
    expect(mockPrefetch).toHaveBeenCalledWith(expect.any(QueryClient), {
      userId: 'self',
      dailyEventId: 'daily',
      audience: 'friends',
      unlocked: true,
    });
    expect(ui.getByText('Nothing yet')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Your profile'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/profile');
    fireEvent.press(ui.getByLabelText('Everyone feed'));
    fireEvent.press(ui.getByLabelText('Friends feed'));
    expect(mockSelect).toHaveBeenCalledWith('friends');
  });
  it('feed opens/closes notifications and wires read retry', () => {
    mockNotifications.unreadCount = 120;
    const ui = render(shell(<Feed />));
    expect(ui.getByText('99+')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('120 notification alerts'));
    expect(ui.UNSAFE_getByType(NotificationSheet).props.visible).toBe(true);
    act(() => ui.UNSAFE_getByType(NotificationSheet).props.onRetryRead());
    expect(mockNotifications.retryRead).toHaveBeenCalled();
    act(() => ui.UNSAFE_getByType(NotificationSheet).props.onClose());
    expect(mockNotifications.markBellOpened).toHaveBeenCalled();
    expect(ui.UNSAFE_getByType(NotificationSheet).props.visible).toBe(false);
  });
  it('feed only activates visible posts and avoids duplicate pagination', () => {
    mockFeed = paged([post()]);
    mockFeed.hasNextPage = true;
    const ui = render(shell(<Feed />));
    const list = () => ui.UNSAFE_getByType(FlatList);
    expect(ui.UNSAFE_getByType(PostCard).props.realtimeActive).toBe(false);
    const visible = [
      { item: post(), isViewable: true },
      { item: null, isViewable: true },
      { item: post('hidden'), isViewable: false },
    ];
    act(() => list().props.onViewableItemsChanged({ viewableItems: visible }));
    act(() => list().props.onViewableItemsChanged({ viewableItems: visible }));
    expect(ui.UNSAFE_getByType(PostCard).props.realtimeActive).toBe(true);
    act(() => list().props.onEndReached());
    expect(mockFeed.fetchNextPage).toHaveBeenCalledTimes(1);
    mockFeed.isFetchingNextPage = true;
    ui.rerender(shell(<Feed />));
    act(() => list().props.onEndReached());
    expect(mockFeed.fetchNextPage).toHaveBeenCalledTimes(1);
    act(() => list().props.onScrollToIndexFailed({ index: 3, averageItemLength: 100 }));
  });
  it('rank toggles time/audience and renders own and other ranks', () => {
    mockRanks.data = [rank(1), rank(2), rank(3), rank(4, 'self'), rank(5)];
    const ui = render(shell(<Rank />));
    fireEvent.press(ui.getByText('All time'));
    fireEvent.press(ui.getByText('Friends'));
    expect(mockRankCall).toHaveBeenLastCalledWith('alltime', 'friends');
    expect(ui.getByText('Ranked by total XP ever earned.')).toBeTruthy();
    fireEvent.press(ui.getByText('self'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/profile');
    fireEvent.press(ui.getByText('member5'));
    expect(String(mockRouter.push.mock.calls.at(-1)[0])).toContain('member5');
  });
  it('friends routes search, requests and profiles; removal requires confirmation', () => {
    mockFriends = paged([friend()]);
    mockRequestCount = 2;
    mockFriendCount = 1000;
    const ui = render(shell(<Friends />));
    fireEvent(ui.getByLabelText('Find people'), 'pressIn');
    fireEvent.press(ui.getByLabelText('Find people'));
    expect(String(mockRouter.push.mock.calls.at(-1)[0])).toContain('/friends/add');
    fireEvent.press(ui.getByText('2 friend requests'));
    expect(String(mockRouter.push.mock.calls.at(-1)[0])).toContain('/friends/requests');
    fireEvent.press(ui.getByText('other'));
    expect(String(mockRouter.push.mock.calls.at(-1)[0])).toContain('other');
    fireEvent.press(ui.getByLabelText('Remove friend'));
    expect(mockRemove.mutate).not.toHaveBeenCalled();
    act(() => mockDialog.mock.calls[0][0].actions[1].onPress());
    expect(mockRemove.mutate).toHaveBeenCalledWith({ friendshipId: 'friendship' });
  });
});
it.each(['friends', 'absent', 'future', 'loading', 'upcoming', 'error'])(
  'feed handles %s state',
  (state) => {
    if (state === 'friends') mockAudience = 'friends';
    if (state === 'absent') mockEvent.data = undefined;
    if (state === 'future')
      mockEvent.data!.daily_event!.fires_at = new Date(Date.now() + 100000).toISOString();
    if (state === 'loading') {
      mockEvent.isLoading = true;
      mockFeed.data = undefined;
    }
    if (state === 'upcoming') {
      mockUpcoming.data = { fires_at: new Date(Date.now() + 100000).toISOString() };
      mockFeed.isLoading = true;
    }
    if (state === 'error') mockFeed.isError = true;
    const ui = render(shell(<Feed />));
    if (state === 'friends') expect(ui.getByText('Nothing from friends yet')).toBeTruthy();
    if (state === 'absent' || state === 'future')
      expect(ui.getByText('Challenge incoming')).toBeTruthy();
    if (state === 'loading') expect(ui.getByLabelText("Loading today's challenge")).toBeTruthy();
    if (state === 'error') {
      act(() => ui.UNSAFE_getByType(ErrorState).props.onRetry());
      expect(mockFeed.refetch).toHaveBeenCalled();
    }
    act(() => mockFocus?.());
    if (state === 'future' || state === 'absent')
      expect(mockNotifications.markScopesSeen).not.toHaveBeenCalled();
  },
);
it.each([false, true])('deep links resolve exact post and comments array=%s', (array) => {
  mockFeed = paged([post()]);
  mockParams = { postId: array ? ['post'] : 'post', openComments: array ? ['true'] : '1' };
  const ui = render(shell(<Feed />));
  act(() => jest.advanceTimersByTime(20));
  expect(ui.UNSAFE_getByType(PostCard).props.initialCommentsOpen).toBe(true);
  expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
  ui.rerender(shell(<Feed />));
  expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
});
it('does not resolve absent deep links or repeat warming once media cards are presented', () => {
  mockFeed = paged([{ ...post(), photo_url: 'private-ref' }]);
  mockParams = { postId: 'missing' };
  const ui = render(shell(<Feed />));
  expect(mockRouter.setParams).not.toHaveBeenCalled();
  // Stable presentation initializes empty; the cold effect schedules once before admission.
  const coldCalls = mockPrefetch.mock.calls.length;
  ui.rerender(shell(<Feed />));
  expect(mockPrefetch).toHaveBeenCalledTimes(coldCalls);
  ui.unmount();
  mockFeed = paged();
  mockAuth.session = null;
  render(shell(<Feed />));
  expect(mockPrefetch).toHaveBeenCalledTimes(coldCalls);
});
it.each([1, 2])('reconciles %s new posts after explicit reveal while scrolled', (count) => {
  mockFeed = paged([post()]);
  const ui = render(shell(<Feed />));
  const list = () => ui.UNSAFE_getByType(FlatList);
  act(() => list().props.onScroll({ nativeEvent: { contentOffset: { y: 100 } } }));
  const chrome = ui.UNSAFE_getAllByType(View).find((x) => x.props.onLayout)!;
  act(() => chrome.props.onLayout({ nativeEvent: { layout: { y: 5, height: 60 } } }));
  act(() => chrome.props.onLayout({ nativeEvent: { layout: { y: 5, height: 60 } } }));
  mockFeed.data = {
    pages: [[...Array.from({ length: count }, (_, i) => post(`new${i}`)), post()]],
  };
  ui.rerender(shell(<Feed />));
  fireEvent.press(ui.getByLabelText(`Show ${count} new ${count === 1 ? 'post' : 'posts'}`));
  expect(ui.UNSAFE_getAllByType(PostCard)).toHaveLength(count + 1);
});
it('bounds refreshing and shares concurrent refresh work', async () => {
  mockFeed.refetch.mockReturnValue(new Promise(() => {}));
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  clients.push(client);
  const spy = jest.spyOn(client, 'refetchQueries');
  client.setQueryData(['userEvent'], {});
  client.setQueryData(['pollResults'], {});
  client.setQueryData(['profile'], {});
  const ui = render(shell(<Feed />, client));
  const refresh = ui.UNSAFE_getByType(FlatList).props.refreshControl.props.onRefresh;
  let a: Promise<void>, b: Promise<void>;
  act(() => {
    a = refresh();
    b = refresh();
  });
  expect(mockFeed.refetch).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledTimes(1);
  const predicate = spy.mock.calls[0][0]!.predicate!;
  for (const q of client.getQueryCache().getAll())
    expect(predicate(q)).toBe(q.queryKey[0] !== 'profile');
  await act(async () => {
    jest.advanceTimersByTime(2500);
    await Promise.all([a!, b!]);
  });
  expect(ui.UNSAFE_getByType(FlatList).props.refreshControl.props.refreshing).toBe(false);
});
it('completed feed refresh allows a later new refresh', async () => {
  const ui = render(shell(<Feed />));
  const refresh = () => ui.UNSAFE_getByType(FlatList).props.refreshControl.props.onRefresh();
  await act(async () => refresh());
  await act(async () => refresh());
  expect(mockFeed.refetch).toHaveBeenCalledTimes(2);
});
it.each(['poll', 'wyr', 'photo', 'video', 'task', 'unknown'])(
  'feed skeleton matches %s challenge shape',
  (kind) => {
    const challenge =
      kind === 'unknown'
        ? undefined
        : ({
            type: kind === 'wyr' ? 'poll' : kind === 'video' ? 'task' : kind,
            poll_kind: kind === 'wyr' ? 'wyr' : 'poll',
            requires_video: kind === 'video',
            requires_photo: kind === 'photo',
          } as Challenge);
    const ui = render(<FeedSkeleton challenge={challenge} />);
    expect(
      ui.getByLabelText(
        kind === 'poll' || kind === 'wyr' ? 'Loading shared challenge' : 'Loading challenge posts',
      ),
    ).toBeTruthy();
  },
);
it.each(['empty', 'loading', 'transient', 'denied'])('rank handles %s reads and retry', (state) => {
  if (state === 'loading') mockRanks.isLoading = true;
  if (state === 'transient' || state === 'denied') {
    mockRanks.data = [rank(4)];
    mockRanks.isError = true;
    mockRanks.error = Object.assign(new Error('request'), {
      status: state === 'transient' ? 504 : 403,
    });
  }
  const ui = render(shell(<Rank />));
  if (state === 'empty') {
    expect(ui.getByText("You're early")).toBeTruthy();
    fireEvent.press(ui.getByText('All time'));
    expect(ui.getByText(/when others join in/)).toBeTruthy();
    fireEvent.press(ui.getByText('Friends'));
    expect(ui.getByText('No friends yet')).toBeTruthy();
  }
  if (state === 'transient') {
    expect(ui.getByText('member4')).toBeTruthy();
    act(() => ui.UNSAFE_getByType(ReadFailureFeedback).props.onRetry());
  }
  if (state === 'denied') {
    expect(ui.queryByText('member4')).toBeNull();
    act(() => ui.UNSAFE_getByType(ErrorState).props.onRetry());
  }
  if (state === 'transient' || state === 'denied')
    expect(mockRanks.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
});
it('rank refreshes and safely handles nameless legacy entries', async () => {
  const entry = rank(4, '');
  Reflect.deleteProperty(entry.profile, 'level');
  mockRanks.data = [entry];
  const ui = render(shell(<Rank />));
  const list = ui.UNSAFE_getByType(FlatList);
  await act(async () => list.props.refreshControl.props.onRefresh());
  expect(mockRanks.refetch).toHaveBeenCalled();
});
it.each([false, true])('friends retries current failed page next=%s', (next) => {
  mockFriends = paged([friend()]);
  mockFriends.isError = true;
  mockFriends.error = Object.assign(new Error('timeout'), { status: 504 });
  mockFriends.isFetchNextPageError = next;
  const ui = render(shell(<Friends />));
  expect(ui.getByText('other')).toBeTruthy();
  act(() => ui.UNSAFE_getByType(ReadFailureFeedback).props.onRetry());
  expect(next ? mockFriends.fetchNextPage : mockFriends.refetch).toHaveBeenCalledWith({
    cancelRefetch: false,
  });
});
it('friends never retains unauthorized data and suppresses error-as-empty state', () => {
  mockFriends = paged([friend()]);
  mockFriends.isError = true;
  mockFriends.error = Object.assign(new Error('denied'), { status: 403 });
  const ui = render(shell(<Friends />));
  expect(ui.queryByText('other')).toBeNull();
  expect(ui.queryByText('No friends yet')).toBeNull();
});
it('friends paginates only while idle and shows empty invitation', () => {
  mockRequestCount = undefined;
  mockFriendCount = undefined;
  const ui = render(shell(<Friends />));
  expect(ui.getByText('No friends yet')).toBeTruthy();
  fireEvent.press(ui.getByText('Find people'));
  expect(mockRouter.push).toHaveBeenCalledWith('/(app)/friends/add');
  mockFriends.hasNextPage = true;
  mockFriends.data = { pages: [[friend()]] };
  mockRequestCount = 1;
  ui.rerender(shell(<Friends />));
  expect(ui.getByText('1 friend request')).toBeTruthy();
  act(() => ui.UNSAFE_getByType(FlatList).props.onEndReached());
  expect(mockFriends.fetchNextPage).toHaveBeenCalledTimes(1);
  mockFriends.isFetching = true;
  mockFriends.isFetchingNextPage = true;
  ui.rerender(shell(<Friends />));
  act(() => ui.UNSAFE_getByType(FlatList).props.onEndReached());
  expect(mockFriends.fetchNextPage).toHaveBeenCalledTimes(1);
});
