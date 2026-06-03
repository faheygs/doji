import {
  required,
  minLength,
  maxLength,
  validateEmailField,
  validatePasswordField,
  validatePasswordMatch,
  validationMessage,
} from '../../lib/formValidation';

// ---------------------------------------------------------------------------
// required
// ---------------------------------------------------------------------------
describe('required', () => {
  it('passes for non-empty string', () => {
    expect(required('hello')).toEqual({ ok: true });
  });

  it('fails for empty string', () => {
    const result = required('');
    expect(result.ok).toBe(false);
  });

  it('fails for whitespace-only string', () => {
    const result = required('   ');
    expect(result.ok).toBe(false);
  });

  it('uses default message', () => {
    const result = required('');
    expect(result).toMatchObject({ ok: false, message: 'This field is required.' });
  });

  it('uses custom message', () => {
    const result = required('', 'Name is required.');
    expect(result).toMatchObject({ ok: false, message: 'Name is required.' });
  });

  it('passes for string with just a non-whitespace character', () => {
    expect(required('a')).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// minLength
// ---------------------------------------------------------------------------
describe('minLength', () => {
  it('passes when length equals minimum', () => {
    expect(minLength('abc', 3)).toEqual({ ok: true });
  });

  it('passes when length exceeds minimum', () => {
    expect(minLength('hello', 3)).toEqual({ ok: true });
  });

  it('fails when trimmed length is below minimum', () => {
    const result = minLength('ab', 3);
    expect(result.ok).toBe(false);
  });

  it('uses default message with count', () => {
    const result = minLength('ab', 5);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain('5');
  });

  it('uses custom message when provided', () => {
    const result = minLength('a', 3, 'Too short!');
    expect(result).toMatchObject({ ok: false, message: 'Too short!' });
  });

  it('trims before checking length', () => {
    const result = minLength('  a  ', 3);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// maxLength
// ---------------------------------------------------------------------------
describe('maxLength', () => {
  it('passes when length equals maximum', () => {
    expect(maxLength('abc', 3)).toEqual({ ok: true });
  });

  it('passes when length is below maximum', () => {
    expect(maxLength('ab', 3)).toEqual({ ok: true });
  });

  it('fails when length exceeds maximum', () => {
    const result = maxLength('abcde', 3);
    expect(result.ok).toBe(false);
  });

  it('uses default message', () => {
    const result = maxLength('toolong', 3);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain('3');
  });

  it('uses custom message', () => {
    const result = maxLength('toolong', 3, 'Way too long.');
    expect(result).toMatchObject({ ok: false, message: 'Way too long.' });
  });

  it('does not trim — checks raw length', () => {
    expect(maxLength('  a  ', 5)).toEqual({ ok: true });
    const result = maxLength('  a  ', 4);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateEmailField
// ---------------------------------------------------------------------------
describe('validateEmailField', () => {
  it('passes for valid email', () => {
    expect(validateEmailField('user@example.com')).toEqual({ ok: true });
  });

  it('passes for email with subdomain', () => {
    expect(validateEmailField('user@mail.example.co.uk')).toEqual({ ok: true });
  });

  it('fails for empty string', () => {
    const result = validateEmailField('');
    expect(result).toMatchObject({ ok: false, message: 'Enter your email address.' });
  });

  it('fails for whitespace-only', () => {
    const result = validateEmailField('   ');
    expect(result).toMatchObject({ ok: false, message: 'Enter your email address.' });
  });

  it('fails for missing @', () => {
    const result = validateEmailField('notanemail');
    expect(result).toMatchObject({ ok: false, message: 'Enter a valid email address.' });
  });

  it('fails for missing domain', () => {
    const result = validateEmailField('user@');
    expect(result).toMatchObject({ ok: false, message: 'Enter a valid email address.' });
  });

  it('trims whitespace before validating', () => {
    expect(validateEmailField('  user@example.com  ')).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// validatePasswordField
// ---------------------------------------------------------------------------
describe('validatePasswordField', () => {
  it('passes for password meeting default minimum (6)', () => {
    expect(validatePasswordField('secret')).toEqual({ ok: true });
  });

  it('passes for password longer than minimum', () => {
    expect(validatePasswordField('supersecretpassword')).toEqual({ ok: true });
  });

  it('fails for password shorter than minimum', () => {
    const result = validatePasswordField('abc');
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain('6');
  });

  it('respects custom minimum', () => {
    expect(validatePasswordField('ab', 2)).toEqual({ ok: true });
    const result = validatePasswordField('a', 2);
    expect(result.ok).toBe(false);
  });

  it('fails for empty string', () => {
    expect(validatePasswordField('').ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validatePasswordMatch
// ---------------------------------------------------------------------------
describe('validatePasswordMatch', () => {
  it('passes when passwords match', () => {
    expect(validatePasswordMatch('secret123', 'secret123')).toEqual({ ok: true });
  });

  it('fails when confirm is empty', () => {
    const result = validatePasswordMatch('secret', '');
    expect(result).toMatchObject({ ok: false, message: 'Confirm your password.' });
  });

  it('fails when passwords do not match', () => {
    const result = validatePasswordMatch('secret', 'different');
    expect(result).toMatchObject({ ok: false, message: 'Passwords do not match.' });
  });

  it('is case-sensitive', () => {
    const result = validatePasswordMatch('Secret', 'secret');
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validationMessage
// ---------------------------------------------------------------------------
describe('validationMessage', () => {
  it('returns undefined for null', () => {
    expect(validationMessage(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(validationMessage(undefined)).toBeUndefined();
  });

  it('returns undefined for ok: true', () => {
    expect(validationMessage({ ok: true })).toBeUndefined();
  });

  it('returns message for ok: false', () => {
    expect(validationMessage({ ok: false, message: 'Error!' })).toBe('Error!');
  });
});
