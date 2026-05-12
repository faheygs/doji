/**
 * Tests for streak calculation logic.
 * Replicates the core algorithm from _shared/streak.ts for Node testing.
 */

type UserEventRow = {
  status: string;
  expires_at: string;
  completed_at: string | null;
};

function computeStreak(rows: UserEventRow[]): {
  currentStreak: number;
  longestStreak: number;
  totalCompletions: number;
  totalMissed: number;
} {
  let currentStreak = 0;
  let longestStreak = 0;
  let runningStreak = 0;
  let countingCurrent = true;

  for (const event of rows) {
    const isComplete = event.status === 'completed' || event.status === 'late';

    if (isComplete) {
      runningStreak++;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      if (countingCurrent) {
        currentStreak = runningStreak;
        countingCurrent = false;
      }
      runningStreak = 0;
    }
  }

  if (countingCurrent) currentStreak = runningStreak;

  const totalCompletions = rows.filter((e) => e.status === 'completed' || e.status === 'late').length;
  const totalMissed = rows.filter((e) => e.status === 'missed').length;

  return { currentStreak, longestStreak, totalCompletions, totalMissed };
}

describe('streak computation', () => {
  const makeEvent = (status: string, daysAgo: number): UserEventRow => ({
    status,
    expires_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    completed_at: status !== 'missed' ? new Date(Date.now() - daysAgo * 86400000).toISOString() : null,
  });

  it('returns all zeros for empty events', () => {
    expect(computeStreak([])).toEqual({
      currentStreak: 0,
      longestStreak: 0,
      totalCompletions: 0,
      totalMissed: 0,
    });
  });

  it('counts a simple streak of completions', () => {
    const events = [
      makeEvent('completed', 0),
      makeEvent('completed', 1),
      makeEvent('completed', 2),
    ];
    const result = computeStreak(events);
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
    expect(result.totalCompletions).toBe(3);
  });

  it('resets current streak on a miss', () => {
    const events = [
      makeEvent('completed', 0),
      makeEvent('completed', 1),
      makeEvent('missed', 2),
      makeEvent('completed', 3),
      makeEvent('completed', 4),
      makeEvent('completed', 5),
    ];
    const result = computeStreak(events);
    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(3);
  });

  it('counts late as completed', () => {
    const events = [
      makeEvent('late', 0),
      makeEvent('completed', 1),
      makeEvent('late', 2),
    ];
    const result = computeStreak(events);
    expect(result.currentStreak).toBe(3);
    expect(result.totalCompletions).toBe(3);
  });

  it('handles all misses', () => {
    const events = [
      makeEvent('missed', 0),
      makeEvent('missed', 1),
      makeEvent('missed', 2),
    ];
    const result = computeStreak(events);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalMissed).toBe(3);
  });

  it('handles single event', () => {
    expect(computeStreak([makeEvent('completed', 0)]).currentStreak).toBe(1);
    expect(computeStreak([makeEvent('missed', 0)]).currentStreak).toBe(0);
  });

  it('tracks longest streak even when current is broken', () => {
    const events = [
      makeEvent('missed', 0),       // current ends
      makeEvent('completed', 1),
      makeEvent('completed', 2),
      makeEvent('completed', 3),
      makeEvent('completed', 4),
      makeEvent('completed', 5),
    ];
    const result = computeStreak(events);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(5);
  });
});
