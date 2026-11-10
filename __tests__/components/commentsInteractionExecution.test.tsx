import React from 'react';
import 'react-native-gesture-handler/jestSetup';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FlatList, Keyboard, Modal, Platform, StyleSheet } from 'react-native';
import * as time from '../../utils/time';
import { GestureDetector } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PostCommentsThread } from '../../components/feed/PostCommentsThread';
import { PostCommentsSheet } from '../../components/feed/PostCommentsSheet';
import { CommentLikesSheet } from '../../components/feed/CommentLikesSheet';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import type { CommentWithMeta } from '../../hooks/useComments';
import type { CommentLikeRow } from '../../hooks/useCommentLikes';
import { windowData } from '../fixtures/commentWindow';

let mockWindowEnabled = false;
const mockWindowLoad = jest.fn();
const mockWindowVisible = { current: new Set<string>() };
const mockWindowRoot = windowData(['root']);
const mockWindowReply = { ...windowData(['reply'], { ...mockWindowRoot.scope, parentId: 'root' }), parentRow: mockWindowRoot.pages[0].items[0] };
jest.mock('../../lib/commentPagingFeature', () => ({ get COMMENT_PAGING_V2_ENABLED() { return mockWindowEnabled; } }));
jest.mock('../../hooks/useCommentWindow', () => ({ useCommentWindow: (scope: { parentId: string | null }) => ({
  data: scope.parentId ? mockWindowReply : mockWindowRoot,
  isError: false, isLoading: false, isFetching: false, available: true,
  visibleIds: mockWindowVisible, load: mockWindowLoad,
}) }));

const mockRouter = { push: jest.fn() };
const mockDialog = jest.fn();
const mockReport = jest.fn();
const mockAuth = { session: { user: { id: 'self' } } as { user: { id: string } } | null };
const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn().mockResolvedValue(undefined), isPending: false });
const mockAdd = mutation(),
  mockEdit = mutation(),
  mockDelete = mutation(),
  mockLike = mutation(),
  mockDisable = mutation(),
  mockFriend = mutation();
