import { cleanup, renderHook } from '@testing-library/react-native';
import { useSubmissionFeedFeedback } from '../../hooks/useSubmissionFeedFeedback';
import { confirmedSubmission, observeSubmissionFeed } from '../../lib/submissionJourney';
jest.mock('../../lib/submissionJourney', () => ({ confirmedSubmission: jest.fn(), observeSubmissionFeed: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); jest.mocked(confirmedSubmission).mockReturnValue(false); });
afterEach(cleanup);

test.each([
  [{ status: 401 }, 'sign in again'],
  [{ status: 429 }, 'wait a moment'],
  [{ name: 'TimeoutError' }, 'too long'],
  [{ message: 'Network request failed' }, 'Check your connection'],
  [{ status: 503 }, 'couldn’t load'],
])('feed failure has actionable safe copy (%j)', (error, message) => {
  const { result } = renderHook(() => useSubmissionFeedFeedback('member', 'event', error, false));
  expect(result.current).toContain(message);
  expect(observeSubmissionFeed).toHaveBeenCalledWith('member', 'event', 'failed', error);
});

test('confirmed answer copy does not hide expired sign-in and rendering requires ready data', () => {
  jest.mocked(confirmedSubmission).mockReturnValue(true);
  const { result, rerender } = renderHook(({ error, ready }: { error: unknown; ready: boolean }) =>
    useSubmissionFeedFeedback('member', 'event', error, ready), { initialProps: { error: { status: 503 }, ready: false } });
  expect(result.current).toContain('Your answer was submitted');
  rerender({ error: { status: 401 }, ready: false });
  expect(result.current).toContain('sign in again');
  jest.mocked(observeSubmissionFeed).mockClear();
  rerender({ error: null, ready: false });
  expect(observeSubmissionFeed).not.toHaveBeenCalled();
  rerender({ error: null, ready: true });
  expect(observeSubmissionFeed).toHaveBeenCalledWith('member', 'event', 'rendered');
});
