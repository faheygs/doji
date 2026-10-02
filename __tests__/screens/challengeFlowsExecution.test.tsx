import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ActivityIndicator, TouchableOpacity } from 'react-native';
import Task from '../../app/(app)/task';
import Format from '../../app/(app)/format';
import Poll from '../../app/(app)/poll';
import ChallengeScreen from '../../app/(app)/challenge';
import { ChallengeTimer } from '../../components/challenge/ChallengeTimer';
import { BuyInSheet } from '../../components/economy/BuyInSheet';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import { InlineFeedback } from '../../components/ui/InlineFeedback';
import { ErrorState } from '../../components/ui/ErrorState';
import type { Challenge, UserEvent, PollOption } from '../../types/database';
import { occurrenceCommandId } from '../../lib/idempotency';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
const mockPost = { mutate: jest.fn(), isPending: false },
  mockVote = { mutate: jest.fn(), isPending: false };
let mockRead: { data?: UserEvent; isLoading: boolean; isError: boolean; refetch: jest.Mock };
const mockBuy = { eligible: true, buyIn: jest.fn(), isPending: false };
let mockBalance = 1000,
  mockDark = false;
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: require('../../constants/theme')[mockDark ? 'darkColors' : 'lightColors'],
  }),
}));
jest.mock('../../hooks/useUserEvent', () => ({
  useUserEvent: () => mockRead,
  useCreatePost: () => mockPost,
}));
jest.mock('../../hooks/usePollVote', () => ({ usePollVote: () => mockVote }));
jest.mock('../../hooks/useBuyIn', () => ({ useBuyInToday: () => mockBuy }));
jest.mock('../../hooks/useSparks', () => ({ useSparksBalance: () => mockBalance }));
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useFocusEffect: jest.fn() }));
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);
jest.mock('react-native-keyboard-controller', () =>
  require('react-native-keyboard-controller/jest'),
);
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Heavy: 'heavy', Light: 'light' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
const shell = (node: React.ReactNode) => <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>;
const event = (type: Challenge['type'] = 'task', extras: Partial<Challenge> = {}): UserEvent =>
  ({
    id: 'occurrence',
    status: 'pending',
    expires_at: new Date(Date.now() + 600000).toISOString(),
    challenge: {
      id: 'challenge',
      type,
      title: 'Synthetic question',
      description: 'Description',
      category: 'wild',
      xp_reward: 75,
      ...extras,
    },
  }) as UserEvent;
