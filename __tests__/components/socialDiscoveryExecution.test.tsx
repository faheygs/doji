import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import { PodiumTopThree } from '../../components/leaderboard/PodiumTopThree';
import { RecentProfileSearchList } from '../../components/friends/RecentProfileSearchList';
import { UserSearchResult } from '../../components/friends/UserSearchResult';
import { MentionAutocomplete } from '../../components/comments/MentionAutocomplete';
import AddFriends from '../../app/(app)/friends/add';
import { PollCard } from '../../components/feed/PollCard';
import type { LeaderboardEntry, Profile } from '../../types/database';
import type { SearchProfile } from '../../hooks/useProfile';
import type { RecentProfileSearch } from '../../lib/recentProfileSearches';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockSend = { mutate: jest.fn(), isPending: false };
let mockMention: { data?: Partial<Profile>[]; isPending: boolean };
let mockSearch: { data?: SearchProfile[]; isLoading: boolean };
let mockDark = false;
const mockAuth = { profile: { id: 'self', username: 'self' }, session: { user: { id: 'self' } } };
const mockRecents = {
  recents: [] as RecentProfileSearch[],
  record: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
};
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
  }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/friends/add',
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../hooks/useProfile', () => ({
  useSendFriendRequest: () => mockSend,
  useSearchUsers: () => mockSearch,
}));
jest.mock('../../hooks/useComments', () => ({ useMentionSearch: () => mockMention }));
jest.mock('../../hooks/useRecentProfileSearches', () => ({
  useRecentProfileSearches: () => mockRecents,
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mockAuth) => unknown) => selector(mockAuth), {
    getState: () => mockAuth,
  }),
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
const person = (id = 'other', display_name = 'Other'): SearchProfile =>
  ({
    id,
    username: id,
    display_name,
    avatar_url: null,
    avatar_gradient: ['#111', '#222'],
    equipped_border_key: null,
    friendship_status: 'none',
  }) as SearchProfile;
