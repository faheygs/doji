import { describe, expect, it } from '@jest/globals';
import { assessBirthDate, formatBirthDateInput } from '../ageAssurance';

const TODAY = new Date(2026, 7, 18);

describe('assessBirthDate', () => {
  it('accepts a user on their thirteenth birthday', () => {
    expect(assessBirthDate('08/18/2013', TODAY)).toEqual({
      ok: true,
      isoDate: '2013-08-18',
    });
  });

  it('rejects a user who turns thirteen tomorrow', () => {
    expect(assessBirthDate('08/19/2013', TODAY)).toEqual({
      ok: false,
      message: 'You must be at least 13 to use Doji.',
    });
  });

  it('rejects impossible dates and implausible ages', () => {
    expect(assessBirthDate('02/30/2000', TODAY).ok).toBe(false);
    expect(assessBirthDate('01/01/1800', TODAY).ok).toBe(false);
  });

  it('normalizes a valid date for the server RPC', () => {
    expect(assessBirthDate('2/9/2000', TODAY)).toEqual({
      ok: true,
      isoDate: '2000-02-09',
    });
  });
});

describe('formatBirthDateInput', () => {
  it('formats digits without retaining non-date characters', () => {
    expect(formatBirthDateInput('08182000')).toBe('08/18/2000');
    expect(formatBirthDateInput('08a18b20')).toBe('08/18/20');
  });
});
