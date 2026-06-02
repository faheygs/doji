import {
  hasUnlockedFeed,
  canSubmitChallenge,
  isParticipationLocked,
  canBuyIn,
  canAffordBuyIn,
  isSignupDayGrace,
  isMissedOrExpiredPending,
  showSignupDayGraceBanner,
} from '../../lib/participationGate';
import type { Profile, UserEvent } from '../../types/database';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';

function mockEvent(overrides: Partial<UserEvent>): UserEvent {
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

describe('participationGate', () => {
  it('hasUnlockedFeed is true only for completed', () => {
    expect(hasUnlockedFeed(null)).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'pending' }))).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'completed' }))).toBe(true);
  });

  it('canSubmitChallenge when pending or buy_in_open and not expired', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'pending' }))).toBe(true);
    expect(canSubmitChallenge(mockEvent({ status: 'buy_in_open' }))).toBe(true);
    expect(canSubmitChallenge(mockEvent({ status: 'completed' }))).toBe(false);
    expect(
      canSubmitChallenge(
        mockEvent({
          status: 'buy_in_open',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it('canBuyIn for missed or expired pending without signup grace', () => {
    expect(canBuyIn(mockEvent({ status: 'missed' }))).toBe(true);
    expect(
      canBuyIn(
        mockEvent({
          status: 'pending',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe(true);
    expect(canBuyIn(mockEvent({ status: 'missed', buy_in_at: new Date().toISOString() }))).toBe(
      false,
    );
    expect(
      canBuyIn(
        mockEvent({
          status: 'pending',
          expires_at: new Date(Date.now() - 1000).toISOString(),
          signup_day_grace: true,
        }),
      ),
    ).toBe(false);
  });

  it('signup day grace helpers', () => {
    expect(isSignupDayGrace(mockEvent({ signup_day_grace: true }))).toBe(true);
    expect(
      showSignupDayGraceBanner(
        mockEvent({ signup_day_grace: true, status: 'pending' }),
        mockProfile(),
      ),
    ).toBe(true);
    expect(isMissedOrExpiredPending(mockEvent({ status: 'missed' }))).toBe(true);
  });

  it('canAffordBuyIn respects cost', () => {
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST)).toBe(true);
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST - 1)).toBe(false);
  });

  it('isParticipationLocked mirrors hasUnlockedFeed', () => {
    expect(isParticipationLocked(mockEvent({ status: 'completed' }))).toBe(false);
    expect(isParticipationLocked(mockEvent({ status: 'pending' }))).toBe(true);
  });
});
