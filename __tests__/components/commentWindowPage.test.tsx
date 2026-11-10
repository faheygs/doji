import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { FlatList, Text } from 'react-native';
import { CommentWindowPage } from '../../components/comments/CommentWindowPage';
import { CommentWindowList } from '../../components/comments/CommentWindowList';
import { page, row, scope, windowData } from '../fixtures/commentWindow';
import type { CommentWindow } from '../../lib/commentWindow';

const mockLoad = jest.fn();
const mockAvailable = jest.fn();
const mockVisible = { current: new Set<string>() };
let mockData: CommentWindow | undefined;
let mockState: {
  isError: boolean;
  error: unknown;
  isFetching: boolean;
  isLoading: boolean;
  available: boolean;
};
jest.mock('../../hooks/useCommentWindow', () => ({
  useCommentWindow: () => ({
    data: mockData,
    load: mockLoad,
    visibleIds: mockVisible,
    lastIntent: 'next',
    ...mockState,
  }),
}));
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const renderComment = (item: ReturnType<typeof row>) => <Text>{item.body}</Text>;
const props = {
  scope,
  enabled: true,
  renderComment,
  onOpenReplies: jest.fn(),
  onAvailability: mockAvailable,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockData = windowData();
  mockVisible.current = new Set();
  mockState = { isError: false, error: null, isFetching: false, isLoading: false, available: true };
});

test('prepares one page only, has stable identity/anchor props and no fabricated row layout', () => {
  const ui = render(<CommentWindowPage {...props} />);
  expect(mockLoad.mock.calls).toEqual([['next']]);
  const list = ui.UNSAFE_getByType(FlatList);
  expect(list.props.keyExtractor(row('one'))).toBe('one');
  expect(list.props.maintainVisibleContentPosition).toEqual({ minIndexForVisible: 0 });
  expect(list.props.getItemLayout).toBeUndefined();
  fireEvent(list, 'endReached');
  expect(mockLoad).toHaveBeenCalledTimes(1);
  mockData = { ...mockData!, pages: [...mockData!.pages, page(['three'])] };
  ui.rerender(<CommentWindowPage {...props} />);
  expect(mockLoad).toHaveBeenCalledTimes(1);
});

test('eviction is refused until the visible edge is safe; viewability enables next and previous', () => {
  mockData = { ...windowData(), pages: Array.from({ length: 5 }, (_, i) => page([String(i)])) };
  const ui = render(<CommentWindowPage {...props} />);
  const list = ui.UNSAFE_getByType(FlatList);
  fireEvent(list, 'endReached');
  expect(mockLoad).not.toHaveBeenCalled();
  mockVisible.current = new Set(['0']);
  fireEvent(list, 'endReached');
  expect(mockLoad).not.toHaveBeenCalled();
  fireEvent(list, 'viewableItemsChanged', {
    viewableItems: [{ item: row('4'), isViewable: true }],
  });
  expect(mockLoad.mock.calls).toEqual([['next']]);
  mockData.pages[0].previous = { id: '0', createdAt: row('0').created_at };
  ui.rerender(<CommentWindowPage {...props} />);
  fireEvent(ui.UNSAFE_getByType(FlatList), 'viewableItemsChanged', {
    viewableItems: [{ item: row('0'), isViewable: true }],
  });
  expect(mockLoad.mock.calls.at(-1)).toEqual(['previous']);
  // A response deferred by the viewport must be eligible again after scrolling.
  fireEvent(ui.UNSAFE_getByType(FlatList), 'viewableItemsChanged', {
    viewableItems: [{ item: row('4'), isViewable: true }],
  });
  expect(mockLoad.mock.calls).toEqual([['next'], ['previous'], ['next']]);
});

test.each(['hidden', 'offline', 'fetching', 'error'])('%s prevents automatic paging', (mode) => {
  mockState.available = mode !== 'offline';
  mockState.isFetching = mode === 'fetching';
  mockState.isError = mode === 'error';
  mockState.error = new TypeError('Network request failed');
  const ui = render(<CommentWindowPage {...props} enabled={mode !== 'hidden'} />);
  fireEvent(ui.UNSAFE_getByType(FlatList), 'endReached');
  expect(mockLoad).not.toHaveBeenCalled();
});

test('unseen rows wait for explicit latest action; replies open independently', () => {
  mockData!.headChanged = true;
  mockData!.pages[0].items[0].has_replies = true;
  const ui = render(<CommentWindowPage {...props} />);
  mockLoad.mockClear();
  expect(ui.getByText('Latest comments available')).toBeTruthy();
  expect(mockLoad).not.toHaveBeenCalled();
  fireEvent.press(ui.getByText('Latest comments available'));
  expect(mockLoad).toHaveBeenCalledWith('latest');
  fireEvent.press(ui.getByText('View replies'));
  expect(props.onOpenReplies).toHaveBeenCalledWith(mockData!.pages[0].items[0]);
});

test('denied thread hides rows and locks composition; transient error retains data with explicit retry', () => {
  mockState.isError = true;
  mockState.error = { code: '42501' };
  const ui = render(<CommentWindowPage {...props} />);
  expect(ui.queryByText('Synthetic one')).toBeNull();
  expect(mockAvailable).toHaveBeenLastCalledWith(false);
  fireEvent.press(ui.getByText('Try again'));
  expect(mockLoad).toHaveBeenCalledWith('latest');
  mockState.error = new TypeError('Network request failed');
  ui.rerender(<CommentWindowPage {...props} />);
  expect(ui.getByText('Synthetic one')).toBeTruthy();
  fireEvent.press(ui.getByText('Try again'));
  expect(mockLoad).toHaveBeenLastCalledWith('next');
});

test('root list stays mounted when opening one reply pane and closing returns to it', () => {
  const onThreadChange = jest.fn();
  const shared = {
    postId: 'post',
    audience: 'everyone' as const,
    enabled: true,
    renderComment,
    onAvailability: mockAvailable,
    onThreadChange,
  };
  const ui = render(<CommentWindowList {...shared} parent={null} />);
  const root = ui.UNSAFE_getByType(FlatList);
  ui.rerender(<CommentWindowList {...shared} parent={row('root')} />);
  expect(ui.UNSAFE_getAllByType(FlatList)[0]).toBe(root);
  expect(ui.UNSAFE_getAllByType(FlatList)).toHaveLength(2);
  fireEvent.press(ui.getByText('Back to comments'));
  expect(onThreadChange).toHaveBeenCalledWith(null);
  ui.rerender(<CommentWindowList {...shared} parent={null} />);
  expect(ui.UNSAFE_getByType(FlatList)).toBe(root);
});
