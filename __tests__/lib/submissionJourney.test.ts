jest.mock('../../lib/idempotency', () => ({ newCommandId: jest.fn(() => `diag:${Math.random()}`) }));
jest.mock('../../lib/mobileDiagnosticContext', () => ({
  mobileDiagnosticSnapshot: () => ({ session_id: mockSession }),
  diagnosticSessionIsCurrent: (session: unknown) => session === mockSession,
  recordSubmissionStep: jest.fn(),
}));
import { beginSubmissionJourney, confirmedSubmission, observeSubmissionFeed, submissionFailureContext, submissionStep } from '../../lib/submissionJourney';
import { recordSubmissionStep } from '../../lib/mobileDiagnosticContext';
let mockSession = 'initial';
beforeEach(() => { jest.useFakeTimers(); mockSession += 'x'; jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

test('only server confirmation permits successful submission copy; retries retain one journey', () => {
  const journey = beginSubmissionJourney('private-member', 'private-event');
  expect(beginSubmissionJourney('private-member', 'private-event')).toBe(journey);
  submissionStep(journey, 'upload', 'confirmed');
  expect(confirmedSubmission('private-member', 'private-event')).toBe(false);
  submissionStep(journey, 'submit', 'failed', { status: 504 });
  expect(confirmedSubmission('private-member', 'private-event')).toBe(false);
  submissionStep(journey, 'receipt', 'confirmed');
  expect(confirmedSubmission('private-member', 'private-event')).toBe(true);
  expect(confirmedSubmission('another-member', 'private-event')).toBe(false);
  expect(confirmedSubmission('private-member', 'another-event')).toBe(false);
  const error = { message: 'private body', status: 504 };
  observeSubmissionFeed('private-member', 'private-event', 'failed', error);
  expect(submissionFailureContext(error)).toEqual({ journey_id: journey.id, phase: 'feed', submission_confirmed: true });
  expect(JSON.stringify([submissionFailureContext(error), jest.mocked(recordSubmissionStep).mock.calls])).not.toMatch(/private/);
  const copy = submissionFailureContext(error)!;
  copy.phase = 'upload';
  expect(submissionFailureContext(error)?.phase).toBe('feed');
  observeSubmissionFeed('private-member', 'private-event', 'rendered');
  const count = jest.mocked(recordSubmissionStep).mock.calls.length;
  observeSubmissionFeed('private-member', 'private-event', 'rendered');
  observeSubmissionFeed('private-member', 'private-event', 'failed', error);
  expect(recordSubmissionStep).toHaveBeenCalledTimes(count);
  mockSession = 'next-session';
  expect(submissionFailureContext(error)).toBeUndefined();
});

test('unconfirmed, replaced, expired and signed-out journeys cannot claim success or record new steps', () => {
  const old = beginSubmissionJourney('member', 'event');
  observeSubmissionFeed('member', 'event', 'rendered');
  expect(recordSubmissionStep).not.toHaveBeenCalled();
  const current = beginSubmissionJourney('member', 'next-event');
  submissionStep(old, 'submit', 'confirmed');
  expect(recordSubmissionStep).not.toHaveBeenCalled();
  submissionStep(current, 'submit', 'confirmed');
  jest.advanceTimersByTime(900_001);
  expect(confirmedSubmission('member', 'next-event')).toBe(false);
  const fresh = beginSubmissionJourney('member', 'next-event');
  expect(fresh).not.toBe(current);
  mockSession = 'signed-out';
  submissionStep(fresh, 'submit', 'confirmed');
  expect(confirmedSubmission('member', 'next-event')).toBe(false);
  expect(submissionFailureContext(null)).toBeUndefined();
  expect(submissionFailureContext('private')).toBeUndefined();
  expect(submissionFailureContext({})).toBeUndefined();
});
