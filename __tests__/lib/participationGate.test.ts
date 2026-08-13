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
import type { Profile, UserEvent } from '../../types/database';
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

function mockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'u-1',
    username: 'test',
    display_name: 'Test',
    avatar_url: null,
    avatar_gradient: ['#000', '#111'],
    bio: null,
    current_streak: 0,
    longest_streak: 0,
    total_completions: 0,
    total_missed: 0,
    xp: 0,
    level: 1,
    reactions_received: 0,
    streak_shields: 0,
    notification_token: null,
    app_theme: 'dark',
    sparks: 0,
    accent_theme: 'doji_orange',
    appearance_mode: 'dark',
    equipped_border_key: null,
    equipped_title_key: null,
    timezone: 'UTC',
    is_admin: false,
    onboarding_completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

  it('returns false for expired buy_in_open', () => {
    expect(
      canSubmitChallenge(
        mockEvent({
          status: 'buy_in_open',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe(false);
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

  it('is true for expired pending (no signup grace)', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(
      isMissedOrExpiredPending(mockEvent({ status: 'pending', expires_at: expired })),
    ).toBe(true);
  });

  it('is false for active pending', () => {
    expect(isMissedOrExpiredPending(mockEvent({ status: 'pending' }))).toBe(false);
  });

  it('is false for expired pending with signup grace', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    expect(
      isMissedOrExpiredPending(
        mockEvent({ status: 'pending', expires_at: expired, signup_day_grace: true }),
      ),
    ).toBe(false);
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

  it('is false for signup_day_grace', () => {
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
// isSignupDayGrace
// ---------------------------------------------------------------------------
describe('isSignupDayGrace', () => {
  it('returns true when signup_day_grace is true', () => {
    expect(isSignupDayGrace(mockEvent({ signup_day_grace: true }))).toBe(true);
  });

  it('returns false when signup_day_grace is false', () => {
    expect(isSignupDayGrace(mockEvent({ signup_day_grace: false }))).toBe(false);
  });

  it('returns false when signup_day_grace is undefined', () => {
    expect(isSignupDayGrace(mockEvent())).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSignupDayGrace(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// showSignupDayGraceBanner
// ---------------------------------------------------------------------------
describe('showSignupDayGraceBanner', () => {
  it('returns true for signup-day pending event created today', () => {
    const result = showSignupDayGraceBanner(
      mockEvent({ signup_day_grace: true, status: 'pending' }),
      mockProfile({ created_at: new Date().toISOString() }),
    );
    expect(result).toBe(true);
  });

  it('returns false when event is not signup_day_grace', () => {
    const result = showSignupDayGraceBanner(
      mockEvent({ signup_day_grace: false, status: 'pending' }),
      mockProfile({ created_at: new Date().toISOString() }),
    );
    expect(result).toBe(false);
  });

  it('returns false when event status is completed', () => {
    const result = showSignupDayGraceBanner(
      mockEvent({ signup_day_grace: true, status: 'completed' }),
      mockProfile({ created_at: new Date().toISOString() }),
    );
    expect(result).toBe(false);
  });

  it('returns false when window is expired', () => {
    const expired = new Date(Date.now() - 1000).toISOString();
    const result = showSignupDayGraceBanner(
      mockEvent({ signup_day_grace: true, status: 'pending', expires_at: expired }),
      mockProfile({ created_at: new Date().toISOString() }),
    );
    expect(result).toBe(false);
  });

  it('returns false for null event', () => {
    expect(showSignupDayGraceBanner(null, mockProfile())).toBe(false);
  });

  it('returns false for null profile', () => {
    expect(showSignupDayGraceBanner(mockEvent({ signup_day_grace: true }), null)).toBe(false);
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
