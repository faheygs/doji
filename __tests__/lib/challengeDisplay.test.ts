import { challengeKindLabel } from '../../lib/challengeDisplay';
import type { Challenge } from '../../types/database';

function mockChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c-1',
    title: 'Test Challenge',
    description: null,
    type: 'photo',
    category: 'fitness',
    times_assigned: 0,
    custom_text: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// challengeKindLabel
// ---------------------------------------------------------------------------
describe('challengeKindLabel', () => {
  it('returns "Photo" for photo type', () => {
    expect(challengeKindLabel(mockChallenge({ type: 'photo' }))).toBe('Photo');
  });

  it('returns "Task" for task type', () => {
    expect(challengeKindLabel(mockChallenge({ type: 'task' }))).toBe('Task');
  });

  it('returns "Format" for format type', () => {
    expect(challengeKindLabel(mockChallenge({ type: 'format' }))).toBe('Format');
  });

  it('returns "Poll" for poll type without WYR phrase', () => {
    expect(challengeKindLabel(mockChallenge({ type: 'poll', title: 'Which is better?' }))).toBe('Poll');
  });

  it('returns "Would you rather" for poll with "would you rather" in title', () => {
    const result = challengeKindLabel(
      mockChallenge({ type: 'poll', title: 'Would you rather eat pizza or tacos?' }),
    );
    expect(result).toBe('Would you rather');
  });

  it('is case-insensitive for would-you-rather detection', () => {
    const result = challengeKindLabel(
      mockChallenge({ type: 'poll', title: 'WOULD YOU RATHER fly or swim?' }),
    );
    expect(result).toBe('Would you rather');
  });

  it('returns fallback type label for null challenge', () => {
    expect(challengeKindLabel(null)).toBe('Photo');
    expect(challengeKindLabel(null, 'task')).toBe('Task');
  });

  it('returns fallback type label for undefined challenge', () => {
    expect(challengeKindLabel(undefined, 'poll')).toBe('Poll');
  });
});
