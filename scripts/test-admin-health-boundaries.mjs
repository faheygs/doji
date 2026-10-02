import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {
  evaluate,
  eventState,
  reviewDeadline,
  reviewQueue,
} = require('../website/admin-portal/health-model.js');
const now = Date.parse('2026-10-01T12:00:00Z');
const at = (delta) => new Date(now + delta).toISOString();
const operational = {
  available: true,
  healthy: true,
  checked_at: at(0),
  realtime_p95_ms_5m: 100,
  realtime_max_ms_5m: 200,
  realtime_sample_count_5m: 20,
  realtime_over_5s_5m: 0,
  outbox_overdue: 0,
  outbox_exhausted: 0,
  push_stale_shards: 0,
  push_exhausted_shards: 0,
  apns_provider_credential_errors: 0,
};
const event = {
  healthy: true,
  finalized_at: at(0),
  observed_through: at(-3600000),
  realtime_p95_ms: 100,
  realtime_max_ms: 200,
  realtime_sample_count: 20,
  realtime_over_5s: 0,
  outbox_unpublished: 0,
  outbox_exhausted: 0,
  push_shards_exhausted: 0,
  push_shards_expired: 0,
};
const base = {
  now,
  operational,
  sentry: { configured: true, available: true, issues: [] },
  history: [event],
};
const withOperational = (patch) => evaluate({ ...base, operational: { ...operational, ...patch } });
test('missing whole response is unknown, never healthy', () => {
  const r = evaluate();
  assert.equal(r.state, 'unknown');
  assert.match(r.title, /incomplete/);
});
test('complete measured snapshot explicitly limits its success claim', () => {
  const r = evaluate(base);
  assert.equal(r.state, 'healthy');
  assert.match(r.title, /Measured/);
  assert.match(r.signals[4].detail, /unreported failures/);
});
for (const [patch, expected] of [
  [{ realtime_p95_ms_5m: 999 }, 'healthy'],
  [{ realtime_p95_ms_5m: 1000 }, 'watch'],
  [{ realtime_p95_ms_5m: 5000 }, 'watch'],
  [{ realtime_p95_ms_5m: 5001 }, 'degraded'],
  [{ realtime_sample_count_5m: 19, realtime_p95_ms_5m: 5001 }, 'watch'],
  [{ realtime_max_ms_5m: 5001 }, 'watch'],
  [{ realtime_max_ms_5m: 30000 }, 'watch'],
  [{ realtime_max_ms_5m: 30001, realtime_sample_count_5m: 1 }, 'critical'],
  [{ realtime_over_5s_5m: 1 }, 'watch'],
  [{ outbox_overdue: 1 }, 'degraded'],
  [{ outbox_exhausted: 1 }, 'critical'],
  [{ push_stale_shards: 1 }, 'degraded'],
  [{ push_exhausted_shards: 1 }, 'critical'],
  [{ apns_provider_credential_errors: 1 }, 'critical'],
  [{ healthy: false }, 'degraded'],
])
  test(`delivery threshold ${JSON.stringify(patch)} is ${expected}`, () =>
    assert.equal(withOperational(patch).state, expected));
for (const [patch, label] of [
  [{ realtime_sample_count_5m: 0 }, 'No recent traffic'],
  [{ realtime_sample_count_5m: null }, 'Telemetry missing'],
  [{ realtime_sample_count_5m: 19 }, 'Limited sample'],
  [{ checked_at: at(-180001) }, 'Refresh needed'],
  [{ checked_at: at(60001) }, 'Refresh needed'],
  [{ checked_at: null }, 'Refresh needed'],
  [{ available: false }, 'Refresh needed'],
])
  test(`missing or insufficient telemetry: ${label} ${JSON.stringify(patch)}`, () => {
    const r = withOperational(patch);
    assert.equal(r.state, 'unknown');
    assert.equal(r.signals[0].label, label);
    assert.equal(r.signals[0].state, 'unknown');
  });
for (const field of [
  'realtime_p95_ms_5m',
  'realtime_max_ms_5m',
  'realtime_sample_count_5m',
  'realtime_over_5s_5m',
  'outbox_overdue',
  'outbox_exhausted',
  'push_stale_shards',
  'push_exhausted_shards',
  'apns_provider_credential_errors',
]) {
  for (const value of [-1, NaN, '0', null])
    test(`invalid ${field} ${String(value)} cannot establish healthy coverage`, () =>
      assert.equal(withOperational({ [field]: value }).state, 'unknown'));
}
for (const [sentry, label] of [
  [{ configured: false }, 'Not connected'],
  [{ configured: true, upstream_status: 401 }, 'Access denied'],
  [{ configured: true, upstream_status: 403 }, 'Access denied'],
  [{ configured: true, upstream_status: 503 }, 'Feed unavailable'],
  [{}, 'Feed unavailable'],
])
  test(`monitoring access state ${JSON.stringify(sentry)}`, () => {
    const r = evaluate({ ...base, sentry });
    const signal = r.signals.find((s) => s.name.startsWith('App errors'));
    assert.equal(signal.label, label);
    assert.equal(signal.state, 'unknown');
    assert.equal(r.delivery, 'healthy');
  });
for (const generatedAt of [at(-180001), at(60001), 'invalid'])
  test(`stale or future Sentry snapshot ${generatedAt} cannot claim health`, () =>
    assert.equal(evaluate({ ...base, generatedAt }).state, 'unknown'));
