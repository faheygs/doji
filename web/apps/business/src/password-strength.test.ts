import { expect, it } from 'vitest';
import { passwordStrength } from './password-strength';

it('uses a real local estimator rather than treating length or character classes as strength', () => {
  expect(passwordStrength('qwertyqwerty')).toBe(false);
  expect(passwordStrength('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
  expect(passwordStrength('velvet.orbit.jasper.harbor-57')).toBe(true);
  expect(passwordStrength('velvet.orbit.jasper.harbor-57')).toBeTypeOf('boolean');
});
