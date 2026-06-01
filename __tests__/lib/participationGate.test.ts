import {
  hasUnlockedFeed,
  canSubmitChallenge,
  isParticipationLocked,
} from '../../lib/participationGate';
import type { UserEvent } from '../../types/database';

function mockEvent(overrides: Partial<UserEvent>): UserEvent {
  return {
    id: 'ue-1',
    user_id: 'u-1',
    daily_event_id: 'de-1',
    status: 'pending',
    notified_at: null,
    completed_at: null,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
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
    expect(hasUnlockedFeed(mockEvent({ status: 'completed' }))).toBe(true);
  });

  it('canSubmitChallenge when pending and not expired', () => {
    expect(canSubmitChallenge(mockEvent({ status: 'pending' }))).toBe(true);
    expect(canSubmitChallenge(mockEvent({ status: 'completed' }))).toBe(false);
    expect(
      canSubmitChallenge(
        mockEvent({
          status: 'pending',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it('isParticipationLocked mirrors hasUnlockedFeed', () => {
    expect(isParticipationLocked(mockEvent({ status: 'completed' }))).toBe(false);
    expect(isParticipationLocked(mockEvent({ status: 'pending' }))).toBe(true);
  });
});