const entry = (rank: number, username = `member${rank}`, name = 'Member'): LeaderboardEntry =>
  ({
    rank,
    user_id: username,
    xp: rank * 1000,
    profile: { username, display_name: name, avatar_url: null },
  }) as LeaderboardEntry;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockDark = false;
  mockSend.isPending = false;
  mockMention = { isPending: false };
  mockSearch = { isLoading: false };
  mockRecents.recents = [];
});
afterEach(() => jest.useRealTimers());
describe.each([false, true])('social discovery dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it('renders ordered podium, excludes nonpodium ranks and routes own/other profiles', () => {
    const ui = render(
      <PodiumTopThree
        entries={[entry(1, 'self'), entry(2), entry(3), entry(4, 'excluded')]}
        currentUserId="self"
      />,
    );
    expect(ui.getAllByRole('button').map((x) => x.props.accessibilityLabel)).toEqual([
      'Member, rank 2, 2000 XP',
      'Member, rank 1, 1000 XP',
      'Member, rank 3, 3000 XP',
    ]);
    fireEvent.press(ui.getByLabelText('Member, rank 1, 1000 XP'));
    expect(mockRouter.push).toHaveBeenCalledWith('/(app)/profile');
    fireEvent.press(ui.getByLabelText('Member, rank 2, 2000 XP'));
    expect(String(mockRouter.push.mock.calls[1][0])).toContain('member2');
    expect(ui.queryByText('excluded')).toBeNull();
  });
  it('fills missing ranks with ghosts and handles missing display names', () => {
    const ui = render(<PodiumTopThree entries={[]} />);
    expect(ui.queryAllByRole('button')).toHaveLength(0);
    ui.rerender(<PodiumTopThree entries={[entry(1, '', ''), entry(2, 'username', '')]} />);
    expect(ui.getByText('Player')).toBeTruthy();
    expect(ui.getByText('username')).toBeTruthy();
    fireEvent.press(ui.getByLabelText(', rank 1, 1000 XP'));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
  it('offers recent profile selection, individual removal and clear-all', () => {
    const props = { recents: [], onSelect: jest.fn(), onRemove: jest.fn(), onClear: jest.fn() };
    const ui = render(<RecentProfileSearchList {...props} />);
    expect(ui.getByText('Find your people')).toBeTruthy();
    const p = person(),
      unnamed = person('unnamed', '');
    ui.rerender(<RecentProfileSearchList {...props} recents={[p, unnamed]} />);
    fireEvent.press(ui.getByLabelText("Open Other's profile"));
    expect(props.onSelect).toHaveBeenCalledWith(p);
    fireEvent.press(ui.getByLabelText('Remove unnamed from recent searches'));
    expect(props.onRemove).toHaveBeenCalledWith('unnamed');
    fireEvent.press(ui.getByLabelText('Clear all recent searches'));
    expect(props.onClear).toHaveBeenCalled();
  });
  it.each([
    ['friends', 'Friends'],
    ['pending_out', 'Requested'],
    ['pending_in', 'Requested you'],
    ['blocked', 'Unavailable'],
    ['none', 'Add friend'],
  ] as const)('presents %s friendship state', (friendship_status, label) => {
    const onOpen = jest.fn(),
      user = { ...person(), friendship_status };
    const ui = render(<UserSearchResult user={user} onOpen={onOpen} />);
    expect(ui.getByText(label)).toBeTruthy();
    fireEvent.press(ui.getByText('Other'));
    expect(onOpen).toHaveBeenCalledWith(user);
    if (friendship_status === 'none') {
      fireEvent.press(ui.getByText('Add friend'));
      expect(mockSend.mutate).toHaveBeenCalledWith({ addresseeId: 'other' });
      mockSend.isPending = true;
      ui.rerender(<UserSearchResult user={user} onOpen={onOpen} />);
      expect(ui.queryByText('Add friend')).toBeNull();
    }
  });
  it('distinguishes hidden, loading, empty and loaded mention results', () => {
    const onSelect = jest.fn();
    const ui = render(<MentionAutocomplete query="o" visible={false} onSelect={onSelect} />);
    expect(ui.toJSON()).toBeNull();
    ui.rerender(<MentionAutocomplete query="o" visible onSelect={onSelect} />);
    expect(ui.getByText('No matches in your network')).toBeTruthy();
    mockMention.isPending = true;
    ui.rerender(<MentionAutocomplete query="o" visible onSelect={onSelect} />);
    expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    mockMention = { isPending: false, data: [person(), person('unnamed', '')] };
    ui.rerender(<MentionAutocomplete query="o" visible onSelect={onSelect} />);
    fireEvent.press(ui.getByLabelText('Mention @other'));
    expect(onSelect).toHaveBeenCalledWith('other');
    expect(ui.getByText('@unnamed')).toBeTruthy();
  });
  it('renders poll answer attribution without exposing another user action', () => {
    const ui = render(<PollCard username="synthetic" optionText="Yes" />);
    expect(ui.getByText('@synthetic voted')).toBeTruthy();
    expect(ui.getByText('"Yes"')).toBeTruthy();
  });
});
it('find-people debounces, filters self and preserves origin when opening results', () => {
  mockSearch.data = [person('self'), person()];
  const ui = render(<AddFriends />);
  expect(ui.getByText('Find your people')).toBeTruthy();
  fireEvent.changeText(ui.getByLabelText('Search people by username'), 'o');
  act(() => jest.advanceTimersByTime(250));
  fireEvent.changeText(ui.getByLabelText('Search people by username'), 'other');
  expect(ui.getByLabelText('Searching people')).toBeTruthy();
  act(() => jest.advanceTimersByTime(250));
  expect(ui.queryByText('@self')).toBeNull();
  fireEvent.press(ui.getByText('@other'));
  expect(mockRecents.record).toHaveBeenCalledWith(person());
  expect(String(mockRouter.push.mock.calls[0][0])).toContain('other');
  expect(ui.getByLabelText('Search people by username').props.value).toBe('');
});
it('find-people supports no matches, short query, recents and back', () => {
  const ui = render(<AddFriends />);
  fireEvent.press(ui.UNSAFE_getAllByType(TouchableOpacity)[0]);
  expect(mockRouter.back).toHaveBeenCalled();
  fireEvent.changeText(ui.getByLabelText('Search people by username'), 'x');
  act(() => jest.advanceTimersByTime(250));
  expect(ui.getByText('Keep typing to search')).toBeTruthy();
  fireEvent.changeText(ui.getByLabelText('Search people by username'), 'missing');
  act(() => jest.advanceTimersByTime(250));
  expect(ui.getByText('No users found for "missing"')).toBeTruthy();
  mockRecents.recents = [person()];
  fireEvent.changeText(ui.getByLabelText('Search people by username'), '');
  fireEvent.press(ui.getByLabelText("Open Other's profile"));
  expect(mockRecents.record).toHaveBeenCalledWith(person());
});
