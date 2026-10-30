import { formatAuthError, normalizeEmail, isValidEmail } from '../../lib/authErrors';
import { atSubmissionStage, dojiSubmissionErrorCopy } from '../../lib/dojiSubmissionError';
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

test.each([new Error('Doji has closed'), { code: 'P0001', message: 'Doji has closed' }])(
  'closed submission has final-window copy: %s',
  (message) => {
    expect(dojiSubmissionErrorCopy(message)).toEqual({
      title: "Time's up",
      message: 'This Doji’s participation window has ended.',
    });
  },
);
test.each([new Error('Network request failed'), { status: 503 }, { status: 504 }, { name: 'TimeoutError' }])(
  'recoverable submission retains retry copy: %s',
  (message) => {
    expect(dojiSubmissionErrorCopy(message)).toEqual({
      title: 'We couldn’t confirm your submission',
      message: 'Doji didn’t return a confirmation. You can retry this same answer or return to the feed to check its status.',
    });
  },
);
test.each([null, undefined, 'private SQL details', Error('constraint violation')])(
  'unknown submission errors do not expose internals: %s',
  (error) => {
    expect(dojiSubmissionErrorCopy(error)).toEqual({
      title: "Couldn't submit",
      message: 'Doji couldn’t complete this request. Return to the feed to check your status, or try this answer again.',
    });
  },
);

test.each([
  [{ status: 401 }, 'Please sign in again'],
  [{ status: 403 }, 'Submission isn’t available'],
  [{ code: '42501' }, 'Submission isn’t available'],
  [{ status: 429 }, 'Please wait a moment'],
  [{ message: 'Doji is no longer open' }, 'This Doji is no longer available'],
  [{ message: 'Doji is not live yet' }, 'This Doji hasn’t started'],
  [{ message: 'Invalid poll option' }, 'That option is no longer available'],
  [new Error('Your message contains prohibited language.'), 'Please edit your answer'],
])('uses the known error contract without rendering raw payloads: %j', (error, title) => {
  expect(dojiSubmissionErrorCopy(error).title).toBe(title);
});
test('upload attribution preserves the original error and does not claim a failed commit', async () => {
  const error = { status: 503, message: 'private upload details' };
  await expect(atSubmissionStage('upload', () => Promise.reject(error))).rejects.toBe(error);
  expect(dojiSubmissionErrorCopy(error)).toEqual({
    title: 'Your media didn’t finish uploading',
    message: 'Try uploading again, or return to the feed to check your participation status.',
  });
  await expect(atSubmissionStage('submit', () => Promise.resolve(42))).resolves.toBe(42);
  await expect(atSubmissionStage('upload', () => Promise.reject('private'))).rejects.toBe('private');
});
test('words inside an arbitrary server message cannot masquerade as a closed window', () => {
  expect(dojiSubmissionErrorCopy({ message: 'database connection time closed unexpectedly' }).title).not.toBe("Time's up");
});

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
