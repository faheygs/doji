import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, FlatList } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lightColors } from '../../constants/theme';
import { ReactionBar } from '../../components/feed/ReactionBar';
import { ReactionVotersSheet } from '../../components/reactions/ReactionVotersSheet';
import { REACTION_CONTROLS } from '../../components/icons/Icons';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import type { Post, Reaction, ReactionEmoji } from '../../types/database';

let mockColors = lightColors;
const mockToggle = { mutate: jest.fn(), isPending: false };
const mockSend = { mutate: jest.fn(), isPending: false };
const mockRouter = { push: jest.fn() };
const mockAuth = { session: { user: { id: 'self' } }, profile: { username: 'self' } };
const mockRows = {
  data: undefined as { pages: Reaction[][] } | undefined,
  isPending: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
  hasNextPage: false,
};
jest.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ colors: mockColors }) }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/feed',
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../hooks/useFeed', () => ({
  useToggleReaction: () => mockToggle,
  usePostReactions: () => mockRows,
}));
jest.mock('../../hooks/useProfile', () => ({ useSendFriendRequest: () => mockSend }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (selector: (state: typeof mockAuth) => unknown) => selector(mockAuth),
    { getState: () => mockAuth },
  ),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const clients: QueryClient[] = [];
const breakdown = (emoji: string, count: number): Record<ReactionEmoji, number> => ({
  fire: 0,
  like: 0,
  laugh: 0,
  wow: 0,
  heart: 0,
  dislike: 0,
  [emoji]: count,
});
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
const post = (overrides: Partial<Post> = {}): Post =>
  ({
    id: 'post',
    comment_count: 5,
    reaction_count: 2,
    reaction_breakdown: { [REACTION_CONTROLS[0].emoji]: 2 },
    my_reactions: [],
    ...overrides,
  }) as Post;
const reaction = (overrides: Partial<Reaction> = {}): Reaction =>
  ({
    id: 'reaction',
    user_id: 'other',
    emoji: REACTION_CONTROLS[0].emoji,
    profile: { username: 'other', display_name: 'Other', avatar_url: null },
    friendship_status: 'none',
    ...overrides,
  }) as Reaction;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockColors = lightColors;
  mockToggle.isPending = false;
  mockSend.isPending = false;
  Object.assign(mockRows, {
    data: undefined,
    isPending: false,
    isFetchingNextPage: false,
    hasNextPage: false,
  });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  jest.useRealTimers();
});

describe('reaction controls', () => {
  it.each(REACTION_CONTROLS)(
    'toggles $label with exact post, audience and current selection',
    ({ emoji, label }) => {
      const ui = render(
        shell(
          <ReactionBar
            post={post({
              my_reactions: [emoji as ReactionEmoji],
              reaction_breakdown: breakdown(emoji, 3),
            })}
            blurred={false}
            onOpenComments={jest.fn()}
            feedAudience="friends"
          />,
        ),
      );
      fireEvent.press(ui.getByLabelText(`${label} reaction, 3. Selected.`));
      expect(mockToggle.mutate).toHaveBeenCalledWith({
        postId: 'post',
        emoji,
        active: true,
        feedAudience: 'friends',
      });
    },
  );
  it('opens comments from the authoritative total and ignores disabled controls', () => {
    const comments = jest.fn();
    const props = { post: post(), onOpenComments: comments };
    const ui = render(shell(<ReactionBar {...props} blurred={false} />));
    fireEvent.press(ui.getByLabelText('Comments, 5. Open comments.'));
    expect(comments).toHaveBeenCalledTimes(1);
    ui.rerender(shell(<ReactionBar {...props} blurred />));
    fireEvent.press(ui.getByLabelText('Comments, 5. Open comments.'));
    fireEvent.press(ui.getAllByLabelText(/reaction, /)[0]);
    expect(comments).toHaveBeenCalledTimes(1);
    expect(mockToggle.mutate).not.toHaveBeenCalled();
    mockToggle.isPending = true;
    ui.rerender(
      shell(<ReactionBar {...props} post={post({ comment_count: 0 })} blurred={false} />),
    );
    fireEvent.press(ui.getAllByLabelText(/reaction, /)[0]);
    expect(mockToggle.mutate).not.toHaveBeenCalled();
  });
  it('opens only nonempty reaction lists and closes the actual sheet', () => {
    const ui = render(
      shell(<ReactionBar post={post()} blurred={false} onOpenComments={jest.fn()} />),
    );
    fireEvent.press(ui.getByLabelText(`View who reacted with ${REACTION_CONTROLS[1].label}`));
    expect(ui.queryByLabelText('Close')).toBeNull();
    fireEvent.press(ui.getByLabelText(`View who reacted with ${REACTION_CONTROLS[0].label}`));
    expect(ui.getByText(`Reacted with ${REACTION_CONTROLS[0].label} · 0`)).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Close'));
    expect(ui.queryByLabelText('Close')).toBeNull();
  });
  it('rerenders each memoized contract when it changes and retains unchanged render', () => {
    const comments = jest.fn();
    let data = post();
    const client = new QueryClient();
    clients.push(client);
    const tree = (p: React.ComponentProps<typeof ReactionBar>) => (
      <QueryClientProvider client={client}>
        <KeyboardToolbarProvider>
          <ReactionBar {...p} />
        </KeyboardToolbarProvider>
      </QueryClientProvider>
    );
    let props: React.ComponentProps<typeof ReactionBar> = {
      post: data,
      blurred: false,
      onOpenComments: comments,
    };
    const ui = render(tree(props));
    ui.rerender(tree({ ...props }));
    for (const patch of [
      { comment_count: 6 },
      { reaction_count: 8 },
      { my_reactions: [REACTION_CONTROLS[0].emoji as ReactionEmoji] },
      { reaction_breakdown: breakdown(REACTION_CONTROLS[0].emoji, 9) },
      { id: 'other' },
      { my_reactions: undefined, reaction_breakdown: undefined },
    ]) {
      data = { ...data, ...patch };
      props = { ...props, post: data };
      ui.rerender(tree(props));
    }
    for (const patch of [
      { showTopBorder: false },
      { feedAudience: 'friends' as const },
      { onOpenComments: jest.fn() },
      { blurred: true },
    ]) {
      props = { ...props, ...patch };
      ui.rerender(tree(props));
    }
    expect(ui.getByLabelText('Comments, 6. Open comments.')).toBeTruthy();
  });
});

