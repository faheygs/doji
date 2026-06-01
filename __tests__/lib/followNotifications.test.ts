import {
  isFollowAcceptNotification,
  isNewFollowerNotification,
} from '../../lib/followNotifications';

describe('isFollowAcceptNotification', () => {
  it('returns true when accepted_at is after created_at', () => {
    expect(
      isFollowAcceptNotification({
        created_at: '2026-01-01T12:00:00.000Z',
        accepted_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('returns false for instant public follow (accepted_at unset)', () => {
    expect(
      isFollowAcceptNotification({
        created_at: '2026-01-01T12:00:00.000Z',
        accepted_at: null,
      }),
    ).toBe(false);
  });

  it('returns false when accepted_at equals created_at', () => {
    expect(
      isFollowAcceptNotification({
        created_at: '2026-01-01T12:00:00.000Z',
        accepted_at: '2026-01-01T12:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('isNewFollowerNotification', () => {
  it('returns true for accepted follow without accepted_at', () => {
    expect(
      isNewFollowerNotification({
        status: 'accepted',
        accepted_at: null,
      }),
    ).toBe(true);
  });

  it('returns false for pending requests', () => {
    expect(
      isNewFollowerNotification({
        status: 'pending',
        accepted_at: null,
      }),
    ).toBe(false);
  });

  it('returns false after a pending request was accepted', () => {
    expect(
      isNewFollowerNotification({
        status: 'accepted',
        accepted_at: '2026-01-02T08:00:00.000Z',
      }),
    ).toBe(false);
  });
});
