import {
  isTransientApiError,
  retryDelayWithJitter,
  shouldRetryQuery,
} from '../../lib/apiRetry';

describe('API retry policy', () => {
  it.each([
    [{ status: 503, message: 'Unavailable' }],
    [{ code: '429', message: 'Rate limited' }],
    [{ code: 'PGRST003', message: 'Pool timeout' }],
    [new Error('Network request failed')],
  ])('recognizes transient failures', (error) => {
    expect(isTransientApiError(error)).toBe(true);
  });

  it.each([
    [{ code: '23505', message: 'unique violation' }],
    [{ status: 401, message: 'Unauthorized' }],
    [{ status: 403, message: 'RLS violation' }],
    [{ status: 400, message: 'Invalid request' }],
  ])('does not retry deterministic failures', (error) => {
    expect(isTransientApiError(error)).toBe(false);
  });

  it('caps query retry attempts', () => {
    const transient = { status: 503 };
    expect(shouldRetryQuery(0, transient)).toBe(true);
    expect(shouldRetryQuery(1, transient)).toBe(false);
  });

  it('uses bounded exponential jitter', () => {
    const delay = retryDelayWithJitter(20);
    expect(delay).toBeGreaterThanOrEqual(3000);
    expect(delay).toBeLessThanOrEqual(5000);
  });
});
