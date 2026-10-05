import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewQueue, reviewDeadline, type HealthRecord } from './health-model.mts';
const now = Date.parse('2026-09-26T21:00:00Z');
const item = (hours: number, patch: HealthRecord = {}) => ({
  id: 'case1',
  status: 'open',
  priority: 'normal',
  deadlineAt: new Date(now + hours * 3600000).toISOString(),
  ...patch,
});
test('48-hour-old report is overdue by 24h, never nearing or green', () => {
  const summary = reviewQueue([item(-24)], 1, now);
  assert.equal(summary.state, 'overdue');
  assert.match(summary.note, /^1 overdue · Oldest 24h 0m past target$/);
});
for (const [hours, expected] of [
  [4.01, 'healthy'],
  [4, 'watch'],
  [0.001, 'watch'],
  [0, 'overdue'],
  [-0.001, 'overdue'],
] as const) {
  test(`deadline boundary ${hours}h is ${expected}`, () =>
    assert.equal(reviewDeadline(item(hours), now).state, expected));
}
for (const patch of [
  { priority: 'high' },
  { priority: 'critical' },
  { severity: 'level_2' },
  { severity: 'level_3' },
]) {
  test(`high risk overdue stands out: ${JSON.stringify(patch)}`, () => {
    const summary = reviewQueue([item(-1, patch)], 1, now);
    assert.equal(summary.state, 'critical');
    assert.match(summary.note, /high-risk — urgent review/);
  });
}
test('mixed counts remain separate and duplicate rows do not inflate counts', () => {
  const summary = reviewQueue([item(-24), item(-24), item(1, { id: 'case2' })], 2, now);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.nearing, 1);
  assert.equal(summary.complete, true);
});
test('bounded partial snapshot cannot claim the full queue is healthy', () => {
  assert.equal(reviewQueue([item(20)], 51, now).state, 'unknown');
  const late = reviewQueue([item(-1)], 51, now);
  assert.match(late.note, /At least 1 overdue/);
  assert.match(late.note, /1 loaded of 51/);
});
test('missing deadline, missing total and no data are not healthy', () => {
  assert.equal(reviewQueue([item(20, { deadlineAt: null })], 1, now).state, 'unknown');
  assert.equal(reviewQueue([item(20)], null, now).state, 'unknown');
  assert.equal(reviewQueue([], 5, now).state, 'unknown');
});
test('resolved cases are excluded; empty queue is neutral', () => {
  assert.equal(reviewDeadline(item(-24, { status: 'resolved' }), now).state, 'closed');
  assert.equal(reviewQueue([item(-24, { status: 'resolved' })], 0, now).state, 'empty');
});
test('elapsed time changes classification without another read', () => {
  const report = item(1);
  assert.equal(reviewQueue([report], 1, now).state, 'watch');
  assert.equal(reviewQueue([report], 1, now + 2 * 3600000).state, 'overdue');
});