const mockComments = {
  data: undefined as { pages: CommentWithMeta[][] } | undefined,
  isLoading: false,
  isError: false,
  error: null as unknown,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetching: false,
  isFetchNextPageError: false,
  isRefetching: false,
  fetchNextPage: jest.fn().mockResolvedValue(undefined),
  refetch: jest.fn(),
};
const mockLikes = {
  data: undefined as { pages: CommentLikeRow[][] } | undefined,
  isPending: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: jest.fn(),
};
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/feed',
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../contexts/DialogContext', () => ({
  useAppDialog: () => ({ showDialog: mockDialog }),
}));
jest.mock('../../contexts/ReportFlowContext', () => ({ useReportFlow: () => mockReport }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((selector: (s: typeof mockAuth) => unknown) => selector(mockAuth), {
    getState: () => mockAuth,
  }),
}));
jest.mock('../../hooks/useComments', () => ({
  useComments: () => mockComments,
  useAddComment: () => mockAdd,
  useEditComment: () => mockEdit,
  useDeleteComment: () => mockDelete,
  useToggleCommentLike: () => mockLike,
  useToggleCommentsDisabled: () => mockDisable,
  useMentionSearch: () => ({
    data: [{ id: 'mention', username: 'alice', display_name: 'Alice' }],
    isPending: false,
  }),
}));
jest.mock('../../hooks/useCommentLikes', () => ({ useCommentLikes: () => mockLikes }));
jest.mock('../../hooks/useProfile', () => ({ useSendFriendRequest: () => mockFriend }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
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
const comment = (overrides: Partial<CommentWithMeta> = {}): CommentWithMeta =>
  ({
    id: 'c1',
    post_id: 'post',
    user_id: 'other',
    body: 'Hello @alice',
    parent_id: null,
    created_at: '2026-10-01T12:00:00Z',
    profile: { username: 'other', display_name: 'Other', avatar_url: null },
    like_count: 2,
    liked_by_me: false,
    ...overrides,
  }) as CommentWithMeta;
const rows = (...items: CommentWithMeta[]) => {
  mockComments.data = { pages: [items] };
};
const flush = () =>
  act(() => {
    jest.advanceTimersByTime(50);
  });
beforeEach(() => {
  jest.clearAllMocks();
  mockWindowEnabled = false;
  jest.useFakeTimers();
  jest.replaceProperty(Platform, 'OS', 'android');
  mockAuth.session = { user: { id: 'self' } };
  [mockAdd, mockEdit, mockDelete, mockLike, mockDisable, mockFriend].forEach((m) => {
    m.isPending = false;
  });
  Object.assign(mockComments, {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetching: false,
    isFetchNextPageError: false,
    isRefetching: false,
  });
  Object.assign(mockLikes, {
    data: undefined,
    isPending: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  });
});
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('real comment composer and thread', () => {
  it('gated bounded UI targets the opened root when replying and keeps new rows behind latest', () => {
    mockWindowEnabled = true;
    const ui = render(shell(<PostCommentsThread postId="post" feedAudience="friends" />));
    expect(ui.getByText('Synthetic root')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Reply to unknown'));
    flush();
    expect(ui.getByText('Back to comments')).toBeTruthy();
    fireEvent.changeText(ui.getByPlaceholderText('Reply to user…'), 'reply to root');
    fireEvent.press(ui.getByLabelText('Send comment'));
    expect(mockAdd.mutate.mock.calls[0][0]).toMatchObject({ postId: 'post', parentId: 'root', replyToCommentId: 'root', feedAudience: 'friends' });
    act(() => mockAdd.mutate.mock.calls[0][1].onSuccess());
    expect(ui.getByText('Comment posted. Select Show latest to view it.')).toBeTruthy();
    fireEvent.press(ui.getByText('Back to comments'));
    expect(ui.queryByText('Back to comments')).toBeNull();
  });
  it('trims a new comment, uses its audience and restores a failed draft', () => {
    const ui = render(shell(<PostCommentsThread postId="post" feedAudience="friends" />));
    expect(ui.getByText('No comments yet. Say something nice.')).toBeTruthy();
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), '  useful comment  ');
    fireEvent.press(ui.getByLabelText('Send comment'));
    expect(mockAdd.mutate.mock.calls[0][0]).toEqual({
      postId: 'post',
      body: 'useful comment',
      parentId: null,
      replyToCommentId: null,
      feedAudience: 'friends',
    });
    expect(ui.getByPlaceholderText('Add a comment…').props.value).toBe('');
    act(() => mockAdd.mutate.mock.calls[0][1].onError(new Error('Connection failed')));
    expect(ui.getByText('Connection failed')).toBeTruthy();
    expect(ui.getByPlaceholderText('Add a comment…').props.value).toBe('useful comment');
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), 'new');
    expect(ui.queryByText('Connection failed')).toBeNull();
    fireEvent.press(ui.getByLabelText('Send comment'));
    act(() => mockAdd.mutate.mock.calls[1][1].onError(new Error('')));
    expect(ui.getByText('Could not post your comment. Try again.')).toBeTruthy();
  });
  it('selects a mention, validates whitespace, and displays the length limit', () => {
    const ui = render(shell(<PostCommentsThread postId="post" />));
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), 'Hey @al');
    fireEvent.press(ui.getByLabelText('Mention @alice'));
    flush();
    expect(ui.getByPlaceholderText('Add a comment…').props.value).toBe('Hey @alice ');
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), '   ');
    expect(ui.getByText('Comment cannot be empty')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Send comment'));
    expect(mockAdd.mutate).not.toHaveBeenCalled();
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), 'x'.repeat(2000));
    expect(ui.getByText('2000/2000')).toBeTruthy();
    expect(ui.getByPlaceholderText('Add a comment…').props.maxLength).toBe(2000);
  });
  it.each(['add', 'edit', 'anonymous'])('disables composition while %s', (mode) => {
    if (mode === 'add') mockAdd.isPending = true;
    if (mode === 'edit') mockEdit.isPending = true;
    if (mode === 'anonymous') mockAuth.session = null;
    const ui = render(shell(<PostCommentsThread postId="post" />));
    expect(ui.getByPlaceholderText('Add a comment…').props.editable).toBe(false);
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), 'hello');
    fireEvent.press(ui.getByLabelText('Send comment'));
    expect(mockAdd.mutate).not.toHaveBeenCalled();
  });
  it('locks nonowners but permits the post owner and dismisses a hidden embedded composer', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const ui = render(shell(<PostCommentsThread postId="post" commentsDisabled />));
    expect(ui.getByText('Comments are turned off.')).toBeTruthy();
    expect(ui.getByText('Comments are turned off on this post.')).toBeTruthy();
    ui.rerender(
      shell(
        <PostCommentsThread
          postId="post"
          commentsDisabled
          postOwnerId="self"
          embedInSheet
          fetchEnabled={false}
        />,
      ),
    );
    expect(ui.getByPlaceholderText('Add a comment…')).toBeTruthy();
    expect(dismiss).toHaveBeenCalled();
  });
  it.each([false, true])('retries a %s cached read failure', (cached) => {
    if (cached) rows(comment());
    Object.assign(mockComments, { isError: true, error: { status: 503 } });
    const ui = render(shell(<PostCommentsThread postId="post" />));
    expect(
      ui.getByText(
        cached
          ? 'Couldn’t refresh comments. Showing previously loaded comments.'
          : "Couldn't load comments.",
      ),
    ).toBeTruthy();
    fireEvent.press(ui.getByText('Try again'));
    expect(mockComments.refetch).toHaveBeenCalledTimes(1);
  });
  it('shows loading and suppresses duplicate pagination', () => {
    mockComments.isLoading = true;
    const ui = render(shell(<PostCommentsThread postId="post" />));
    expect(ui.getByLabelText('Loading comments')).toBeTruthy();
    mockComments.isLoading = false;
    rows(comment());
    mockComments.hasNextPage = true;
    ui.rerender(shell(<PostCommentsThread postId="post" />));
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockComments.fetchNextPage).toHaveBeenCalledTimes(1);
    mockComments.isFetchingNextPage = true;
    ui.rerender(shell(<PostCommentsThread postId="post" />));
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockComments.fetchNextPage).toHaveBeenCalledTimes(1);
  });
  it('does not relayout unchanged comment bodies while typing or adding a later page', () => {
    const format = jest.spyOn(time, 'formatCompactRelativeTime');
    const first = comment();
    rows(first);
    const ui = render(shell(<PostCommentsThread postId="post" />));
    const count = format.mock.calls.length;
    fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), 'draft');
    expect(format).toHaveBeenCalledTimes(count);
    mockComments.data = { pages: [[first], [comment({ id: 'older', created_at: '2026-09-01T00:00:00Z' })]] };
    ui.rerender(shell(<PostCommentsThread postId="post" />));
    expect(format).toHaveBeenCalledTimes(count + 1);
    format.mockRestore();
  });
  it('keeps the pagination footer height and requires explicit retry after a page failure', () => {
    rows(comment());
    mockComments.hasNextPage = true;
    const ui = render(shell(<PostCommentsThread postId="post" />));
    const footerHeight = () => StyleSheet.flatten(ui.UNSAFE_getByType(FlatList).props.ListFooterComponent.props.style).height;
    expect(mockComments.fetchNextPage).toHaveBeenCalledTimes(1);
    mockComments.fetchNextPage.mockClear();
    const height = footerHeight();
    mockComments.isFetching = true;
    mockComments.isFetchingNextPage = true;
    ui.rerender(shell(<PostCommentsThread postId="post" />));
    expect(footerHeight()).toBe(height);
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockComments.fetchNextPage).not.toHaveBeenCalled();
    Object.assign(mockComments, { isFetching: false, isFetchingNextPage: false,
      isError: true, isFetchNextPageError: true, error: { status: 503 } });
    ui.rerender(shell(<PostCommentsThread postId="post" />));
    expect(footerHeight()).toBe(height);
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockComments.fetchNextPage).not.toHaveBeenCalled();
    fireEvent.press(ui.getByText('Try again'));
    expect(mockComments.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
    expect(mockComments.refetch).not.toHaveBeenCalled();
  });
  it('releases each overlapping heart guard independently, including failed writes', async () => {
    rows(comment(), comment({ id: 'c2' }));
    let finishFirst!: () => void, failSecond!: () => void;
    mockLike.mutateAsync.mockImplementationOnce(() => new Promise<void>(resolve => { finishFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((_resolve, reject) => { failSecond = () => reject(new Error('failed')); }));
    const ui = render(shell(<PostCommentsThread postId="post" />));
    fireEvent.press(ui.getAllByLabelText('Like comment')[0]);
    fireEvent.press(ui.getAllByLabelText('Like comment')[1]);
    expect(mockLike.mutateAsync).toHaveBeenCalledTimes(2);
    await act(async () => { finishFirst(); failSecond(); });
    fireEvent.press(ui.getAllByLabelText('Like comment')[0]);
    fireEvent.press(ui.getAllByLabelText('Like comment')[1]);
    expect(mockLike.mutateAsync).toHaveBeenCalledTimes(4);
  });
  it('expands replies, targets the root and preserves a failed reply', () => {
    rows(comment(), comment({ id: 'reply', parent_id: 'c1', body: 'A reply' }));
    const ui = render(shell(<PostCommentsThread postId="post" />));
    fireEvent.press(ui.getByLabelText('View 1 reply'));
    expect(ui.getByText('A reply')).toBeTruthy();
    fireEvent.press(ui.getAllByLabelText('Reply to other')[1]);
    flush();
    fireEvent.changeText(ui.getByPlaceholderText('Reply to other…'), ' @other answer ');
    fireEvent.press(ui.getByLabelText('Send comment'));
    expect(mockAdd.mutate.mock.calls[0][0]).toMatchObject({
      parentId: 'c1',
      replyToCommentId: 'reply',
      body: '@other answer',
    });
    act(() => mockAdd.mutate.mock.calls[0][1].onError(new Error('Retry reply')));
    expect(ui.getByText('Replying to other')).toBeTruthy();
    fireEvent.press(ui.getByText('Cancel'));
    expect(ui.getByPlaceholderText('Add a comment…').props.value).toBe('');
    fireEvent.press(ui.getByLabelText('Hide replies'));
    expect(ui.queryByText('A reply')).toBeNull();
  });
  it('navigates a profile and mention, reports only the exact comment, and guards in-flight likes', async () => {
    rows(comment());
    const ui = render(shell(<PostCommentsThread postId="post" />));
    fireEvent.press(ui.getByLabelText('other profile'));
    fireEvent.press(ui.getByText('@alice'));
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
    fireEvent.press(ui.getByLabelText('Report comment'));
    expect(mockReport).toHaveBeenCalledWith({ reportedUserId: 'other', commentId: 'c1' });
    fireEvent.press(ui.getByLabelText('Like comment'));
    fireEvent.press(ui.getByLabelText('Like comment'));
    expect(mockLike.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mockLike.mutateAsync.mock.calls[0][0]).toEqual({
      postId: 'post',
      commentId: 'c1',
      liked: false,
    });
    await act(async () => {});
    fireEvent.press(ui.getByLabelText('Like comment'));
    expect(mockLike.mutateAsync).toHaveBeenCalledTimes(2);
    fireEvent.press(ui.getByLabelText('2 likes, tap to see who liked'));
    expect(ui.getByText('Likes · 0')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Close'));
  });
  it.each(['ios', 'android'] as const)(
    'edits and deletes owned comments only after %s dismissal',
    (platform) => {
      jest.replaceProperty(Platform, 'OS', platform);
      rows(comment({ user_id: 'self', body: 'Original' }));
      const ui = render(shell(<PostCommentsThread postId="post" feedAudience="friends" />));
      fireEvent.press(ui.getByLabelText('Edit or delete comment'));
      const modal = ui.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)!;
      fireEvent.press(ui.getByLabelText('Edit comment'));
      if (platform === 'ios') act(() => modal.props.onDismiss());
      else flush();
      expect(ui.getByText('Editing comment')).toBeTruthy();
      fireEvent.changeText(ui.getByPlaceholderText('Add a comment…'), ' Changed ');
      fireEvent.press(ui.getByLabelText('Save comment'));
      expect(mockEdit.mutate.mock.calls[0][0]).toEqual({
        postId: 'post',
        commentId: 'c1',
        body: 'Changed',
      });
      act(() => mockEdit.mutate.mock.calls[0][1].onError(new Error('')));
      expect(ui.getByText('Could not save your comment. Try again.')).toBeTruthy();
      act(() => mockEdit.mutate.mock.calls[0][1].onSuccess());
      fireEvent.press(ui.getByLabelText('Edit or delete comment'));
      const deletionModal = ui.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)!;
      fireEvent.press(ui.getByLabelText('Delete comment'));
      if (platform === 'ios') act(() => deletionModal.props.onDismiss());
      else flush();
      expect(mockDelete.mutate).not.toHaveBeenCalled();
      expect(mockDialog.mock.calls[0][0].title).toBe('Delete comment?');
      act(() => mockDialog.mock.calls[0][0].actions[1].onPress());
      expect(mockDelete.mutate).toHaveBeenCalledWith({
        postId: 'post',
        commentId: 'c1',
        feedAudience: 'friends',
      });
    },
  );
});

