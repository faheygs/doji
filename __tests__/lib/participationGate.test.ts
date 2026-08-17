import {
  hasUnlockedFeed,
  canSubmitChallenge,
  isParticipationLocked,
  canBuyIn,
  canAffordBuyIn,
  isSignupDayGrace,
  isMissedOrExpiredPending,
  showSignupDayGraceBanner,
  userEventStatusLabel,
} from '../../lib/participationGate';
import type { UserEvent } from '../../types/database';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';

function mockEvent(overrides: Partial<UserEvent> = {}): UserEvent {
  return {
    id: 'ue-1',
    user_id: 'u-1',
    daily_event_id: 'de-1',
    status: 'pending',
    notified_at: null,
    completed_at: null,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    buy_in_at: null,
    streak_before_miss: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hasUnlockedFeed
// ---------------------------------------------------------------------------
describe('hasUnlockedFeed', () => {
  it('is true for an on-time completion', () => {
    expect(hasUnlockedFeed(mockEvent({ status: 'completed' }))).toBe(true);
  });

  it('is true for a paid late completion', () => {
    expect(hasUnlockedFeed(mockEvent({ status: 'late' }))).toBe(true);
  });

  it('is false for pending', () => {
    expect(hasUnlockedFeed(mockEvent({ status: 'pending' }))).toBe(false);
  });

  it('is false for missed', () => {
    expect(hasUnlockedFeed(mockEvent({ status: 'missed' }))).toBe(false);
  });

  it('is false for buy_in_open', () => {
    expect(hasUnlockedFeed(mockEvent({ status: 'buy_in_open' }))).toBe(false);
  });

  it('is false for null', () => {
    expect(hasUnlockedFeed(null)).toBe(false);
  });

  it('is false for undefined', () => {
    expect(hasUnlockedFeed(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canSubmitChallenge
// ---------------------------------------------------------------------------
describe('canSubmitChallenge', () => {
  it('returns true for pending within window', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'pending' }))).toBe(true);
  });

  it('returns true for buy_in_open within window', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'buy_in_open' }))).toBe(true);
  });

  it('returns false for completed', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'completed' }))).toBe(false);
  });

  it('returns false for missed', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'missed' }))).toBe(false);
  });

  it('returns false for expired pending', () => {
    expect(
      canSubmitChallenge(
        mockEvent({ status: 'pending', expires_at: new Date(Date.now() - 1000).toISOString() }),
      ),
    ).toBe(false);
  });

  it('keeps a paid buy-in open after the original deadline', () => {
    expect(
      canSubmitChallenge(
        mockEvent({
          status: 'buy_in_open',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe(true);
  });

  it('returns false for null', () => {
    expect(canSubmitChallenge(null)).toBe(false);
  });

  it('accepts Supabase space format for expires_at', () => {
    const supabaseFuture = new Date(Date.now() + 600_000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '+00');
    expect(canSubmitChallenge(mockEvent({ status: 'pending', expires_at: supabaseFuture }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isParticipationLocked
// ---------------------------------------------------------------------------
describe('isParticipationLocked', () => {
  it('is false for completed', () => {
    expect(isParticipationLocked(mockEvent({ status: 'completed' }))).toBe(false);
  });

  it('is true for pending (not completed)', () => {
    expect(isParticipationLocked(mockEvent({ status: 'pending' }))).toBe(true);
  });

  it('is true for null', () => {
    expect(isParticipationLocked(null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isMissedOrExpiredPending
// ---------------------------------------------------------------------------
describe('isMissedOrExpiredPending', () => {
  it('is true for missed status', () => {
    expect(isMissedOrExpiredPending(mockEvent({ status: 'missed' }))).toBe(true);
  });

  it('is true for expired pending', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(
      isMissedOrExpiredPending(mockEvent({ status: 'pending', expires_at: expired })),
    ).toBe(true);
  });

  it('is false for active pending', () => {
    expect(isMissedOrExpiredPending(mockEvent({ status: 'pending' }))).toBe(false);
  });

  it('treats an expired signup-day exception as missed', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(
      isMissedOrExpiredPending(
        mockEvent({ status: 'pending', expires_at: expired, signup_day_grace: true }),
      ),
    ).toBe(true);
  });

  it('is false for null/undefined', () => {
    expect(isMissedOrExpiredPending(null)).toBe(false);
    expect(isMissedOrExpiredPending(undefined)).toBe(false);
  });

  it('accepts Supabase space format for expires_at', () => {
    const expired = '2020-01-01 00:00:00+00';
    expect(
      isMissedOrExpiredPending(mockEvent({ status: 'pending', expires_at: expired })),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// canBuyIn
// ---------------------------------------------------------------------------
describe('canBuyIn', () => {
  it('is true for missed event with no prior buy-in', () => {
    expect(canBuyIn(mockEvent({ status: 'missed' }))).toBe(true);
  });

  it('is true for expired pending with no buy-in', () => {
    expect(
      canBuyIn(mockEvent({ status: 'pending', expires_at: new Date(Date.now() - 1000).toISOString() })),
    ).toBe(true);
  });

  it('is false when buy_in_at is already set', () => {
    expect(canBuyIn(mockEvent({ status: 'missed', buy_in_at: new Date().toISOString() }))).toBe(
      false,
    );
  });

  it('does not charge a signup-day exception', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(
      canBuyIn(mockEvent({ status: 'pending', expires_at: expired, signup_day_grace: true })),
    ).toBe(false);
  });

  it('is false for active pending (not expired)', () => {
    expect(canBuyIn(mockEvent({ status: 'pending' }))).toBe(false);
  });

  it('is false for completed', () => {
    expect(canBuyIn(mockEvent({ status: 'completed' }))).toBe(false);
  });

  it('is false for null', () => {
    expect(canBuyIn(null)).toBe(false);
  });
});

describe('signup-day exception', () => {
  it('recognizes the server-owned flag', () => {
    expect(isSignupDayGrace(mockEvent({ signup_day_grace: true }))).toBe(true);
    expect(isSignupDayGrace(mockEvent({ signup_day_grace: false }))).toBe(false);
  });

  it('shows the free entry while its server deadline remains open', () => {
    expect(showSignupDayGraceBanner(mockEvent({ signup_day_grace: true }))).toBe(true);
  });

  it('hides the free entry after its server deadline', () => {
    expect(showSignupDayGraceBanner(mockEvent({
      signup_day_grace: true,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canAffordBuyIn
// ---------------------------------------------------------------------------
describe('canAffordBuyIn', () => {
  it('returns true when sparks equal cost', () => {
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST)).toBe(true);
  });

  it('returns true when sparks exceed cost', () => {
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST + 100)).toBe(true);
  });

  it('returns false when sparks are below cost', () => {
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST - 1)).toBe(false);
  });

  it('returns false for 0 sparks (unless cost is 0)', () => {
    if (SPARKS_BUY_IN_COST > 0) {
      expect(canAffordBuyIn(0)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// userEventStatusLabel
// ---------------------------------------------------------------------------
describe('userEventStatusLabel', () => {
  it.each([
    ['completed', 'Completed'],
    ['missed', 'Missed'],
    ['late', 'Late'],
    ['buy_in_open', 'Buy-in open'],
    ['pending', 'Pending'],
  ] as const)('returns correct label for "%s"', (status, expected) => {
    expect(userEventStatusLabel(status)).toBe(expected);
  });

  it('returns "Unknown" for undefined', () => {
    expect(userEventStatusLabel(undefined)).toBe('Unknown');
  });
});
