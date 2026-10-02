import {
  PROFILE_FETCH_ATTEMPTS,
  PROFILE_REQUEST_TIMEOUT_MS,
} from '../../lib/profileFetchPolicy';

describe('profile fetch policy', () => {
  it('keeps account bootstrap bounded without failing during the daily activation burst', () => {
    expect(PROFILE_FETCH_ATTEMPTS).toBe(3);
    expect(PROFILE_REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(8_000);
    expect(PROFILE_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(15_000);
  });
});