const options = [
  { id: 'a', text: 'First', is_other: false },
  { id: 'b', text: 'Second', is_other: false },
  { id: 'other', text: 'Other', is_other: true },
] as PollOption[];
const forceSubmit = async (ui: ReturnType<typeof render>) => {
  const button = ui
    .UNSAFE_getAllByType(TouchableOpacity)
    .find((x) => /Submit|Pick an option/.test(x.props.accessibilityLabel ?? ''));
  await act(async () => button!.props.onPress());
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockRead = { data: event(), isLoading: false, isError: false, refetch: jest.fn() };
  mockPost.isPending = false;
  mockVote.isPending = false;
  mockBuy.eligible = true;
  mockBuy.isPending = false;
  mockBuy.buyIn.mockResolvedValue(undefined);
  mockBalance = 1000;
  mockDark = false;
});
afterEach(() => jest.useRealTimers());
describe.each([false, true])('challenge forms dark=%s', (dark) => {
  beforeEach(() => {
    mockDark = dark;
  });
  it.each([
    ['task', Task, 'Type your answer...'],
    ['format', Format, 'Type your answer…'],
  ] as const)(
    'submits exact %s answer and navigates only on success',
    async (kind, Screen, placeholder) => {
      mockRead.data = event(kind, { answer_rule: { type: 'exact_word_count', count: 2 } });
      const ui = render(shell(<Screen />));
      fireEvent.changeText(ui.getByPlaceholderText(placeholder), ' hello world ');
      await forceSubmit(ui);
      expect(mockPost.mutate).toHaveBeenCalledWith(
        {
          userEventId: 'occurrence',
          photoUri: null,
          frontPhotoUri: null,
          videoUri: null,
          caption: 'hello world',
          isLate: false,
          postType: 'task_complete',
        },
        expect.any(Object),
      );
      expect(mockRouter.replace).not.toHaveBeenCalled();
      act(() => mockPost.mutate.mock.calls[0][1].onSuccess());
      expect(mockRouter.replace).toHaveBeenCalledWith('/(app)');
      act(() => ui.UNSAFE_getByType(ChallengeTimer).props.onExpire());
      expect(mockRead.refetch).toHaveBeenCalled();
      fireEvent.press(ui.getByLabelText('Close challenge'));
      expect(mockRouter.back).toHaveBeenCalled();
    },
  );
  it.each([
    ['task', Task, 'Type your answer...'],
    ['format', Format, 'Type your answer…'],
  ] as const)(
    'retains %s answer on command error, clears error when edited',
    async (kind, Screen, placeholder) => {
      mockRead.data = event(kind, { answer_rule: { type: 'exact_word_count', count: 2 } });
      const ui = render(shell(<Screen />));
      fireEvent.changeText(ui.getByPlaceholderText(placeholder), 'hello world');
      await forceSubmit(ui);
      act(() => mockPost.mutate.mock.calls[0][1].onError(new Error('offline')));
      expect(ui.UNSAFE_getByType(InlineFeedback)).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      fireEvent.changeText(ui.getByPlaceholderText(placeholder), 'other words');
      expect(ui.UNSAFE_queryByType(InlineFeedback)).toBeNull();
      mockPost.isPending = true;
      ui.rerender(shell(<Screen />));
      expect(ui.getByLabelText('Submit answer').props.accessibilityState.busy).toBe(true);
    },
  );
  it('submits poll vote with occurrence idempotency and guards rapid duplicate taps', async () => {
    mockRead.data = event('poll', { poll_options: options });
    const ui = render(shell(<Poll />));
    await forceSubmit(ui);
    expect(mockVote.mutate).not.toHaveBeenCalled();
    fireEvent.press(ui.getByLabelText('First'));
    await forceSubmit(ui);
    await forceSubmit(ui);
    expect(mockVote.mutate).toHaveBeenCalledTimes(1);
    expect(mockVote.mutate).toHaveBeenCalledWith(
      {
        challengeId: 'challenge',
        optionId: 'a',
        optionIndex: 0,
        userEventId: 'occurrence',
        customText: null,
        commandId: occurrenceCommandId('poll-vote', 'occurrence'),
      },
      expect.any(Object),
    );
    act(() => {
      mockVote.mutate.mock.calls[0][1].onError(new Error('offline'));
      mockVote.mutate.mock.calls[0][1].onSettled();
    });
    expect(ui.UNSAFE_getByType(InlineFeedback)).toBeTruthy();
    await forceSubmit(ui);
    expect(mockVote.mutate).toHaveBeenCalledTimes(2);
    act(() => mockVote.mutate.mock.calls[1][1].onSuccess());
    expect(mockRouter.replace).toHaveBeenCalledWith('/(app)');
  });
  it('validates Other text, resets it on option change and sends trimmed text', async () => {
    mockRead.data = event('poll', { poll_options: options });
    const ui = render(shell(<Poll />));
    fireEvent.press(ui.getByLabelText('Other'));
    await forceSubmit(ui);
    expect(ui.getByText('Type an answer for Other.')).toBeTruthy();
    const field = ui.getByPlaceholderText('Type your answer…');
    fireEvent(field, 'focus');
    act(() => jest.advanceTimersByTime(120));
    fireEvent.changeText(field, 'x'.repeat(101));
    expect(ui.getByLabelText('Submit vote').props.accessibilityState.disabled).toBe(true);
    fireEvent.changeText(field, ' Other answer ');
    await forceSubmit(ui);
    expect(mockVote.mutate.mock.calls[0][0].customText).toBe('Other answer');
    act(() => mockVote.mutate.mock.calls[0][1].onSettled());
    fireEvent.press(ui.getByLabelText('Second'));
    fireEvent.press(ui.getByLabelText('Other'));
    expect(ui.getByPlaceholderText('Type your answer…').props.value).toBe('');
    mockVote.isPending = true;
    ui.rerender(shell(<Poll />));
    expect(ui.getByLabelText('Submit vote').props.accessibilityState.busy).toBe(true);
    fireEvent.press(ui.getByLabelText('Close poll'));
    expect(mockRouter.back).toHaveBeenCalled();
    act(() => ui.UNSAFE_getByType(ChallengeTimer).props.onExpire());
    expect(mockRead.refetch).toHaveBeenCalled();
  });
});
it.each([Task, Format, Poll])('shows loading and redirects mismatched challenge type', (Screen) => {
  mockRead.isLoading = true;
  const ui = render(shell(<Screen />));
  expect(ui.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  mockRead.isLoading = false;
  mockRead.data = event('photo');
  ui.rerender(shell(<Screen />));
  expect(mockRouter.replace).toHaveBeenCalledWith('/(app)/challenge');
});
it('task supports absent event and blocks empty responses', async () => {
  mockRead.data = undefined;
  const ui = render(shell(<Task />));
  expect(ui.getByText('Challenge')).toBeTruthy();
  await forceSubmit(ui);
  fireEvent.changeText(ui.getByPlaceholderText('Type your answer...'), 'answer');
  await forceSubmit(ui);
  expect(mockPost.mutate).not.toHaveBeenCalled();
  mockRead.data = event();
  ui.rerender(shell(<Task />));
  fireEvent.changeText(ui.getByPlaceholderText('Type your answer...'), ' ');
  await forceSubmit(ui);
  expect(mockPost.mutate).not.toHaveBeenCalled();
});
it('task retries failed read instead of presenting a submit form', () => {
  mockRead.isError = true;
  const ui = render(shell(<Task />));
  act(() => ui.UNSAFE_getByType(ErrorState).props.onRetry());
  expect(mockRead.refetch).toHaveBeenCalled();
});
it.each(['absent', 'buy_in_open', 'pending'])(
  'format handles missing answer rule in %s state',
  (state) => {
    mockRead.data =
      state === 'absent' ? undefined : { ...event('format'), status: state as UserEvent['status'] };
    const ui = render(shell(<Format />));
    expect(
      ui.getByText('This format challenge is missing answer rules. Try again later.'),
    ).toBeTruthy();
    act(() => ui.UNSAFE_getByType(ChallengeTimer).props.onExpire());
    expect(mockRead.refetch).toHaveBeenCalled();
    fireEvent.press(ui.getByLabelText('Close challenge'));
    expect(mockRouter.back).toHaveBeenCalled();
  },
);
it('format rejects invalid word count at submission and hides timer for buy-in', async () => {
  mockRead.data = {
    ...event('format', { answer_rule: { type: 'exact_word_count', count: 2 }, description: '' }),
    status: 'buy_in_open',
  };
  const ui = render(shell(<Format />));
  await forceSubmit(ui);
  fireEvent.changeText(ui.getByPlaceholderText('Type your answer…'), 'one');
  await forceSubmit(ui);
  expect(mockPost.mutate).not.toHaveBeenCalled();
  expect(ui.UNSAFE_getByType(InlineFeedback)).toBeTruthy();
  expect(ui.UNSAFE_getByType(ChallengeTimer).props.expiresAt).toBeNull();
});
it.each(['empty', 'error'])('poll retries invalid %s read', (state) => {
  mockRead.data = { ...event('poll', { poll_options: [] }), status: 'buy_in_open' };
  mockRead.isError = state === 'error';
  const ui = render(shell(<Poll />));
  expect(ui.getByText("Couldn't load poll")).toBeTruthy();
  act(() => ui.UNSAFE_getByType(ErrorState).props.onRetry());
  act(() => ui.UNSAFE_getByType(ChallengeTimer).props.onExpire());
  expect(mockRead.refetch).toHaveBeenCalledTimes(2);
  fireEvent.press(ui.getByLabelText('Close poll'));
  expect(mockRouter.back).toHaveBeenCalled();
});
it('would-you-rather excludes Other even when supplied by old records', () => {
  mockRead.data = event('poll', { poll_options: options, poll_kind: 'wyr', description: '' });
  const ui = render(shell(<Poll />));
  expect(ui.queryByLabelText('Other')).toBeNull();
  expect(ui.getAllByRole('radio')).toHaveLength(2);
});
it('poll without event cannot issue a vote', async () => {
  mockRead.data = undefined;
  const ui = render(shell(<Poll />));
  expect(ui.getByText('Poll')).toBeTruthy();
  await forceSubmit(ui);
  expect(mockVote.mutate).not.toHaveBeenCalled();
});
describe('challenge entry', () => {
  it.each(['photo', 'poll', 'task', 'format'] as const)('routes live %s challenge', (type) => {
    mockRead.data = event(type);
    const ui = render(shell(<ChallengeScreen />));
    fireEvent.press(
      ui.getByText(type === 'photo' ? 'Open Camera' : type === 'poll' ? 'Vote Now' : 'Answer'),
    );
    expect(mockRouter.push).toHaveBeenCalledWith(
      type === 'photo' ? '/(app)/camera' : `/(app)/${type}`,
    );
    act(() => ui.UNSAFE_getByType(ChallengeTimer).props.onExpire());
    expect(mockRead.refetch).toHaveBeenCalled();
  });
  it.each(['loading', 'error', 'absent', 'future'])(
    'does not offer participation for %s',
    (state) => {
      mockRead.isLoading = state === 'loading';
      mockRead.isError = state === 'error';
      if (state === 'absent') mockRead.data = undefined;
      if (state === 'future')
        mockRead.data!.daily_event = {
          fires_at: new Date(Date.now() + 600000).toISOString(),
        } as UserEvent['daily_event'];
      const ui = render(shell(<ChallengeScreen />));
      expect(
        ui.getByText(
          {
            loading: 'Loading…',
            error: 'Something went wrong',
            absent: 'No challenge yet',
            future: 'Not yet',
          }[state]!,
        ),
      ).toBeTruthy();
      if (state === 'error') {
        fireEvent.press(ui.getByText('Try Again'));
        expect(mockRead.refetch).toHaveBeenCalled();
      }
      if (state !== 'loading') {
        fireEvent.press(ui.UNSAFE_getAllByType(TouchableOpacity)[0]);
        expect(mockRouter.back).toHaveBeenCalled();
      }
      expect(mockRouter.push).not.toHaveBeenCalled();
    },
  );
  it.each(['completed', 'buy_in_open', 'missed', 'expired'] as const)(
    'renders %s participation accurately',
    (state) => {
      mockRead.data = {
        ...event('photo', { description: '' }),
        status: state === 'expired' ? 'pending' : state,
        expires_at:
          state === 'expired' ? new Date(Date.now() - 1).toISOString() : mockRead.data!.expires_at,
      };
      mockBuy.eligible = false;
      const ui = render(shell(<ChallengeScreen />));
      expect(
        ui.getByText(
          state === 'completed' ? 'Done' : state === 'buy_in_open' ? 'Buy-in open' : 'Missed',
        ),
      ).toBeTruthy();
      if (state !== 'buy_in_open') {
        fireEvent.press(ui.getByText('Back to feed'));
        expect(mockRouter.back).toHaveBeenCalled();
      }
    },
  );
  it('does not offer unaffordable buy-in', () => {
    mockRead.data!.status = 'missed';
    mockBalance = 0;
    const ui = render(shell(<ChallengeScreen />));
    expect(ui.getByText(/Need .* Sparks to rejoin/)).toBeTruthy();
  });
  it.each([undefined, new Error('denied'), 'unknown'])(
    'waits for buy-in success before navigating: %s',
    async (error) => {
      mockRead.data!.status = 'missed';
      if (error) mockBuy.buyIn.mockRejectedValue(error);
      const ui = render(shell(<ChallengeScreen />));
      fireEvent.press(ui.getByLabelText(/Buy in for/));
      expect(ui.UNSAFE_getByType(BuyInSheet).props.visible).toBe(true);
      await act(async () => ui.UNSAFE_getByType(BuyInSheet).props.onConfirm());
      act(() => jest.advanceTimersByTime(50));
      expect(mockRouter.push).toHaveBeenCalledTimes(error ? 0 : 1);
      if (error)
        expect(ui.UNSAFE_getByType(BuyInSheet).props.error).toBe(
          error instanceof Error ? 'denied' : 'Try again.',
        );
      act(() => ui.UNSAFE_getByType(BuyInSheet).props.onClose());
      expect(ui.UNSAFE_getByType(BuyInSheet).props.visible).toBe(false);
    },
  );
  it('uses safe presentation defaults for legacy challenge metadata', () => {
    mockRead.data!.challenge = undefined;
    const ui = render(shell(<ChallengeScreen />));
    expect(ui.getByText('Challenge')).toBeTruthy();
    expect(ui.getByText('+50 XP')).toBeTruthy();
  });
});
