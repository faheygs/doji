import { SubmissionOutcomeCounts, workflowReadPhase } from '../../lib/submissionOutcomeCounts';

test('bounded device observations keep attempts distinct from confirmed outcomes', () => {
  const counts = new SubmissionOutcomeCounts();
  counts.record('submit', 'started', 60_000);
  counts.record('submit', 'request_failed', 60_001);
  counts.record('receipt', 'confirmed', 60_002);
  counts.record('feed', 'rendered', 60_003);
  expect(counts.snapshot(60_004)).toEqual({ source: 'device_reported', windowMinutes: 15, rows: [
    { minute: 1, phase: 'submit', outcome: 'started', count: 1, capped: false },
    { minute: 1, phase: 'submit', outcome: 'request_failed', count: 1, capped: false },
    { minute: 1, phase: 'receipt', outcome: 'confirmed', count: 1, capped: false },
    { minute: 1, phase: 'feed', outcome: 'rendered', count: 1, capped: false },
  ] });
  const copy = counts.snapshot(60_005);
  copy.rows[0].count = 999;
  expect(counts.snapshot(60_006).rows[0].count).toBe(1);
  counts.reset();
  expect(counts.snapshot(60_007).rows).toEqual([]);
});

test('read workflow labels are fixed and never interpret arbitrary keys or identifiers', () => {
  for (const [operation, phase] of [['profile', 'profile_read'], ['upcomingDoji', 'doji_read'], ['feed', 'feed_read'], ['friends', 'social_read'], ['shop', 'economy_read']])
    expect(workflowReadPhase(operation)).toBe(phase);
  for (const operation of [null, {}, ['profile', 'private-id'], 'private-id', 'other'])
    expect(workflowReadPhase(operation)).toBeNull();
  const counts = new SubmissionOutcomeCounts();
  for (let minute = 0; minute < 20; minute++)
    for (const phase of ['profile_read', 'doji_read', 'feed_read', 'social_read', 'economy_read'] as const)
      for (const outcome of ['started', 'confirmed', 'request_failed'] as const)
        counts.record(phase, outcome, minute * 60_000);
  expect(counts.snapshot(19 * 60_000).rows).toHaveLength(15 * 15);
});

test('caps counts explicitly, prunes only local expired windows, and handles clock rollback', () => {
  const counts = new SubmissionOutcomeCounts();
  for (let n = 0; n < 1001; n++) counts.record('upload', 'started', 60_000);
  expect(counts.snapshot(60_000).rows[0]).toMatchObject({ count: 1000, capped: true });
  expect(counts.snapshot(15 * 60_000).rows).toHaveLength(1);
  expect(counts.snapshot(16 * 60_000).rows).toEqual([]);
  counts.record('feed', 'request_failed', 20 * 60_000);
  counts.record('submit', 'started', 10 * 60_000);
  expect(counts.snapshot(10 * 60_000).rows).toEqual([
    { minute: 10, phase: 'submit', outcome: 'started', count: 1, capped: false },
  ]);
});

test('rejects invalid inputs and cannot grow with arbitrary labels or private fields', () => {
  const counts = new SubmissionOutcomeCounts();
  for (const time of [-1, NaN, Infinity, 0.5]) {
    counts.record('submit', 'started', time);
    expect(counts.snapshot(time).rows).toEqual([]);
  }
  counts.record('feed', 'confirmed', 0);
  counts.record('submit', 'rendered', 0);
  // Exercise the runtime boundary, not just its TypeScript labels.
  counts.record('private-member' as 'submit', 'started', 0);
  counts.record('submit', 'private-answer' as 'confirmed', 0);
  expect(counts.snapshot(0).rows).toEqual([]);
  for (let minute = 0; minute < 100; minute++)
    for (const phase of ['upload', 'submit', 'receipt', 'feed'] as const)
      for (const outcome of ['started', 'confirmed', 'request_failed', 'rendered'] as const)
        counts.record(phase, outcome, minute * 60_000);
  expect(counts.snapshot(99 * 60_000).rows).toHaveLength(15 * 12);
  expect(JSON.stringify(counts.snapshot(99 * 60_000))).not.toMatch(/private|journey|actor|error|media|token/);
});
