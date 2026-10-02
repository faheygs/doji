import { formatAuthError, normalizeEmail, isValidEmail } from '../../lib/authErrors';
import { dojiSubmissionErrorCopy } from '../../lib/dojiSubmissionError';
import { suggestionOptionLabels, suggestionRuleLabel } from '../../lib/suggestionDetails';

test.each([
  ['Email not confirmed', 'Check your email and confirm your account, then try again.'],
  ...[
    'Email disabled',
    'Email provider unavailable',
    'Email not enabled',
    'Email signups unavailable',
  ].map((message) => [
    message,
    'Email sign-in is temporarily unavailable. Please try again later.',
  ]),
  ['Invalid email', 'Invalid email address.'],
  ...['Invalid login', 'Invalid credentials', 'Email or password incorrect'].map((message) => [
    message,
    'Wrong email or password.',
  ]),
  ...['User already registered', 'Already been registered'].map((message) => [
    message,
    'An account with this email already exists. Try signing in.',
  ]),
  ...['Rate limit exceeded', 'Too many attempts'].map((message) => [
    message,
    'Too many attempts. Wait a moment and try again.',
  ]),
  ...['Network unavailable', 'Fetch failed'].map((message) => [
    message,
    'Could not connect to Doji. Check your connection and try again.',
  ]),
])('auth message %s becomes safe actionable copy', (message, expected) => {
  expect(formatAuthError(new Error(message))).toBe(expected);
});

test.each([
  undefined,
  null,
  {},
  { message: undefined },
  { message: ' ' },
  'raw private error',
  { message: 'database secret.internal:5432 failed' },
])('unknown auth error does not expose internals: %j', (error) => {
  expect(formatAuthError(error)).toBe('Something went wrong. Please try again.');
});

test('normalizes email without changing plus-addressing', () => {
  expect(normalizeEmail('  Synthetic+Business@Example.TEST ')).toBe(
    'synthetic+business@example.test',
  );
  expect(isValidEmail(' Synthetic+Business@Example.TEST ')).toBe(true);
});
test.each(['', 'missing-at.example', 'a@@example.test', 'a@example', 'a b@example.test'])(
  'rejects malformed email %s',
  (value) => expect(isValidEmail(value)).toBe(false),
);

test.each(['Doji has closed', 'Doji is no longer open', 'Time window closed'])(
  'closed submission has final-window copy: %s',
  (message) => {
    expect(dojiSubmissionErrorCopy(new Error(message))).toEqual({
      title: "Time's up",
      message: 'The 10-minute Doji window has ended.',
    });
  },
);
test.each(['network lost', 'fetch failed', 'timeout', 'connection lost'])(
  'recoverable submission retains retry copy: %s',
  (message) => {
    expect(dojiSubmissionErrorCopy(message)).toEqual({
      title: "Couldn't post yet",
      message: 'Your response is still here. Try again.',
    });
  },
);
test.each([null, undefined, 'private SQL details', Error('constraint violation')])(
  'unknown submission errors do not expose internals: %s',
  (error) => {
    expect(dojiSubmissionErrorCopy(error)).toEqual({
      title: "Couldn't submit",
      message: 'Your response is still here. Try again.',
    });
  },
);

test('suggestion choices preserve submitted order and remove only empty/nontext values', () => {
  expect(suggestionOptionLabels([' First ', null, 4, '', '  ', 'Second', 'First'])).toEqual([
    'First',
    'Second',
    'First',
  ]);
  expect(suggestionOptionLabels({ choices: ['Not an array'] })).toEqual([]);
});
test.each([
  null,
  [],
  'text',
  {},
  { answer_rule: 'invalid' },
  { answer_rule: {} },
  { answer_rule: { type: 'unknown' } },
  { answer_rule: { type: 'starts_with_letter' } },
  { answer_rule: { type: 'exact_word_count', count: 0 } },
])('unsupported suggestion rule %j has no fabricated label', (options) => {
  expect(suggestionRuleLabel(options)).toBeNull();
});
test('format question labels match the saved rule', () => {
  expect(suggestionRuleLabel({ answer_rule: { type: 'starts_with_letter', letter: 'a' } })).toBe(
    'Answer starts with A',
  );
  expect(suggestionRuleLabel({ answer_rule: { type: 'exact_word_count', count: 2 } })).toBe(
    'Exactly 2 words',
  );
});
