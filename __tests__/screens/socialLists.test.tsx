import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import BlockedUsersScreen from '../../app/(app)/profile/blocked-users';
import FriendRequestsScreen from '../../app/(app)/friends/requests';
import { lightColors, darkColors } from '../../constants/theme';
import Toast from 'react-native-toast-message';

// Screens and shared UI are real; only query/mutation, platform and router
// boundaries are synthetic. No session, database or provider is contacted.
const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() };
let mockReturnTo: string | undefined;
let mockColors = lightColors;
const person = {
  id: 'person-a',
  username: 'person_a',
  display_name: 'Person A',
  avatar_url: null,
  avatar_gradient: ['#111', '#222'],
  equipped_border_key: 'border_gold',
};
type RequestRow = { id: string; requester: typeof person | null; created_at: string };
const mockBlocked = {
  data: undefined as { pages: Array<Array<typeof person>> } | undefined,
  isLoading: false,
  refetch: jest.fn(),
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetching: false,
  isError: false,
  isFetchNextPageError: false,
  error: null as unknown,
};
const mockRequests = {
  data: undefined as { pages: RequestRow[][] } | undefined,
  isLoading: false,
  refetch: jest.fn(),
  fetchNextPage: jest.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetching: false,
  isError: false,
  isFetchNextPageError: false,
  error: null as unknown,
};
const mockUnblock = { mutate: jest.fn(), isPending: false };
const mockRespond = { mutate: jest.fn(), isPending: false, isError: false };
const mockBegin = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ returnTo: mockReturnTo }),
  usePathname: () => '/(app)/friends/requests',
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock('../../hooks/useBlockUser', () => ({
  useBlockedUsersPaged: () => mockBlocked,
  useUnblockUser: () => mockUnblock,
}));
jest.mock('../../hooks/useFriendRequests', () => ({
  useFriendRequests: () => mockRequests,
  useRespondToFriendRequest: () => mockRespond,
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ profile: { username: 'viewer' } }) },
}));
jest.mock('../../stores/useProfileNavigationStore', () => ({
  useProfileNavigationStore: { getState: () => ({ begin: mockBegin, clear: jest.fn() }) },
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockColors = lightColors;
  mockReturnTo = undefined;
  mockRouter.canGoBack.mockReturnValue(false);
  Object.assign(mockBlocked, {
    data: undefined,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  Object.assign(mockRequests, {
    data: undefined,
    isLoading: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
  mockBlocked.refetch.mockResolvedValue(undefined);
  for (const query of [mockBlocked, mockRequests]) {
    Object.assign(query, {
      isFetching: false,
      isError: false,
      isFetchNextPageError: false,
      error: null,
    });
    query.refetch.mockResolvedValue(undefined);
    query.fetchNextPage.mockResolvedValue(undefined);
  }
  mockUnblock.isPending = false;
  mockRespond.isPending = false;
  mockRespond.isError = false;
});

describe.each(['blocked', 'requests'] as const)('%s read recovery', (kind) => {
  const query = kind === 'blocked' ? mockBlocked : mockRequests;
  const Screen = kind === 'blocked' ? BlockedUsersScreen : FriendRequestsScreen;
  const empty = kind === 'blocked' ? "You haven't blocked anyone." : 'No pending friend requests';
  const message =
    kind === 'blocked'
      ? 'Could not load blocked users. Please try again.'
      : 'Could not load friend requests. Please try again.';
  const seed = () => {
    mockBlocked.data = { pages: [[person]] };
    mockRequests.data = {
      pages: [[{ id: 'friendship-1', requester: person, created_at: '2026-10-01T12:00:00Z' }]],
    };
  };

  test('cold failure is not empty success; explicit retry preserves an in-flight read', () => {
    Object.assign(query, {
      error: { status: 504, message: 'private raw diagnostic' },
      isError: true,
    });
    const view = render(<Screen />);
    expect(view.queryByText(empty)).toBeNull();
    expect(view.queryByText('No blocked users')).toBeNull();
    expect(view.queryByText('private raw diagnostic')).toBeNull();
    expect(view.getByText(message)).toBeTruthy();
    fireEvent.press(view.getByLabelText('Try loading again'));
    expect(query.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
    Object.assign(query, { error: null, isError: false });
    view.rerender(<Screen />);
    expect(view.getByText(empty)).toBeTruthy();
    expect(view.queryByText(message)).toBeNull();
  });

  test.each([401, 403, 400])('status %i hides cached identities and actions', (status) => {
    seed();
    Object.assign(query, { error: { status }, isError: true });
    const view = render(<Screen />);
    expect(view.queryByText('Person A')).toBeNull();
    expect(view.queryByText(empty)).toBeNull();
    expect(view.getByText(message)).toBeTruthy();
    expect(view.queryByRole('button', { name: 'Unblock' })).toBeNull();
    expect(view.queryByLabelText('Accept friend request from Person A')).toBeNull();
  });

  test('transient refresh keeps authorized cached rows with persistent recovery feedback', () => {
    seed();
    Object.assign(query, { error: { status: 504 }, isError: true });
    const view = render(<Screen />);
    expect(view.getByText('Person A')).toBeTruthy();
    expect(view.getByText(message)).toBeTruthy();
    query.isFetching = true;
    view.rerender(<Screen />);
    expect(view.getByLabelText('Try loading again')).toBeDisabled();
    fireEvent.press(view.getByLabelText('Try loading again'));
    expect(query.refetch).not.toHaveBeenCalled();
  });

  test('failed pagination waits for explicit retry of the same next page', () => {
    seed();
    Object.assign(query, {
      error: { status: 504 },
      isError: true,
      isFetchNextPageError: true,
      hasNextPage: true,
    });
    const view = render(<Screen />);
    fireEvent(view.UNSAFE_getByType(FlatList), 'onEndReached');
    expect(query.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Try loading again'));
    expect(query.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(query.refetch).not.toHaveBeenCalled();
  });

  test('pagination does not compete with an active background refresh', () => {
    seed();
    Object.assign(query, { isFetching: true, hasNextPage: true });
    const view = render(<Screen />);
    fireEvent(view.UNSAFE_getByType(FlatList), 'onEndReached');
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });
});
test.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)(
  'blocked screen renders exact paged identities using shared UI in %s',
  (_name, colors) => {
    mockColors = colors;
    mockBlocked.data = {
      pages: [[person], [{ ...person, id: 'b', display_name: ' ', username: 'person_b' }]],
    };
    const view = render(<BlockedUsersScreen />);
    expect(view.getByText('2 users')).toBeTruthy();
    expect(view.getByText('Person A')).toBeTruthy();
    expect(view.getByText('person_b')).toBeTruthy();
    expect(view.getAllByRole('button', { name: 'Unblock' })).toHaveLength(2);
    expect(view.UNSAFE_getByType(FlatList).props.removeClippedSubviews).toBe(false);
  },
);
test('blocked initial loading is not shown as an empty result; an empty successful list is explicit', () => {
  mockBlocked.isLoading = true;
  const view = render(<BlockedUsersScreen />);
  expect(view.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  expect(view.queryByText("You haven't blocked anyone.")).toBeNull();
  mockBlocked.isLoading = false;
  view.rerender(<BlockedUsersScreen />);
  expect(view.getByText("You haven't blocked anyone.")).toBeTruthy();
  expect(view.getByText('No blocked users')).toBeTruthy();
});
test('unblock uses the selected identity; failure remains inline and retry clears it before success', () => {
  mockBlocked.data = { pages: [[person]] };
  const view = render(<BlockedUsersScreen />);
  expect(view.getByText('1 user')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'Unblock' }));
  expect(mockUnblock.mutate).toHaveBeenCalledWith({ blockedUserId: person.id }, expect.any(Object));
  act(() => mockUnblock.mutate.mock.calls[0][1].onError());
  expect(view.getByText('Could not unblock this user. Please try again.')).toBeTruthy();
  expect(Toast.show).not.toHaveBeenCalled();
  fireEvent.press(view.getByRole('button', { name: 'Unblock' }));
  expect(view.queryByText('Could not unblock this user. Please try again.')).toBeNull();
  act(() => mockUnblock.mutate.mock.calls[1][1].onSuccess());
  expect(Toast.show).toHaveBeenCalledWith({ type: 'success', text1: 'Person A unblocked' });
});
test('pending unblock disables shared buttons against repeat presses', () => {
  mockBlocked.data = { pages: [[person]] };
  mockUnblock.isPending = true;
  const view = render(<BlockedUsersScreen />);
  const buttons = view.getAllByRole('button');
  const busy = buttons.find((b) => b.props.accessibilityState?.busy);
  expect(busy).toBeDefined();
  expect(busy!).toBeDisabled();
  fireEvent.press(busy!);
  expect(mockUnblock.mutate).not.toHaveBeenCalled();
});
test.each([
  [false, false, 0],
  [true, true, 0],
  [true, false, 1],
] as const)(
  'blocked pagination hasNext=%s fetching=%s issues %i request',
  (hasNextPage, isFetchingNextPage, count) => {
    Object.assign(mockBlocked, { hasNextPage, isFetchingNextPage });
    const view = render(<BlockedUsersScreen />);
    fireEvent(view.UNSAFE_getByType(FlatList), 'onEndReached');
    expect(mockBlocked.fetchNextPage).toHaveBeenCalledTimes(count);
  },
);
test('manual refresh keeps the list visible and does not cancel an authoritative in-flight read', async () => {
  let finish!: () => void;
  mockBlocked.data = { pages: [[person]] };
  mockBlocked.refetch.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const view = render(<BlockedUsersScreen />);
  fireEvent(view.UNSAFE_getByType(RefreshControl), 'refresh');
  expect(mockBlocked.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
  expect(view.getByText('Person A')).toBeTruthy();
  expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(true);
  await act(async () => {
    finish();
  });
  expect(view.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
});
test('Back honors real history first, otherwise the explicit or settings fallback', () => {
  mockReturnTo = '/(app)/friends';
  mockRouter.canGoBack.mockReturnValue(true);
  const view = render(<BlockedUsersScreen />);
  fireEvent.press(view.getByRole('button', { name: 'Back' }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();
  mockRouter.canGoBack.mockReturnValue(false);
  fireEvent.press(view.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/(app)/friends');
  mockReturnTo = undefined;
  view.rerender(<BlockedUsersScreen />);
  fireEvent.press(view.getByRole('button', { name: 'Back' }));
  expect(mockRouter.replace).toHaveBeenLastCalledWith('/(app)/profile/settings');
});
test('friend request loading and empty success are different states', () => {
  mockRequests.isLoading = true;
  const view = render(<FriendRequestsScreen />);
  expect(view.queryByText('No pending friend requests')).toBeNull();
  expect(view.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  mockRequests.isLoading = false;
  view.rerender(<FriendRequestsScreen />);
  expect(view.getByText('No pending friend requests')).toBeTruthy();
});
test.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)(
  'friend request %s UI dispatches the exact friendship ID and desired state',
  (_name, colors) => {
    mockColors = colors;
    mockRequests.data = {
      pages: [[{ id: 'friendship-1', requester: person, created_at: '2026-10-01T12:00:00Z' }]],
    };
    const view = render(<FriendRequestsScreen />);
    fireEvent.press(view.getByRole('button', { name: 'Accept friend request from Person A' }));
    fireEvent.press(view.getByRole('button', { name: 'Decline friend request from Person A' }));
    expect(mockRespond.mutate.mock.calls).toEqual([
      [{ friendshipId: 'friendship-1', accept: true }],
      [{ friendshipId: 'friendship-1', accept: false }],
    ]);
    fireEvent.press(view.getByRole('button', { name: 'View Person A profile' }));
    expect(mockBegin).toHaveBeenCalledWith('person_a');
    expect(mockRouter.push).toHaveBeenCalledWith(
      '/(app)/member/person_a?returnTo=%2F(app)%2Ffriends%2Frequests',
    );
  },
);
test('missing requester has safe labels and cannot navigate to a fabricated profile', () => {
  mockRequests.data = {
    pages: [[{ id: 'friendship-1', requester: null, created_at: '2026-10-01T12:00:00Z' }]],
  };
  const view = render(<FriendRequestsScreen />);
  expect(view.getByText('Unknown')).toBeTruthy();
  fireEvent.press(view.getByRole('button', { name: 'View requester profile' }));
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'Accept friend request from this user' })).toBeTruthy();
});
test('pending friendship response disables both actions, but keeps the profile accessible', () => {
  mockRequests.data = {
    pages: [[{ id: 'friendship-1', requester: person, created_at: '2026-10-01T12:00:00Z' }]],
  };
  mockRespond.isPending = true;
  const view = render(<FriendRequestsScreen />);
  for (const action of ['Accept', 'Decline']) {
    const button = view.getByRole('button', { name: `${action} friend request from Person A` });
    expect(button).toBeDisabled();
    fireEvent.press(button);
  }
  expect(mockRespond.mutate).not.toHaveBeenCalled();
  expect(view.getByRole('button', { name: 'View Person A profile' })).not.toBeDisabled();
});

test('failed friend response stays inline with the restored request and clears on the next action', () => {
  mockRequests.data = {
    pages: [[{ id: 'friendship-1', requester: person, created_at: '2026-10-01T12:00:00Z' }]],
  };
  mockRespond.isError = true;
  const view = render(<FriendRequestsScreen />);
  const message = 'Could not respond to this friend request. Please try again.';
  expect(view.getByText(message)).toBeTruthy();
  expect(view.getByText('Person A')).toBeTruthy();
  expect(Toast.show).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText('Accept friend request from Person A'));
  expect(mockRespond.mutate).toHaveBeenCalledWith({ friendshipId: 'friendship-1', accept: true });
  mockRespond.isError = false;
  mockRespond.isPending = true;
  view.rerender(<FriendRequestsScreen />);
  expect(view.queryByText(message)).toBeNull();
});
test.each([
  [false, false, 0],
  [true, true, 0],
  [true, false, 1],
] as const)(
  'friend pagination hasNext=%s fetching=%s issues %i request',
  (hasNextPage, isFetchingNextPage, count) => {
    Object.assign(mockRequests, { hasNextPage, isFetchingNextPage });
    const view = render(<FriendRequestsScreen />);
    fireEvent(view.UNSAFE_getByType(FlatList), 'onEndReached');
    expect(mockRequests.fetchNextPage).toHaveBeenCalledTimes(count);
    fireEvent.press(view.getByRole('button', { name: 'Back' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/friends');
  },
);
