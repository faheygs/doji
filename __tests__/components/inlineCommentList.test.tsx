import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FlatList, Platform, StyleSheet, Text } from 'react-native';
import { InlineCommentList } from '../../components/comments/InlineCommentList';
import { page, row, scope, windowData } from '../fixtures/commentWindow';
import type { CommentWindow } from '../../lib/commentWindow';
import type { CommentSubmission } from '../../hooks/useCommentSubmission';

const mockLoad = jest.fn(),
  mockAvailable = jest.fn(),
  mockCalls = jest.fn();
let mockRoot: CommentWindow;
let mockReplies: Map<string, CommentWindow>;
let mockError: unknown = null;
let mockReplyError: unknown = null;
let mockFetching = false;
let mockPaging = false;
let mockOnline = true;
let mockInitial = false;
const mockVisible = { current: new Set<string>() };
jest.mock('../../hooks/useCommentWindow', () => ({
  useCommentWindow: (owner: { parentId: string | null }, enabled: boolean, budget: unknown) => {
    mockCalls(owner.parentId, enabled, budget);
    const error = owner.parentId ? mockReplyError : mockError;
    return {
      data: owner.parentId ? mockReplies.get(owner.parentId) : mockInitial ? undefined : mockRoot,
      error,
      isError: !!error,
      isFetching: mockFetching,
      isPaging: mockPaging,
      isLoading: false,
      available: mockOnline,
      visibleIds: mockVisible,
      headRefreshAllowed: { current: false },
      lastIntent: 'refresh',
      load: mockLoad,
    };
  },
}));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const props = {
  postId: 'post',
  audience: 'everyone' as const,
  enabled: true,
  renderComment: (comment: ReturnType<typeof row>) => <Text>{comment.body}</Text>,
  onAvailability: mockAvailable,
};
function visible(ui: ReturnType<typeof render>, keys: string[]) {
  const list = ui.UNSAFE_getByType(FlatList);
  fireEvent(list, 'viewableItemsChanged', {
    viewableItems: list.props.data
      .filter((item: { key: string }) => keys.includes(item.key))
      .map((item: unknown) => ({ item, isViewable: true })),
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockRoot = windowData(['newest', 'older']);
  mockRoot.retainLoadedRoots = true;
  mockRoot.pages[0].next = null;
  mockRoot.pages[0].items.forEach((item) => {
    item.has_replies = true;
  });
  mockReplies = new Map(
    ['newest', 'older'].map((id) => [
      id,
      {
        ...windowData([`${id}-reply`], { ...scope, parentId: id }),
        pages: [{ ...page([`${id}-reply`], id), next: null }],
        parentRow: row(id),
      },
    ]),
  );
  mockError = null;
  mockReplyError = null;
  mockFetching = false;
  mockPaging = false;
  mockOnline = true;
  mockInitial = false;
});
afterEach(() => jest.restoreAllMocks());

test.each(['ios', 'android'] as const)('%s reveals an own root Post once without moving for receipts or other rows', platform => {
  jest.replaceProperty(Platform, 'OS', platform);
  let frame: FrameRequestCallback | undefined;
  jest.spyOn(global, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1; });
  jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(() => {});
  const ui = render(<InlineCommentList {...props} />);
  const list = ui.UNSAFE_getByType(FlatList);
  const scroll = jest.spyOn(list.instance as FlatList, 'scrollToOffset').mockImplementation(() => {});
  fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 1500 } } });
  const pending: CommentSubmission = { key: 'own-root', state: 'sending', row: row('pending'),
    account: { userId: 'self', isCurrent: () => true },
    variables: { postId: 'post', body: 'pending', feedAudience: 'everyone', commandId: 'own-root' } };
  ui.rerender(<InlineCommentList {...props} scrollToSubmission="own-root" />);
  expect(scroll).not.toHaveBeenCalled();
  expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  ui.rerender(<InlineCommentList {...props} scrollToSubmission="own-root" submissions={[pending]} />);
  expect(list.props.maintainVisibleContentPosition).toBeUndefined();
  expect(list.props.data[0].key).toBe('submitted-own-root');
  act(() => frame?.(0));
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll).toHaveBeenLastCalledWith({ offset: 0, animated: false });
  expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  fireEvent.scroll(list, { nativeEvent: { contentOffset: { y: 900 } } });
  const saved = { ...pending, state: 'confirmed' as const, row: row('saved') };
  ui.rerender(<InlineCommentList {...props} scrollToSubmission="own-root" submissions={[saved]} />);
  mockRoot = { ...mockRoot, pages: [{ ...mockRoot.pages[0], items: [row('someone-else'), row('saved'), ...mockRoot.pages[0].items] }] };
  ui.rerender(<InlineCommentList {...props} scrollToSubmission="own-root" submissions={[saved]} />);
  ui.rerender(<InlineCommentList {...props} scrollToSubmission="own-root" submissions={[]} />);
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(ui.UNSAFE_getByType(FlatList)).toBe(list);
  const next = { ...pending, key: 'next-root', row: row('next-pending') };
  ui.rerender(<InlineCommentList {...props} scrollToSubmission="next-root" submissions={[next]} />);
  act(() => frame?.(0));
  expect(scroll).toHaveBeenCalledTimes(2);
});