describe('reaction voter sheet', () => {
  it.each(['everyone', 'friends'] as const)(
    'presents empty and loading %s scope distinctly',
    (feedAudience) => {
      const props = { visible: true, postId: 'post', onClose: jest.fn(), feedAudience };
      const ui = render(shell(<ReactionVotersSheet {...props} />));
      expect(
        ui.getByText(
          feedAudience === 'friends' ? 'No reactions from friends yet.' : 'No reactions yet.',
        ),
      ).toBeTruthy();
      mockRows.isPending = true;
      ui.rerender(shell(<ReactionVotersSheet {...props} />));
      expect(ui.getByLabelText('Loading reactions')).toBeTruthy();
    },
  );
  it('filters normalized emojis and paginates without duplicate loads', () => {
    mockRows.data = {
      pages: [
        [reaction(), reaction({ id: 'other', emoji: REACTION_CONTROLS[1].emoji as ReactionEmoji })],
      ],
    };
    mockRows.hasNextPage = true;
    const props = {
      visible: true,
      postId: 'post',
      onClose: jest.fn(),
      emojiFilter: REACTION_CONTROLS[0].emoji as ReactionEmoji,
    };
    const ui = render(shell(<ReactionVotersSheet {...props} />));
    expect(ui.getByText(`Reacted with ${REACTION_CONTROLS[0].label} · 1+`)).toBeTruthy();
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockRows.fetchNextPage).toHaveBeenCalledTimes(1);
    mockRows.isFetchingNextPage = true;
    ui.rerender(shell(<ReactionVotersSheet {...props} />));
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockRows.fetchNextPage).toHaveBeenCalledTimes(1);
    expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    mockRows.hasNextPage = false;
    mockRows.isFetchingNextPage = false;
    ui.rerender(shell(<ReactionVotersSheet {...props} />));
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockRows.fetchNextPage).toHaveBeenCalledTimes(1);
  });
  it.each(['self', 'friends', 'pending_out', 'none'] as const)(
    'handles %s friendship state without unauthorized duplicate requests',
    (friendship_status) => {
      mockRows.data = {
        pages: [
          [
            reaction({
              friendship_status,
              user_id: friendship_status === 'self' ? 'self' : 'other',
            }),
          ],
        ],
      };
      mockSend.mutate.mockImplementation((_, options) => options.onSuccess());
      const ui = render(shell(<ReactionVotersSheet visible postId="post" onClose={jest.fn()} />));
      if (friendship_status === 'self' || friendship_status === 'friends') {
        expect(ui.queryByText('+ Friend')).toBeNull();
        return;
      }
      fireEvent.press(ui.getByText(friendship_status === 'pending_out' ? 'Pending' : '+ Friend'));
      expect(mockSend.mutate).toHaveBeenCalledTimes(friendship_status === 'none' ? 1 : 0);
      act(() => jest.runOnlyPendingTimers());
    },
  );
  it('navigates only after the sheet is dismissed and tolerates missing profile rows', () => {
    mockRows.data = { pages: [[reaction()]] };
    const close = jest.fn();
    const ui = render(shell(<ReactionVotersSheet visible postId="post" onClose={close} />));
    fireEvent.press(ui.getByLabelText('@other'));
    expect(close).toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    ui.rerender(shell(<ReactionVotersSheet visible={false} postId="post" onClose={close} />));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    mockRows.data = { pages: [[reaction({ profile: undefined, user_id: '' })]] };
    ui.rerender(shell(<ReactionVotersSheet visible postId="post" onClose={close} />));
    fireEvent.press(ui.getByLabelText('@unknown'));
    fireEvent.press(ui.getByText('+ Friend'));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockSend.mutate).not.toHaveBeenCalled();
  });
});
