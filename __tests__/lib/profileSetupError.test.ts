import { profileSetupError } from '../../lib/profileSetupError';

const legalMessage = 'Current Terms of Use and Privacy Policy must be accepted';

it('recognizes the structured legal prerequisite, not arbitrary backend text', () => {
  expect(profileSetupError({ code: 'P0001', message: legalMessage }, false)).toContain(
    'missing the required Terms of Use and Privacy Policy acceptance',
  );
});

it.each([
  null,
  undefined,
  'secret',
  {},
  { code: 'P0001' },
  { message: legalMessage },
  { code: 'other', message: legalMessage },
  { code: 'P0001', message: 'private SQL details' },
  new Error('private transport details'),
])('keeps unrecognized errors private and preserves uncertain completion: %p', (error) => {
  expect(profileSetupError(error, false)).toBe(
    'Doji could not confirm that your profile was saved. Check your connection, then reopen the app to check your account before trying again.',
  );
});

it('does not describe a failed refresh as a failed profile write', () => {
  expect(profileSetupError(new Error('private refresh details'), true)).toContain(
    'Your profile was saved',
  );
});
