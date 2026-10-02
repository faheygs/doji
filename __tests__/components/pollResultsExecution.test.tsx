import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ActivityIndicator, FlatList, Modal, Platform } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PollResultCard } from '../../components/feed/PollResultCard';
import { lightColors, darkColors } from '../../constants/theme';
import type { Challenge } from '../../types/database';

let mockColors = lightColors;
const mockSummary = jest.fn(),
  mockVoters = jest.fn(),
  mockReport = jest.fn();
const mockRouter = { push: jest.fn() };
const mockSend = { mutate: jest.fn(), isPending: false },
  mockLike = { mutate: jest.fn(), isPending: false };
const mockAuth = { session: { user: { id: 'self' } }, profile: { username: 'self' } };
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/feed',
  useLocalSearchParams: () => ({}),
}));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuth) => unknown) => selector(mockAuth),
    { getState: () => mockAuth },
  ),
}));
jest.mock('../../lib/pollQueries', () => ({
  fetchPollSummary: (...args: unknown[]) => mockSummary(...args),
  fetchPollVotersPage: (...args: unknown[]) => mockVoters(...args),
}));
jest.mock('../../hooks/useProfile', () => ({ useSendFriendRequest: () => mockSend }));
jest.mock('../../hooks/usePollVoteLikes', () => ({ useTogglePollVoteLike: () => mockLike }));
jest.mock('../../contexts/ReportFlowContext', () => ({ useReportFlow: () => mockReport }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const originalPlatform = Platform.OS;
const challenge = {
  id: 'challenge',
  type: 'poll',
  title: 'Choose a season',
  poll_kind: 'poll',
  xp_reward: 50,
} as Challenge;
const voter = (id = 'other', extra: Record<string, unknown> = {}) => ({
  user_id: id,
  vote_id: `vote-${id}`,
  created_at: '2026-10-01T00:00:00Z',
  username: id,
  display_name: `Member ${id}`,
  avatar_url: null,
  equipped_border_key: null,
  friendship_status: 'none',
  ...extra,
});
const summary = (id = 'spring', count = 3, extra: Record<string, unknown> = {}) => ({
  option_id: id,
  challenge_id: 'challenge',
  option_text: id,
  option_position: 0,
  option_is_other: false,
  option_created_at: '2026-10-01T00:00:00Z',
  vote_count: count,
  is_my_vote: false,
  preview_voters: [],
  ...extra,
});
const clients: QueryClient[] = [];
function mount(props: Partial<React.ComponentProps<typeof PollResultCard>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const tree = (changes: Partial<React.ComponentProps<typeof PollResultCard>> = {}) => (
    <QueryClientProvider client={client}>
      <PollResultCard challenge={challenge} dailyEventId="event" {...props} {...changes} />
    </QueryClientProvider>
  );
  const ui = render(tree());
  return {
    ...ui,
    client,
    update: (changes: Partial<React.ComponentProps<typeof PollResultCard>>) =>
      ui.rerender(tree(changes)),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockColors = lightColors;
  Platform.OS = 'android';
  mockSummary.mockResolvedValue([summary()]);
  mockVoters.mockResolvedValue([voter()]);
  mockSend.isPending = false;
  mockLike.isPending = false;
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  Platform.OS = originalPlatform;
});

it('does not read locked results and distinguishes no-vote totals', async () => {
  const ui = mount({ fetchEnabled: false });
  expect(ui.getByText('Results unlock after you vote.')).toBeTruthy();
  expect(mockSummary).not.toHaveBeenCalled();
  mockSummary.mockResolvedValue([summary('empty', 0)]);
  ui.update({ fetchEnabled: true });
  await waitFor(() => expect(ui.getByLabelText('empty, 0 percent.')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('empty, 0 percent.'));
  expect(ui.UNSAFE_queryByType(Modal)).toBeNull();
});
it.each(['everyone', 'friends'] as const)(
  'shows authoritative %s totals, current vote, avatars and excess count',
  async (feedAudience) => {
    mockColors = darkColors;
    mockSummary.mockResolvedValue([
      summary('spring', 4, { is_my_vote: true, preview_voters: [voter('a'), voter('b')] }),
      summary('winter', 1),
    ]);
    const ui = mount({ feedAudience, variant: 'embedded' });
    await waitFor(() => expect(ui.getByText('spring ✓')).toBeTruthy());
    expect(ui.getByText('80%')).toBeTruthy();
    expect(ui.getByText('+2')).toBeTruthy();
    expect(
      ui.getByText(feedAudience === 'friends' ? '5 votes from friends' : '5 votes'),
    ).toBeTruthy();
    expect(mockSummary).toHaveBeenCalledWith('event', feedAudience, expect.any(AbortSignal));
    fireEvent.press(ui.getByLabelText('4 voters for spring'));
    await waitFor(() => expect(ui.getByText('Member other')).toBeTruthy());
    expect(mockVoters).toHaveBeenCalledWith(
      'event',
      'spring',
      feedAudience,
      null,
      expect.any(AbortSignal),
    );
    fireEvent.press(ui.getByLabelText('Dismiss voter list'));
    await waitFor(() => expect(ui.UNSAFE_queryByType(Modal)).toBeNull());
  },
);
it('filters other responses out of a would-you-rather challenge', async () => {
  mockSummary.mockResolvedValue([
    summary('A', 1),
    summary('B', 0),
    summary('Other', 20, { option_is_other: true }),
  ]);
  const ui = mount({ challenge: { ...challenge, poll_kind: 'wyr' } });
  await waitFor(() => expect(ui.getByText('1 vote')).toBeTruthy());
  expect(ui.queryByText('Other')).toBeNull();
  expect(ui.getByText('100%')).toBeTruthy();
});
it('handles missing summary and preview data without inventing votes', async () => {
  mockSummary.mockResolvedValue(null);
  const ui = mount();
  await waitFor(() => expect(mockSummary).toHaveBeenCalled());
  expect(ui.getByText('0 votes')).toBeTruthy();
  mockSummary.mockResolvedValue([summary('first', 1, { preview_voters: null })]);
  await act(async () => {
    await ui.client.invalidateQueries({ queryKey: ['pollResults'] });
  });
  await waitFor(() => expect(ui.getByText('1 vote')).toBeTruthy());
});

it.each(['self', 'friends', 'pending_out', 'none'] as const)(
  'respects %s voter friendship state',
  async (friendship_status) => {
    mockVoters.mockResolvedValue([
      voter(friendship_status === 'self' ? 'self' : 'other', {
        friendship_status,
        display_name: '',
        equipped_border_key: 'border_gold',
      }),
    ]);
    mockSend.mutate.mockImplementation((_, callbacks) => callbacks.onSuccess());
    const ui = mount();
    await waitFor(() => expect(ui.getByLabelText('3 voters for spring')).toBeTruthy());
    fireEvent.press(ui.getByLabelText('3 voters for spring'));
    await waitFor(() =>
      expect(
        ui.getByLabelText(`Open @${friendship_status === 'self' ? 'self' : 'other'} profile`),
      ).toBeTruthy(),
    );
    if (friendship_status === 'self' || friendship_status === 'friends') {
      expect(ui.queryByText('+ Friend')).toBeNull();
      return;
    }
    fireEvent.press(ui.getByText(friendship_status === 'pending_out' ? 'Pending' : '+ Friend'));
    expect(mockSend.mutate).toHaveBeenCalledTimes(friendship_status === 'none' ? 1 : 0);
  },
);
it.each(['ios', 'android'] as const)(
  'waits for %s voter dismissal before profile navigation',
  async (os) => {
    Platform.OS = os;
    const ui = mount();
    await waitFor(() => expect(ui.getByLabelText('3 voters for spring')).toBeTruthy());
    fireEvent.press(ui.getByLabelText('3 voters for spring'));
    await waitFor(() => expect(ui.getByLabelText('Open @other profile')).toBeTruthy());
    fireEvent.press(ui.getByLabelText('Open @other profile'));
    expect(mockRouter.push).not.toHaveBeenCalled();
    if (os === 'ios') fireEvent(ui.UNSAFE_getByType(Modal), 'dismiss');
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
  },
);
it.each([false, true])(
  'likes other-answer text using current selection %s and opens deliberate report flow',
  async (liked) => {
    mockSummary.mockResolvedValue([summary('Other', 1, { option_is_other: true })]);
    mockVoters.mockResolvedValue([
      voter('other', {
        my_like: liked,
        like_count: liked ? 2 : undefined,
        custom_text: ' Summer ',
        display_name: null,
      }),
    ]);
    const ui = mount();
    await waitFor(() => expect(ui.getByLabelText('1 voters for Other')).toBeTruthy());
    fireEvent.press(ui.getByLabelText('Other, 100 percent. Tap to see voters.'));
    await waitFor(() => expect(ui.getByText('"Summer"')).toBeTruthy());
    fireEvent.press(ui.getByLabelText(liked ? 'Unlike this answer' : 'Like this answer'));
    expect(mockLike.mutate).toHaveBeenCalledWith({ pollVoteId: 'vote-other', liked });
    fireEvent.press(ui.getByLabelText('Report this answer'));
    expect(mockReport).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mockReport).toHaveBeenCalledWith({
        reportedUserId: 'other',
        pollVoteId: 'vote-other',
      }),
    );
  },
);
it('blocks duplicate friend and like writes while pending', async () => {
  mockSummary.mockResolvedValue([summary('Other', 1, { option_is_other: true })]);
  mockVoters.mockResolvedValue([voter()]);
  mockLike.isPending = true;
  mockSend.isPending = true;
  const ui = mount();
  await waitFor(() => expect(ui.getByLabelText('1 voters for Other')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('1 voters for Other'));
  await waitFor(() => expect(ui.getByLabelText('Like this answer')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('Like this answer'));
  fireEvent.press(ui.getByText('+ Friend'));
  expect(mockLike.mutate).not.toHaveBeenCalled();
  expect(mockSend.mutate).not.toHaveBeenCalled();
});
it('paginates a full voter page once and exposes the pending footer', async () => {
  const rows = Array.from({ length: 40 }, (_, i) => voter(`v${i}`));
  let resolve!: (rows: unknown[]) => void;
  mockVoters.mockResolvedValueOnce(rows).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const ui = mount();
  await waitFor(() => expect(ui.getByLabelText('3 voters for spring')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('3 voters for spring'));
  await waitFor(() => expect(ui.getByLabelText('Open @v0 profile')).toBeTruthy());
  fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
  await waitFor(() => expect(mockVoters).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy());
  fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
  expect(mockVoters).toHaveBeenCalledTimes(2);
  expect(mockVoters.mock.calls[1][3]).toEqual({
    createdAt: rows[39].created_at,
    id: rows[39].vote_id,
  });
  await act(async () => resolve([]));
  await waitFor(() => expect(ui.UNSAFE_queryByType(ActivityIndicator)).toBeNull());
  fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
  expect(mockVoters).toHaveBeenCalledTimes(2);
});
it.each([0, 800])('handles a sheet drag with velocity %s', async (velocityY) => {
  const ui = mount();
  await waitFor(() => expect(ui.getByLabelText('3 voters for spring')).toBeTruthy());
  fireEvent.press(ui.getByLabelText('3 voters for spring'));
  await waitFor(() => expect(ui.UNSAFE_getByType(GestureDetector)).toBeTruthy());
  const handlers = ui.UNSAFE_getByType(GestureDetector).props.gesture.handlers;
  act(() => {
    handlers.onStart({});
    handlers.onUpdate({ translationY: 5 });
    handlers.onEnd({ velocityY });
  });
  if (velocityY) await waitFor(() => expect(ui.UNSAFE_queryByType(Modal)).toBeNull());
  else {
    expect(ui.UNSAFE_getByType(Modal)).toBeTruthy();
    fireEvent(ui.UNSAFE_getByType(Modal), 'requestClose');
    await waitFor(() => expect(ui.UNSAFE_queryByType(Modal)).toBeNull());
  }
});