test('outer fetch failure invalidates retained values; failed history retains incident warning', () => {
  const failed = evaluate({ ...base, failed: true });
  assert.equal(failed.state, 'unknown');
  assert.equal(failed.stale, true);
  const r = evaluate({
    ...base,
    historyFailed: true,
    history: [{ ...event, realtime_max_ms: 30001 }],
  });
  assert.equal(r.state, 'watch');
  assert.equal(r.incidents, 1);
  assert.match(r.signals.at(-1).detail, /stale/);
});
for (const count of [1, 25])
  test(`${count} unresolved issue groups are not called live outages`, () => {
    const r = evaluate({
      ...base,
      sentry: {
        ...base.sentry,
        issues: Array.from({ length: count }, () => ({ id: 'synthetic' })),
      },
    });
    assert.equal(r.state, 'degraded');
    assert.match(r.signals[4].detail, /not a live outage count/);
    assert(r.signals[4].detail.startsWith(count === 25 ? '25+' : '1 '));
  });
test('malformed issue list is handled as a bounded empty result, not complete feature verification', () =>
  assert.match(
    evaluate({ ...base, sentry: { ...base.sentry, issues: {} } }).signals[4].detail,
    /feature success rates are not covered/,
  ));
for (const field of ['observed_through', 'closes_at', 'fires_at'])
  test(`event recency accepts supported ${field} timestamp`, () => {
    const row = { ...event, observed_through: undefined, [field]: at(-3600000) };
    assert.equal(evaluate({ ...base, history: [row] }).state, 'healthy');
  });
for (const timestamp of [undefined, 'invalid', at(1), at(-86400001)])
  test(`outside-window event ${timestamp} is not today's evidence`, () => {
    const r = evaluate({ ...base, history: [{ ...event, observed_through: timestamp }] });
    assert.equal(r.state, 'unknown');
    assert.equal(r.signals.at(-1).label, 'No recent summary');
  });
for (const [patch, label] of [
  [{ finalized_at: null }, 'Still settling'],
  [{ realtime_sample_count: 1 }, 'Limited sample'],
])
  test(`incomplete history is ${label}`, () =>
    assert.equal(
      evaluate({ ...base, history: [{ ...event, ...patch }] }).signals.at(-1).label,
      label,
    ));
test('history failure without an incident is not an all-clear', () =>
  assert.equal(
    evaluate({ ...base, historyFailed: true }).signals.at(-1).label,
    'History unavailable',
  ));
for (const field of ['outbox_exhausted', 'push_shards_exhausted', 'push_shards_expired'])
  test(`terminal ${field} is critical despite healthy flag`, () =>
    assert.equal(eventState({ ...event, [field]: 1 }), 'critical'));
test('unpublished outbox is degraded; absent healthy flag is unknown; server veto persists', () => {
  assert.equal(eventState({ ...event, outbox_unpublished: 1 }), 'degraded');
  assert.equal(eventState({ ...event, healthy: undefined }), 'unknown');
  assert.equal(eventState({ ...event, healthy: false }), 'degraded');
});
const item = (delta, patch = {}) => ({
  id: 'case',
  status: 'open',
  priority: 'normal',
  deadlineAt: at(delta),
  ...patch,
});
for (const status of ['resolved', 'approved', 'draft', 'dismissed', 'action_taken', 'reversed'])
  test(`closed ${status} is excluded from urgent work`, () => {
    assert.equal(reviewDeadline(item(-1, { status }), now).state, 'closed');
    assert.equal(reviewQueue([item(-1, { status })], 0, now).state, 'empty');
  });
for (const [delta, state] of [
  [14400001, 'healthy'],
  [14400000, 'watch'],
  [1, 'watch'],
  [0, 'overdue'],
  [-1, 'overdue'],
])
  test(`review deadline boundary ${delta}`, () =>
    assert.equal(reviewDeadline(item(delta), now).state, state));
for (const patch of [
  { priority: 'critical' },
  { priority: 'high' },
  { severity: 'level_2' },
  { severity: 'level_3' },
])
  test(`severe overdue ${JSON.stringify(patch)} is critical`, () => {
    const r = reviewQueue([item(-3600000, patch)], 1, now);
    assert.equal(r.state, 'critical');
    assert.match(r.note, /urgent review/);
    assert.equal(r.critical, 1);
  });
test('partial queues, absent totals and unknown deadlines disclose missing evidence', () => {
  const incomplete = reviewQueue([item(-1000), item(1000, { id: 'other' })], 50, now);
  assert.equal(incomplete.complete, false);
  assert.match(incomplete.note, /At least 1 overdue/);
  assert.match(incomplete.note, /1 due within 4h/);
  assert.match(incomplete.note, /2 loaded of 50/);
  const unknown = reviewQueue([item(1, { deadlineAt: null })], undefined, now);
  assert.equal(unknown.state, 'unknown');
  assert.match(unknown.note, /missing deadlines/);
  assert.doesNotMatch(unknown.note, / of /);
  assert.equal(reviewQueue([item(14400001)], 2, now).state, 'unknown');
  assert.equal(reviewQueue([item(1000)], 2, now).state, 'watch');
});
test('duplicate ids do not inflate work; snake-case deadlines and default clock work', () => {
  const row = { id: 'case', status: 'open', deadline_at: at(14400001) };
  assert.equal(reviewDeadline(row, now).state, 'healthy');
  assert.equal(reviewQueue([row, row], 1, now).complete, true);
  assert.equal(reviewDeadline({ status: 'resolved' }).state, 'closed');
  assert.equal(reviewQueue([], 0).state, 'empty');
});
test('complete high priority remains watch before its deadline and normal work is healthy', () => {
  assert.equal(reviewQueue([item(14400001, { priority: 'high' })], 1, now).state, 'watch');
  assert.equal(reviewQueue([item(14400001)], 1, now).state, 'healthy');
});
