import React from 'react';
const mockPrefetchClient = { prefetchQuery: jest.fn().mockResolvedValue(undefined) };
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => mockPrefetchClient,
}));
import { act, fireEvent, render } from '@testing-library/react-native';
import AddFriends from '../../app/(app)/friends/add';
import type { SearchProfile } from '../../hooks/useProfile';

const mockRefetch = jest.fn();
const mockPerson: SearchProfile = {
  id: 'synthetic-other',
  username: 'synthetic_other',
  display_name: 'Synthetic Other',
  avatar_url: null,
  avatar_gradient: ['#111111', '#222222'],
  equipped_border_key: null,
  friendship_status: 'none',
};
let mockSearch: {
  data?: SearchProfile[];
  error: unknown;
  isError: boolean;
  isLoading: boolean;
  isFetching: boolean;
  refetch: typeof mockRefetch;
};
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/friends/add',
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../hooks/useProfile', () => ({
  useSearchUsers: () => mockSearch,
  useSendFriendRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../hooks/useRecentProfileSearches', () => ({
  useRecentProfileSearches: () => ({
    recents: [],
    record: jest.fn(),
    recordQuery: jest.fn(),
    remove: jest.fn(),
    clear: jest.fn(),
  }),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: (select: (s: { profile: { id: string } }) => unknown) =>
    select({ profile: { id: 'self' } }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockSearch = {
    error: { status: 504 },
    isError: true,
    isLoading: false,
    isFetching: false,
    refetch: mockRefetch,
  };
});
afterEach(() => jest.useRealTimers());

function search() {
  const view = render(<AddFriends />);
  fireEvent.changeText(view.getByLabelText('Search people by name or username'), 'synthetic');
  act(() => jest.advanceTimersByTime(250));
  return view;
}

test('failed search is not an empty result and offers an explicit bounded read retry', () => {
  const view = search();
  expect(view.queryByText('No users found for "synthetic"')).toBeNull();
  expect(view.getByText('Could not search people. Please try again.')).toBeTruthy();
  fireEvent.press(view.getByLabelText('Try loading again'));
  expect(mockRefetch).toHaveBeenCalledWith({ cancelRefetch: false });
  mockSearch = { ...mockSearch, isFetching: true };
  view.rerender(<AddFriends />);
  expect(view.getByLabelText('Try loading again').props.accessibilityState.disabled).toBe(true);
  mockSearch = { ...mockSearch, isFetching: false, isError: false, error: null, data: [] };
  view.rerender(<AddFriends />);
  expect(view.getByText('No users found for "synthetic"')).toBeTruthy();
});

test('temporary refresh failure retains results with a warning', () => {
  mockSearch.data = [mockPerson];
  const view = search();
  expect(view.getByText('@synthetic_other')).toBeTruthy();
  expect(view.getByText('Could not refresh people. Showing previous results.')).toBeTruthy();
});

test.each([{ status: 403 }, { code: '42501' }, { message: 'unexpected private error' }])(
  'authorization and unknown failures hide cached results: %j',
  (error) => {
    mockSearch = { ...mockSearch, data: [mockPerson], error };
    const view = search();
    expect(view.queryByText('@synthetic_other')).toBeNull();
    expect(view.getByText('Could not search people. Please try again.')).toBeTruthy();
    expect(view.queryByText('unexpected private error')).toBeNull();
  },
);

test('an older query error does not leak into a newer, short or cleared query', () => {
  const view = search();
  fireEvent.changeText(view.getByLabelText('Search people by name or username'), 'different');
  expect(view.queryByLabelText('Try loading again')).toBeNull();
  expect(view.getByLabelText('Searching people')).toBeTruthy();
  fireEvent.changeText(view.getByLabelText('Search people by name or username'), 'x');
  act(() => jest.advanceTimersByTime(250));
  expect(view.queryByLabelText('Try loading again')).toBeNull();
  expect(view.getByText('Keep typing to search')).toBeTruthy();
  fireEvent.changeText(view.getByLabelText('Search people by name or username'), '');
  expect(view.getByText('Find your people')).toBeTruthy();
  expect(mockRefetch).not.toHaveBeenCalled();
});
