import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { RefreshControl, View } from 'react-native';
import Toast from 'react-native-toast-message';
import Reports from '../../app/(app)/admin/reports';
import Suggestions from '../../app/(app)/admin/suggestions';
import { ReportSheet } from '../../components/feed/ReportSheet';
import { KeyboardSafeSheet } from '../../components/ui/KeyboardSafeSheet';
import { SuggestionReviewSheet } from '../../components/admin/SuggestionReviewSheet';
import { SuggestionQueueCard } from '../../components/admin/SuggestionQueueCard';
import { ModerationReportCard } from '../../components/admin/ModerationReportCard';
import { KeyboardToolbarProvider } from '../../contexts/KeyboardToolbarContext';
import {
  reportReasonsFor,
  reportDetailsFor,
  type ReportTargetKind,
} from '../../lib/reportingTaxonomy';
import type { Report, ChallengeSuggestion } from '../../types/database';
const mockRouter = { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true };
const mockDialog = jest.fn();
const mockReports = {
  data: undefined as Report[] | undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
const mockSuggestions = {
  data: undefined as ChallengeSuggestion[] | undefined,
  isLoading: false,
  isError: false,
  refetch: jest.fn(),
};
const mutation = () => ({ mutate: jest.fn(), reset: jest.fn(), isPending: false, isError: false });
const mockModerate = mutation(),
  mockReview = mutation(),
  mockReport = mutation(),
  mockBlock = mutation();
let mockBlocked = false;
jest.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: require('../../constants/theme').lightColors }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
}));
jest.mock('../../hooks/useReports', () => ({
  usePendingReports: () => mockReports,
  useModerateReport: () => mockModerate,
}));
jest.mock('../../hooks/useSuggestions', () => ({
  ...jest.requireActual('../../hooks/useSuggestions'),
  usePendingSuggestions: () => mockSuggestions,
  useReviewSuggestion: () => mockReview,
}));
jest.mock('../../hooks/useReportContent', () => ({ useReportContent: () => mockReport }));
jest.mock('../../hooks/useBlockUser', () => ({
  useBlockUser: () => mockBlock,
  useIsBlockedByMe: () => ({ data: mockBlocked }),
}));
jest.mock('../../contexts/DialogContext', () => ({
  useAppDialog: () => ({ showDialog: mockDialog }),
}));
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
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
const shell = (node: React.ReactNode) => <KeyboardToolbarProvider>{node}</KeyboardToolbarProvider>;
const suggestion = (overrides: Partial<ChallengeSuggestion> = {}) =>
  ({
    id: 'idea',
    user_id: 'member',
    kind: 'poll',
    body: 'Synthetic idea for review',
    status: 'pending',
    options: ['First', 'Second'],
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }) as ChallengeSuggestion;
const report = (overrides: Partial<Report> = {}) =>
  ({
    id: 'report',
    reason: 'spam',
    reported_user_id: 'member',
    created_at: '2026-10-01T00:00:00Z',
    post_id: 'post',
    post: { caption: 'Synthetic caption', photo_url: 'https://example.invalid/image.jpg' },
    ...overrides,
  }) as Report;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockBlocked = false;
  [mockModerate, mockReview, mockReport, mockBlock].forEach((m) => {
    m.isPending = false;
    m.isError = false;
  });
  Object.assign(mockReports, { data: undefined, isLoading: false, isError: false });
  Object.assign(mockSuggestions, { data: undefined, isLoading: false, isError: false });
});
afterEach(() => jest.useRealTimers());
describe.each(['reports', 'suggestions'])('%s queue', (kind) => {
  it.each(['loading', 'error', 'empty', 'stale'])(
    'handles %s state and retry/back',
    async (state) => {
      const query = kind === 'reports' ? mockReports : mockSuggestions;
      query.isLoading = state === 'loading';
      query.isError = state === 'error' || state === 'stale';
      if (state === 'stale') {
        if (kind === 'reports') mockReports.data = [report()];
        else mockSuggestions.data = [suggestion()];
      }
      const ui = render(shell(kind === 'reports' ? <Reports /> : <Suggestions />));
      if (state === 'loading') expect(ui.getByLabelText(`Loading pending ${kind}`)).toBeTruthy();
      if (state === 'error') {
        expect(ui.getByText(`Couldn't load ${kind}`)).toBeTruthy();
        fireEvent.press(ui.getByLabelText('Try again'));
        expect(query.refetch).toHaveBeenCalled();
      }
      if (state === 'empty') expect(ui.getByText(`No ${kind} to review`)).toBeTruthy();
      if (state === 'stale') {
        await act(async () => ui.UNSAFE_getByType(RefreshControl).props.onRefresh());
        expect(query.refetch).toHaveBeenCalled();
      }
      fireEvent.press(ui.getByLabelText('Back'));
      expect(mockRouter.back).toHaveBeenCalled();
    },
  );
});
it.each(['dismiss', 'remove_content', 'remove_and_ban'] as const)(
  'uses exact report and confirms %s before changing it',
  (action) => {
    mockReports.data = [report()];
    const ui = render(shell(<Reports />));
    fireEvent.press(
      ui.getByText(
        action === 'dismiss'
          ? 'Dismiss report'
          : action === 'remove_content'
            ? 'Remove content'
            : 'Remove content & ban user',
      ),
    );
    if (action !== 'dismiss') {
      expect(mockModerate.mutate).not.toHaveBeenCalled();
      act(() => mockDialog.mock.calls[0][0].actions[1].onPress());
    }
    expect(mockModerate.mutate.mock.calls[0][0]).toEqual({ reportId: 'report', action });
    act(() => mockModerate.mutate.mock.calls[0][1].onError());
    expect(ui.getByText('That moderation action did not complete. Try again.')).toBeTruthy();
    act(() => {
      mockModerate.mutate.mock.calls[0][1].onSuccess();
      mockModerate.mutate.mock.calls[0][1].onSettled();
    });
    expect(Toast.show).toHaveBeenCalled();
  },
);
it.each(['comment', 'poll', 'profile_photo', 'account', 'missing'])(
  'shows the original %s evidence and hides unavailable actions',
  (kind) => {
    const item = report({
      post_id: null,
      post: undefined,
      reported_user_id: kind === 'missing' ? null : 'member',
      ...(kind === 'comment'
        ? { comment_id: 'comment', comment: { body: 'Synthetic comment' } }
        : kind === 'poll'
          ? { poll_vote_id: 'vote', poll_vote: { custom_text: 'Synthetic response' } }
          : kind === 'profile_photo' || kind === 'account'
            ? { target_kind: kind }
            : {}),
    } as Partial<Report>);
    const ui = render(
      shell(<ModerationReportCard report={item} disabled={false} onAction={jest.fn()} />),
    );
    const label =
      kind === 'comment'
        ? 'REPORTED COMMENT'
        : kind === 'poll'
          ? 'REPORTED POLL RESPONSE'
          : kind === 'profile_photo'
            ? 'REPORTED PROFILE PHOTO'
            : kind === 'account'
              ? 'REPORTED ACCOUNT'
              : 'REPORTED CONTENT';
    expect(ui.getAllByText(label).length).toBeGreaterThan(0);
    if (kind === 'missing') {
      expect(ui.queryByText('Remove content')).toBeNull();
      expect(ui.queryByText('Remove content & ban user')).toBeNull();
    }
  },
);
it.each(['approve', 'reject', 'blank rejection'])(
  'reviews suggestion with %s callbacks and errors',
  (mode) => {
    mockSuggestions.data = [suggestion()];
    const ui = render(shell(<Suggestions />));
    if (mode === 'approve') fireEvent.press(ui.getByText('Approve'));
    else {
      fireEvent.press(ui.getByText('Reject'));
      if (mode === 'reject')
        fireEvent.changeText(ui.getByPlaceholderText('Reason (optional)'), '  Needs revision  ');
      fireEvent.press(ui.getAllByText('Reject').at(-1)!);
    }
    expect(mockReview.mutate.mock.calls[0][0]).toEqual(
      mode === 'approve'
        ? { id: 'idea', status: 'approved' }
        : {
            id: 'idea',
            status: 'rejected',
            adminNote: mode === 'reject' ? 'Needs revision' : null,
          },
    );
    act(() => mockReview.mutate.mock.calls[0][1].onError());
    expect(
      ui.getByText(
        `Could not ${mode === 'approve' ? 'approve' : 'reject'} this suggestion. Try again.`,
      ),
    ).toBeTruthy();
    act(() => {
      mockReview.mutate.mock.calls[0][1].onSuccess();
      mockReview.mutate.mock.calls[0][1].onSettled();
    });
    expect(Toast.show).toHaveBeenCalled();
  },
);
it.each(['approve', 'reject', 'close'])(
  'opens actual structured suggestion details then %s',
  (action) => {
    mockSuggestions.data = [
      suggestion({
        kind: 'format_question',
        options: { answer_rule: { type: 'exact_word_count', count: 2 } },
      }),
    ];
    const ui = render(shell(<Suggestions />));
    fireEvent.press(ui.getByLabelText('Review format_question suggestion'));
    expect(ui.getByText('Review suggestion')).toBeTruthy();
    act(() =>
      ui
        .UNSAFE_getByType(SuggestionReviewSheet)
        .props[action === 'approve' ? 'onApprove' : action === 'reject' ? 'onReject' : 'onClose'](),
    );
    if (action === 'approve')
      expect(mockReview.mutate.mock.calls[0][0]).toEqual({ id: 'idea', status: 'approved' });
    if (action === 'reject') {
      expect(ui.getByText('Reject suggestion')).toBeTruthy();
      fireEvent.press(ui.getByText('Cancel'));
      expect(mockReview.mutate).not.toHaveBeenCalled();
    }
  },
);
it('renders real option detail and author, and prevents action-row presses opening the card', () => {
  mockSuggestions.data = [
    suggestion({
      profile: { username: 'author', display_name: 'Author' } as ChallengeSuggestion['profile'],
    }),
  ];
  const ui = render(shell(<Suggestions />));
  const responder = ui
    .UNSAFE_getByType(SuggestionQueueCard)
    .findAllByType(View)
    .find((v) => v.props.onStartShouldSetResponder);
  expect(responder!.props.onStartShouldSetResponder()).toBe(true);
  fireEvent.press(ui.getByLabelText('Review poll suggestion'));
  expect(ui.getByText('ANSWER OPTIONS')).toBeTruthy();
  expect(ui.getByText('First')).toBeTruthy();
});
describe('member reporting flow', () => {
  it.each(['post', 'comment', 'poll_response', 'account', 'profile_photo'] as ReportTargetKind[])(
    'submits a precisely scoped %s report and separates blocking',
    (target) => {
      const props =
        target === 'post'
          ? { postId: 'post' }
          : target === 'comment'
            ? { commentId: 'comment' }
            : target === 'poll_response'
              ? { pollVoteId: 'vote' }
              : { targetKind: target as 'account' | 'profile_photo' };
      const close = jest.fn();
      const ui = render(
        shell(<ReportSheet visible reportedUserId="member" onClose={close} {...props} />),
      );
      const reason = reportReasonsFor(target)[0],
        detail = reportDetailsFor(reason.value, target).find((d) => d.value !== 'other')!;
      fireEvent.press(ui.getByText(reason.label));
      fireEvent.press(ui.getByText(detail.label));
      fireEvent.press(ui.getByText(detail.label));
      expect(mockReport.mutate).toHaveBeenCalledTimes(1);
      expect(mockReport.mutate.mock.calls[0][0]).toMatchObject({
        reportedUserId: 'member',
        targetKind: target,
        reason: reason.value,
        reasonDetail: detail.value,
      });
      act(() => ui.UNSAFE_getByType(KeyboardSafeSheet).props.onClose());
      expect(close).not.toHaveBeenCalled();
      act(() => {
        mockReport.mutate.mock.calls[0][1].onSuccess();
        mockReport.mutate.mock.calls[0][1].onSettled();
      });
      expect(ui.getByText('Thanks for letting us know')).toBeTruthy();
      expect(mockBlock.mutate).not.toHaveBeenCalled();
      fireEvent.press(ui.getByText('Block this account'));
      expect(mockBlock.mutate.mock.calls[0][0]).toEqual({ blockedUserId: 'member' });
      act(() => mockBlock.mutate.mock.calls[0][1].onSuccess());
      fireEvent.press(ui.getByText('Review Doji’s Community Standards'));
      expect(close).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).not.toHaveBeenCalled();
      act(() => ui.UNSAFE_getByType(KeyboardSafeSheet).props.onDismiss());
      expect(mockRouter.push).toHaveBeenCalledWith('/(app)/legal/terms');
    },
  );
  it.each(['Profile photo', 'Account or behavior'])(
    'allows target selection %s and step back without submitting',
    (label) => {
      const ui = render(shell(<ReportSheet visible reportedUserId="member" onClose={jest.fn()} />));
      fireEvent.press(ui.getByText(label));
      act(() => ui.UNSAFE_getByType(KeyboardSafeSheet).props.onBack());
      expect(ui.getByText('What do you want to report?')).toBeTruthy();
      fireEvent.press(ui.getByText(label));
      const target = label === 'Profile photo' ? 'profile_photo' : 'account',
        reason = reportReasonsFor(target)[0];
      fireEvent.press(ui.getByText(reason.label));
      act(() => ui.UNSAFE_getByType(KeyboardSafeSheet).props.onBack());
      expect(ui.getByText(reason.label)).toBeTruthy();
      expect(mockReport.mutate).not.toHaveBeenCalled();
    },
  );
  it('validates notes, retries a failed report and displays an independent block failure', () => {
    const close = jest.fn();
    const ui = render(
      shell(<ReportSheet visible reportedUserId="member" postId="post" onClose={close} />),
    );
    const reason = reportReasonsFor('post').find((r) =>
      reportDetailsFor(r.value, 'post').some((d) => d.value === 'other'),
    )!;
    fireEvent.press(ui.getByText(reason.label));
    const detail = reportDetailsFor(reason.value, 'post').find((d) => d.value === 'other')!;
    fireEvent.press(ui.getByText(detail.label));
    fireEvent.changeText(ui.getByPlaceholderText('Add a short explanation'), 'ab');
    fireEvent.press(ui.getByText('Submit report'));
    expect(mockReport.mutate).not.toHaveBeenCalled();
    act(() => ui.UNSAFE_getByType(KeyboardSafeSheet).props.onBack());
    fireEvent.press(ui.getByText(detail.label));
    fireEvent.changeText(
      ui.getByPlaceholderText('Add a short explanation'),
      'Synthetic explanation',
    );
    fireEvent.press(ui.getByText('Submit report'));
    expect(mockReport.mutate.mock.calls[0][0].notes).toBe('Synthetic explanation');
    act(() => {
      mockReport.mutate.mock.calls[0][1].onError();
      mockReport.mutate.mock.calls[0][1].onSettled();
    });
    expect(ui.getByText('Could not submit this report. Please try again.')).toBeTruthy();
    fireEvent.press(ui.getByText('Submit report'));
    mockBlocked = true;
    mockBlock.isError = true;
    act(() => {
      mockReport.mutate.mock.calls[1][1].onSuccess();
      mockReport.mutate.mock.calls[1][1].onSettled();
    });
    expect(ui.getByText('Could not block this account. Please try again.')).toBeTruthy();
    expect(ui.queryByText('Block this account')).toBeNull();
    fireEvent.press(ui.getByText('Done'));
    expect(close).toHaveBeenCalled();
  });
});
