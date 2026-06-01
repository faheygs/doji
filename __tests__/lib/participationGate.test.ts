import {
  hasUnlockedFeed,
  canSubmitChallenge,
  isParticipationLocked,
  canBuyIn,
  canAffordBuyIn,
} from '../../lib/participationGate';
import type { UserEvent } from '../../types/database';
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

describe('participationGate', () => {
  it('hasUnlockedFeed is true only for completed', () => {
    expect(hasUnlockedFeed(null)).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'pending' }))).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'late' }))).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'missed' }))).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'buy_in_open' }))).toBe(false);
    expect(hasUnlockedFeed(mockEvent({ status: 'completed' }))).toBe(true);
  });

  it('canSubmitChallenge when pending or buy_in_open and not expired', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'pending' }))).toBe(true);
    expect(canSubmitChallenge(mockEvent({ status: 'buy_in_open' }))).toBe(true);
    expect(canSubmitChallenge(mockEvent({ status: 'completed' }))).toBe(false);
    expect(canSubmitChallenge(mockEvent({ status: 'missed' }))).toBe(false);
    expect(
      canSubmitChallenge(
        mockEvent({
          status: 'buy_in_open',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it('canBuyIn only for missed without prior buy-in', () => {
    expect(canBuyIn(mockEvent({ status: 'missed' }))).toBe(true);
    expect(canBuyIn(mockEvent({ status: 'missed', buy_in_at: new Date().toISOString() }))).toBe(false);
    expect(canBuyIn(mockEvent({ status: 'pending' }))).toBe(false);
  });

  it('canAffordBuyIn respects cost', () => {
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST)).toBe(true);
    expect(canAffordBuyIn(SPARKS_BUY_IN_COST - 1)).toBe(false);
  });

  it('isParticipationLocked mirrors hasUnlockedFeed', () => {
    expect(isParticipationLocked(mockEvent({ status: 'completed' }))).toBe(false);
    expect(isParticipationLocked(mockEvent({ status: 'pending' }))).toBe(true);
    expect(isParticipationLocked(mockEvent({ status: 'buy_in_open' }))).toBe(true);
  });
});