test('an own send is immediate, stays inline and keeps its native key through the receipt and read', () => {
  const account = { userId: 'self', isCurrent: () => true };
  const pending: CommentSubmission = { key: 'command', state: 'sending', row: row('pending'), account,
    variables: { postId: 'post', body: 'pending', feedAudience: 'everyone', commandId: 'command' } };
  const observed = jest.fn();
  const ui = render(<InlineCommentList {...props} submissions={[pending]} onObserved={observed} />);
  const key = () => ui.UNSAFE_getByType(FlatList).props.data[0].key;
  expect(ui.getByText(pending.row.body)).toBeTruthy();
  expect(key()).toBe('submitted-command');
  const confirmed: CommentSubmission = { ...pending, state: 'confirmed', row: row('saved') };
  ui.rerender(<InlineCommentList {...props} submissions={[confirmed]} onObserved={observed} />);
  expect(key()).toBe('submitted-command');
  mockRoot = { ...mockRoot, pages: [{ ...mockRoot.pages[0], items: [row('saved'), ...mockRoot.pages[0].items] }] };
  ui.rerender(<InlineCommentList {...props} submissions={[confirmed]} onObserved={observed} />);
  expect(ui.getAllByText(confirmed.row.body)).toHaveLength(1);
  expect(observed).toHaveBeenLastCalledWith(expect.objectContaining({ size: 3 }));
  ui.rerender(<InlineCommentList {...props} submissions={[]} onObserved={observed} />);
  expect(key()).toBe('submitted-command');
});

