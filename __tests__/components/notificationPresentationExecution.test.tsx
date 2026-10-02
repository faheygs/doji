import 'react-native-gesture-handler/jestSetup';
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { FlatList, Modal, Text as NativeText } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import { NotificationActorRow } from '../../components/notifications/NotificationActorRow';
import { lightColors, darkColors } from '../../constants/theme';
import type { NotificationCenterItem } from '../../lib/notificationCenterTypes';
import type { FriendshipWithRequester, Profile, UserEvent } from '../../types/database';
import { ROUTES } from '../../lib/routes';

let mockColors = lightColors;
const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockRespond = { mutate: jest.fn(), isPending: false };
const mockCommand = jest.fn();
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
jest.mock('../../hooks/useFriendRequests', () => ({
  useRespondToFriendRequest: () => mockRespond,
}));
jest.mock('../../lib/commandGateway', () => ({
  executeCommand: (...args: unknown[]) => mockCommand(...args),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: { getState: () => ({ profile: { username: 'self' } }) },
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
const actor = {
  username: 'friend',
  display_name: 'A Friend',
  avatar_url: null,
  equipped_border_key: 'border_gold',
};
const base = { key: 'notification', sortAt: '2026-10-01T00:00:00Z' };
const items: NotificationCenterItem[] = [
  {
    ...base,
    kind: 'friend_accepted',
    friendship: { id: 'friendship', addressee: actor as Profile } as Extract<
      NotificationCenterItem,
      { kind: 'friend_accepted' }
    >['friendship'],
  },
  ...(['comment', 'comment_like', 'mention', 'comment_reply'] as const).map((kind) => ({
    ...base,
    kind,
    actor,
    post_id: 'post',
    comment_id: 'comment',
  })),
  {
    ...base,
    kind: 'comment_likes_group',
    actors: [actor],
    count: 1,
    post_id: 'post',
    comment_id: 'comment',
  },
  {
    ...base,
    kind: 'reactions_group',
    actors: [actor],
    count: 2,
    emojis: ['🔥', '❤️'],
    post_id: 'post',
  },
  { ...base, kind: 'friend_activity_group', actors: [actor], count: 1, daily_event_id: 'event' },
  { ...base, kind: 'challenge', userEvent: { challenge: { title: 'Daily prompt' } } as UserEvent },
  {
    ...base,
    kind: 'badge_earned',
    categoryId: 'ideas',
    categoryName: 'Idea maker',
    categoryEmoji: null,
    tier: 'bronze',
  },
  {
    ...base,
    kind: 'suggestion_result',
    suggestionId: 'idea',
    body: 'Show the sunset',
    status: 'approved',
  },
  {
    ...base,
    kind: 'suggestion_result',
    suggestionId: 'idea',
    body: 'Long description '.repeat(6),
    status: 'rejected',
  },
  { ...base, kind: 'poll_vote', actor },
  {
    ...base,
    kind: 'moderation_notice',
    notice_id: 'notice',
    decision_id: 'decision',
    notice_kind: 'decision',
    title: 'Account notice',
    body: 'Review your account status',
  },
];
const request: NotificationCenterItem = {
  ...base,
  kind: 'friend_request',
  friendship: { id: 'friendship', requester: actor } as FriendshipWithRequester,
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockColors = lightColors;
  mockRespond.isPending = false;
  mockCommand.mockResolvedValue({ data: null, error: null });
});
afterEach(() => jest.useRealTimers());

describe.each(['light', 'dark'])('%s notification delivery UI', (mode) => {
  beforeEach(() => {
    mockColors = mode === 'dark' ? darkColors : lightColors;
  });
  it.each(items.map((item) => [item.kind, item] as const))(
    'opens %s only after dismissing the sheet',
    (_, item) => {
      const close = jest.fn();
      const ui = render(
        <NotificationSheet visible onClose={close} items={[item]} isLoading={false} />,
      );
      const row = ui.UNSAFE_getByType(NotificationActorRow);
      act(() => row.props.onPress());
      expect(close).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).not.toHaveBeenCalled();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      ui.rerender(
        <NotificationSheet visible={false} onClose={close} items={[item]} isLoading={false} />,
      );
      act(() => jest.advanceTimersByTime(20));
      expect(mockRouter.push.mock.calls.length + mockRouter.replace.mock.calls.length).toBe(1);
      if (item.kind === 'moderation_notice')
        expect(mockCommand).toHaveBeenCalledWith('mark_moderation_notice_read', {
          p_notice_id: 'notice',
        });
      else expect(mockCommand).not.toHaveBeenCalled();
      if (item.kind === 'challenge')
        expect(mockRouter.replace).toHaveBeenCalledWith(ROUTES.challenge);
      if (item.kind === 'badge_earned' || item.kind === 'suggestion_result')
        expect(mockRouter.replace).toHaveBeenCalledWith(ROUTES.profile);
    },
  );
  it('accepts and declines exact friend requests without clearing actionable requests', () => {
    const clear = jest.fn();
    const ui = render(
      <NotificationSheet
        visible
        onClose={jest.fn()}
        items={[request]}
        isLoading={false}
        onClearHistory={clear}
      />,
    );
    fireEvent.press(ui.getByText('Accept'));
    fireEvent.press(ui.getByText('Decline'));
    expect(mockRespond.mutate.mock.calls).toEqual([
      [{ friendshipId: 'friendship', accept: true }],
      [{ friendshipId: 'friendship', accept: false }],
    ]);
    expect(ui.queryByText('Clear notifications')).toBeNull();
    mockRespond.isPending = true;
    ui.rerender(
      <NotificationSheet visible onClose={jest.fn()} items={[request]} isLoading={false} />,
    );
    fireEvent.press(ui.getAllByRole('button', { disabled: true })[0]);
    expect(mockRespond.mutate).toHaveBeenCalledTimes(2);
  });
});

it('reports only viewable items using the current visibility callback', () => {
  const seen = jest.fn(),
    next = jest.fn();
  const props = { visible: true, onClose: jest.fn(), items, isLoading: false };
  const ui = render(<NotificationSheet {...props} onItemsVisible={seen} />);
  fireEvent(ui.UNSAFE_getByType(FlatList), 'viewableItemsChanged', {
    viewableItems: [
      { isViewable: true, item: items[0] },
      { isViewable: false, item: items[1] },
      { isViewable: true, item: null },
    ],
  });
  expect(seen).toHaveBeenCalledWith([items[0]]);
  ui.rerender(<NotificationSheet {...props} onItemsVisible={next} />);
  fireEvent(ui.UNSAFE_getByType(FlatList), 'viewableItemsChanged', { viewableItems: [] });
  expect(next).toHaveBeenCalledWith([]);
});
it('distinguishes loading, empty, failed read and cached-refresh feedback', () => {
  const close = jest.fn(),
    retry = jest.fn();
  const props = { visible: true, onClose: close, items: [], isLoading: true };
  const ui = render(<NotificationSheet {...props} />);
  expect(ui.queryByText("You're all caught up")).toBeNull();
  ui.rerender(<NotificationSheet {...props} isLoading={false} />);
  expect(ui.getByText("You're all caught up")).toBeTruthy();
  ui.rerender(
    <NotificationSheet
      {...props}
      isLoading={false}
      readError={new Error('offline')}
      onRetryRead={retry}
    />,
  );
  expect(ui.getByText('Could not load notifications. Please try again.')).toBeTruthy();
  expect(ui.queryByText("You're all caught up")).toBeNull();
  fireEvent.press(ui.getByLabelText('Try loading again'));
  expect(retry).toHaveBeenCalled();
  ui.rerender(
    <NotificationSheet
      {...props}
      isLoading={false}
      items={[items[0]]}
      readError={new Error('offline')}
      onRetryRead={retry}
      isRefetching
    />,
  );
  expect(
    ui.getByText('Could not refresh notifications. Previously loaded activity is shown.'),
  ).toBeTruthy();
  fireEvent.press(ui.getByLabelText('Try loading again'));
  expect(retry).toHaveBeenCalledTimes(1);
  fireEvent.press(ui.getByLabelText('Close notifications'));
  fireEvent(ui.UNSAFE_getByType(Modal), 'requestClose');
  expect(close).toHaveBeenCalledTimes(2);
});
it.each([false, true])('handles clear-history failure=%s without losing feedback', async (fail) => {
  const clear = jest
    .fn()
    .mockImplementation(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve()));
  const props = {
    visible: true,
    onClose: jest.fn(),
    items: [items[0]],
    isLoading: false,
    onClearHistory: clear,
  };
  const ui = render(<NotificationSheet {...props} />);
  await act(async () => fireEvent.press(ui.getByText('Clear notifications')));
  expect(clear).toHaveBeenCalledTimes(1);
  expect(Boolean(ui.queryByText("Couldn't update notifications. Try again."))).toBe(fail);
  ui.rerender(<NotificationSheet {...props} isClearing />);
  fireEvent.press(ui.getByRole('button', { disabled: true }));
  expect(clear).toHaveBeenCalledTimes(1);
});
it.each([false, true])('handles swipe dismissal failure=%s with exact item key', async (fail) => {
  const dismiss = jest
    .fn()
    .mockImplementation(() => (fail ? Promise.reject(new Error('offline')) : Promise.resolve()));
  const ui = render(
    <NotificationSheet
      visible
      onClose={jest.fn()}
      items={[items[0]]}
      isLoading={false}
      onDismissItem={dismiss}
    />,
  );
  const actions = ui.UNSAFE_getByType(Swipeable).props.renderRightActions();
  const actionUI = render(actions);
  await act(async () => fireEvent.press(actionUI.getByText('Dismiss')));
  expect(dismiss).toHaveBeenCalledWith('notification');
  expect(Boolean(ui.queryByText("Couldn't update notifications. Try again."))).toBe(fail);
});
it.each(['comment', 'comment_like', 'mention', 'comment_reply', 'poll_vote'] as const)(
  'opens %s actor separately from its destination',
  (kind) => {
    const item = items.find((item) => item.kind === kind)!;
    const close = jest.fn();
    const props = { visible: true, onClose: close, items: [item], isLoading: false };
    const ui = render(<NotificationSheet {...props} />);
    act(() => ui.UNSAFE_getByType(NotificationActorRow).props.onActorPress());
    expect(close).toHaveBeenCalled();
    ui.rerender(<NotificationSheet {...props} visible={false} />);
    act(() => jest.advanceTimersByTime(20));
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
  },
);
it('supports anonymous actors and custom leading/footer content accessibly', () => {
  const open = jest.fn();
  const ui = render(<NotificationActorRow title="Notice" body="Details" sortAt={base.sortAt} />);
  expect(ui.getByText('Notice')).toBeTruthy();
  expect(ui.queryByRole('button')).toBeNull();
  ui.rerender(
    <NotificationActorRow
      title="Notice"
      body="Details"
      sortAt={base.sortAt}
      actor={{ ...actor, username: '', display_name: '' }}
      onActorPress={open}
      onPress={open}
      accessibilityLabel="Open notice"
      footer={<NativeText>Footer</NativeText>}
    />,
  );
  fireEvent.press(ui.getByLabelText('Open profile'));
  fireEvent.press(ui.getByLabelText('Open notice'));
  expect(open).toHaveBeenCalledTimes(2);
  expect(ui.getByText('Footer')).toBeTruthy();
});
