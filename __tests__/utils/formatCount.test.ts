import { formatCompactCount } from '../../utils/formatCount';

describe('formatCompactCount', () => {
  it('shows integers under 1000', () => {
    expect(formatCompactCount(0)).toBe('0');
    expect(formatCompactCount(42)).toBe('42');
    expect(formatCompactCount(999)).toBe('999');
  });

  it('uses k for thousands', () => {
    expect(formatCompactCount(1000)).toBe('1k');
    expect(formatCompactCount(1500)).toBe('1.5k');
    expect(formatCompactCount(10000)).toBe('10k');
    expect(formatCompactCount(10500)).toBe('10.5k');
    expect(formatCompactCount(999_499)).toBe('999k');
  });

  it('uses m for millions', () => {
    expect(formatCompactCount(1_000_000)).toBe('1m');
    expect(formatCompactCount(1_500_000)).toBe('1.5m');
  });

  it('clamps negatives', () => {
    expect(formatCompactCount(-3)).toBe('0');
  });
});