test.each([1, 123])('initial loading before %i comments is neutral, never an unavailable warning', (count) => {
  mockInitial = true;
  mockFetching = true;
  const ui = render(<InlineCommentList {...props} />);
  expect(ui.getByLabelText('Loading comments')).toBeTruthy();
  expect(ui.queryByText(/unavailable|Could not|Couldn't|No comments/)).toBeNull();
  expect(ui.queryByText('Try again')).toBeNull();
  expect(mockAvailable).toHaveBeenLastCalledWith(false);
  mockInitial = false;
  mockFetching = false;
  mockRoot = windowData(Array.from({ length: count }, (_, index) => `comment-${index}`));
  ui.rerender(<InlineCommentList {...props} />);
  expect(ui.queryByLabelText('Loading comments')).toBeNull();
  expect(ui.getByText('Synthetic comment-0')).toBeTruthy();
  expect(mockAvailable).toHaveBeenLastCalledWith(true);
});

test.each(['initial', 'denied'])('%s failure has a centered retry state, not a bottom warning', (mode) => {
  mockInitial = mode === 'initial';
  mockError = mode === 'initial' ? new TypeError('Network request failed') : { code: '42501' };
  const ui = render(<InlineCommentList {...props} />);
  expect(ui.getByText("Couldn't load comments.")).toBeTruthy();
  expect(StyleSheet.flatten(ui.getByTestId('comment-read-status').props.style)).toMatchObject({
    flex: 1, alignItems: 'center', justifyContent: 'center',
  });
  expect(ui.queryByText('Synthetic newest')).toBeNull();
  fireEvent.press(ui.getByText('Try again'));
  expect(mockLoad).toHaveBeenCalledWith('refresh');
});

test('heart/background refresh preserves root and inline reply content without loading indicators', () => {
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  const list = ui.UNSAFE_getByType(FlatList);
  mockFetching = true;
  ui.rerender(<InlineCommentList {...props} replyTargetId="newest" />);
  expect(ui.UNSAFE_getByType(FlatList)).toBe(list);
  expect(ui.getByText('Synthetic newest')).toBeTruthy();
  expect(ui.getByText('Synthetic newest-reply')).toBeTruthy();
  expect(ui.queryByLabelText(/Loading/)).toBeNull();
  expect(mockAvailable).toHaveBeenLastCalledWith(true);
  fireEvent.press(ui.getByLabelText('Hide replies'));
  expect(ui.queryByText('Synthetic newest-reply')).toBeNull();
});

test('missing root pages and reply pages still show their local paging spinners', () => {
  mockFetching = true;
  mockPaging = true;
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  expect(ui.getByLabelText('Loading more comments')).toBeTruthy();
  expect(ui.getByLabelText('Loading replies')).toBeTruthy();
  expect(ui.getByText('Synthetic newest')).toBeTruthy();
  expect(ui.getByText('Synthetic newest-reply')).toBeTruthy();
});

test.each([1, 3, 100000])('collapsed reply label uses the authoritative %i total, not the loaded reply window', count => {
  mockRoot.pages[0].items[0].reply_count = count;
  const ui = render(<InlineCommentList {...props} />);
  const label = `View ${count} ${count === 1 ? 'reply' : 'replies'}`;
  fireEvent.press(ui.getByLabelText(label));
  expect(ui.getByText('Synthetic newest-reply')).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Hide replies'));
  expect(ui.getByLabelText(label)).toBeTruthy();
  mockRoot = { ...mockRoot, pages: [{ ...mockRoot.pages[0], items: mockRoot.pages[0].items.map(
    item => item.id === 'newest' ? { ...item, reply_count: count + 1 } : item,
  ) }] };
  ui.rerender(<InlineCommentList {...props} />);
  expect(ui.getByLabelText(`View ${count + 1} replies`)).toBeTruthy();
});

test.each(['ios', 'android'] as const)(
  '%s keeps several reply threads inline in one stable list',
  (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const ui = render(<InlineCommentList {...props} />);
    const list = ui.UNSAFE_getByType(FlatList);
    visible(ui, ['newest', 'older']);
    fireEvent.press(ui.getAllByLabelText('View replies')[0]);
    fireEvent.press(ui.getByLabelText('View replies'));
    expect(ui.UNSAFE_getAllByType(FlatList)).toHaveLength(1);
    expect(ui.UNSAFE_getByType(FlatList)).toBe(list);
    expect(list.props.data.map((item: { key: string }) => item.key)).toEqual([
      'newest',
      'toggle-newest',
      'newest-reply',
      'status-newest',
      'older',
      'toggle-older',
      'older-reply',
      'status-older',
    ]);
    expect(ui.queryByText(/Show latest|Back to comments/)).toBeNull();
    expect(list.props.getItemLayout).toBeUndefined();
    expect(list.props.onStartReached).toBeUndefined();
    expect(list.props.maintainVisibleContentPosition.minIndexForVisible).toBe(0);
    expect(list.props.maintainVisibleContentPosition.autoscrollToTopThreshold).toBeUndefined();
    fireEvent.press(ui.getAllByLabelText('Hide replies')[0]);
    expect(ui.queryByText('Synthetic newest-reply')).toBeNull();
    expect(ui.getByText('Synthetic older-reply')).toBeTruthy();
  },
);

test('reply targets expand inline; offscreen expanded threads pause without closing', () => {
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  visible(ui, ['newest-reply']);
  expect(mockCalls).toHaveBeenCalledWith('newest', true, { pageSize: 10, maxPages: 3 });
  visible(ui, ['older']);
  expect(mockCalls).toHaveBeenLastCalledWith('newest', false, { pageSize: 10, maxPages: 3 });
  expect(ui.getByLabelText('Hide replies')).toBeTruthy();
  expect(ui.getByText('Synthetic newest-reply')).toBeTruthy();
});

test('downward paging keeps loaded roots even when an early root reply is visible', () => {
  mockRoot.pages = [page(['newest']), page(['middle']), page(['older'])];
  mockRoot.pages[0].items[0].has_replies = true;
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  mockLoad.mockClear();
  visible(ui, ['newest-reply']);
  fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
  expect(mockLoad).toHaveBeenCalledWith('next');
  visible(ui, ['older']);
  expect(mockLoad).toHaveBeenCalledWith('next');
});

test('root removal unmounts reply observers and their expansion state', () => {
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  expect(ui.getByText('Synthetic newest-reply')).toBeTruthy();
  mockRoot = windowData(['older']);
  mockCalls.mockClear();
  ui.rerender(<InlineCommentList {...props} />);
  expect(ui.queryByText('Synthetic newest-reply')).toBeNull();
  expect(mockCalls.mock.calls.every((call) => call[0] === null)).toBe(true);
});

test('returning to an invalidated loaded page reconciles visible IDs, never pages upward', () => {
  mockRoot.pages[0].needsRefresh = true;
  const ui = render(<InlineCommentList {...props} />);
  visible(ui, ['newest']);
  expect(mockLoad).toHaveBeenCalledWith('visible');
  expect(mockLoad).not.toHaveBeenCalledWith('previous');
  expect(ui.UNSAFE_getByType(FlatList).props.data[0].comment.id).toBe('newest');
});

test('new roots refresh at the head automatically, never through a latest button or while scrolled', () => {
  const ui = render(<InlineCommentList {...props} />);
  fireEvent.scroll(ui.UNSAFE_getByType(FlatList), { nativeEvent: { contentOffset: { y: 400 } } });
  mockRoot = { ...mockRoot, headChanged: true, revision: 2 };
  ui.rerender(<InlineCommentList {...props} />);
  expect(mockLoad).not.toHaveBeenCalledWith('latest');
  fireEvent.scroll(ui.UNSAFE_getByType(FlatList), { nativeEvent: { contentOffset: { y: 0 } } });
  expect(mockLoad).toHaveBeenCalledWith('latest');
  expect(ui.queryByText(/Show latest/)).toBeNull();
});

test('reply tail growth appends automatically when its end is visible', () => {
  mockReplies.set('newest', { ...mockReplies.get('newest')!, headChanged: true });
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  visible(ui, ['newest-reply']);
  expect(mockLoad).toHaveBeenCalledWith('tail');
  expect(mockLoad).not.toHaveBeenCalledWith('latest');
});

test.each(['hidden', 'offline', 'fetching', 'failure'])(
  '%s cannot loop automatic page requests',
  (mode) => {
    mockOnline = mode !== 'offline';
    mockFetching = mode === 'fetching';
    mockError = mode === 'failure' ? new TypeError('Network request failed') : null;
    mockRoot.pages[0].next = { id: 'older', createdAt: row('older').created_at };
    const ui = render(<InlineCommentList {...props} enabled={mode !== 'hidden'} />);
    visible(ui, ['older']);
    fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
    expect(mockLoad).not.toHaveBeenCalled();
    if (mode === 'failure') {
      expect(ui.getByText('Synthetic newest')).toBeTruthy();
      expect(ui.getByText('Could not refresh comments.')).toBeTruthy();
    }
  },
);

test('root denial clears the list; reply denial affects only its inline thread and offers retry', () => {
  const ui = render(<InlineCommentList {...props} replyTargetId="newest" />);
  visible(ui, ['newest']);
  mockReplyError = { code: '42501' };
  ui.rerender(<InlineCommentList {...props} replyTargetId="newest" />);
  expect(ui.queryByText('Synthetic newest-reply')).toBeNull();
  expect(ui.getByText('Synthetic newest')).toBeTruthy();
  fireEvent.press(ui.getByText('Retry replies'));
  expect(mockLoad).toHaveBeenCalledWith('refresh');
  mockError = { code: '42501' };
  ui.rerender(<InlineCommentList {...props} />);
  expect(ui.queryByText('Synthetic newest')).toBeNull();
  expect(mockAvailable).toHaveBeenLastCalledWith(false);
});