describe('native comment sheet', () => {
  it.each(['ios', 'android'] as const)('dismisses the keyboard before the %s sheet', (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const callbacks: Record<string, () => void> = {};
    const addListener = Keyboard.addListener.bind(Keyboard);
    jest.spyOn(Keyboard, 'addListener').mockImplementation((event, callback) => {
      callbacks[event] = callback as () => void;
      return addListener(event, callback);
    });
    const dismiss = jest.spyOn(Keyboard, 'dismiss'),
      close = jest.fn();
    const ui = render(
      shell(
        <PostCommentsSheet
          visible
          postId="post"
          postOwnerId="self"
          commentCount={1200}
          onClose={close}
        />,
      ),
    );
    expect(ui.getByText('1.2k')).toBeTruthy();
    fireEvent(ui.getByLabelText('Turn off comments on this post'), 'valueChange', true);
    expect(mockDisable.mutate).toHaveBeenCalledWith({ postId: 'post', disabled: true });
    act(() => callbacks[platform === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow']());
    fireEvent.press(ui.getByLabelText('Close comments'));
    expect(dismiss).toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    act(() => callbacks[platform === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide']());
    fireEvent.press(ui.getByLabelText('Dismiss comments'));
    expect(close).toHaveBeenCalledTimes(1);
    ui.rerender(shell(<PostCommentsSheet visible={false} postId="post" onClose={close} />));
    expect(ui.queryByText('Comments')).toBeNull();
  });
  it.each(['ios', 'android'] as const)('hands off reports after %s dismissal', (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    rows(comment());
    const close = jest.fn();
    const ui = render(shell(<PostCommentsSheet visible postId="post" onClose={close} />));
    const modal = ui.UNSAFE_getAllByType(Modal).find((m) => m.props.visible)!;
    fireEvent.press(ui.getByLabelText('Report comment'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(mockReport).not.toHaveBeenCalled();
    if (platform === 'ios') act(() => modal.props.onDismiss());
    else flush();
    expect(mockReport).toHaveBeenCalledWith({ reportedUserId: 'other', commentId: 'c1' });
  });
  it.each([
    [0, 1000, true],
    [10000, 0, true],
    [-10000, -800, false],
    [30, 800, true],
    [0, 0, false],
    [500, 0, false],
  ])('handles drag %s / velocity %s', async (translationY, velocityY, shouldClose) => {
    const close = jest.fn();
    const ui = render(shell(<PostCommentsSheet visible postId="post" onClose={close} />));
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    const handlers = ui.UNSAFE_getByType(GestureDetector).props.gesture.handlers;
    await act(async () => {
      handlers.onStart({});
      handlers.onUpdate({ translationY });
      handlers.onEnd({ translationY, velocityY });
      jest.advanceTimersByTime(50);
    });
    expect(close.mock.calls.length > 0).toBe(shouldClose);
  });
});

describe('comment voter list', () => {
  it('renders loading and empty states', () => {
    mockLikes.isPending = true;
    const close = jest.fn();
    const ui = render(shell(<CommentLikesSheet visible commentId="c1" onClose={close} />));
    expect(ui.getByLabelText('Loading likes')).toBeTruthy();
    mockLikes.isPending = false;
    ui.rerender(shell(<CommentLikesSheet visible commentId="c1" onClose={close} />));
    expect(ui.getByText('No likes yet.')).toBeTruthy();
    fireEvent.press(ui.getByLabelText('Close'));
    expect(close).toHaveBeenCalled();
  });
  it.each(['none', 'pending_out', 'friends', 'self'] as const)(
    'shows %s friendship controls and safely paginates',
    (status) => {
      mockLikes.data = {
        pages: [
          [
            {
              id: 'like',
              user_id: status === 'self' ? 'self' : 'other',
              created_at: '2026-10-01',
              friendship_status: status,
              profile: {
                username: 'other',
                display_name: 'Other',
                avatar_url: null,
                equipped_border_key: null,
              },
            },
          ],
        ],
      };
      mockLikes.hasNextPage = true;
      const ui = render(shell(<CommentLikesSheet visible commentId="c1" onClose={jest.fn()} />));
      expect(ui.getByText('Likes · 1+')).toBeTruthy();
      if (status === 'none') {
        fireEvent.press(ui.getByText('+ Friend'));
        expect(mockFriend.mutate.mock.calls[0][0]).toEqual({ addresseeId: 'other' });
        act(() => mockFriend.mutate.mock.calls[0][1].onSuccess());
        flush();
      } else if (status === 'pending_out') {
        fireEvent.press(ui.getByText('Pending'));
        expect(mockFriend.mutate).not.toHaveBeenCalled();
      } else expect(ui.queryByText('+ Friend')).toBeNull();
      fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
      expect(mockLikes.fetchNextPage).toHaveBeenCalledTimes(1);
      mockLikes.isFetchingNextPage = true;
      ui.rerender(shell(<CommentLikesSheet visible commentId="c1" onClose={jest.fn()} />));
      fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
      expect(mockLikes.fetchNextPage).toHaveBeenCalledTimes(1);
    },
  );
});
