import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, eventState } from './health-model.mts';
const now = Date.now();
const operational = {
  available: true,
  healthy: true,
  checked_at: new Date(now).toISOString(),
  realtime_p95_ms_5m: 180,
  realtime_max_ms_5m: 220,
  realtime_sample_count_5m: 66,
  realtime_over_5s_5m: 0,
  outbox_overdue: 0,
  outbox_exhausted: 0,
  push_stale_shards: 0,
  push_exhausted_shards: 0,
  apns_provider_credential_errors: 0,
};
const event = {
  healthy: true,
  finalized_at: new Date(now).toISOString(),
  observed_through: new Date(now - 3600000).toISOString(),
  realtime_p95_ms: 180,
  realtime_max_ms: 220,
  realtime_sample_count: 66,
  realtime_over_5s: 0,
  outbox_unpublished: 0,
  outbox_exhausted: 0,
  push_shards_exhausted: 0,
  push_shards_expired: 0,
};
const base = {
  now,
  operational,
  sentry: { available: true, configured: true, issues: [] },
  history: [event],
};
test('only complete, fresh measured coverage is healthy', () =>
  assert.equal(evaluate(base).state, 'healthy'));
test('quiet delivery explains lack of traffic without claiming healthy latency', () => {
  const result = evaluate({
    ...base,
    operational: { ...operational, realtime_sample_count_5m: 0 },
  });
  assert.ok(result.signals[0]);
  assert.equal(result.signals[0].label, 'No recent traffic');
  assert.equal(result.signals[0].state, 'unknown');
});
for (const [sentry, label] of [
  [{ configured: false }, 'Not connected'],
  [{ configured: true, upstream_status: 403 }, 'Access denied'],
  [{ configured: true, upstream_status: 503 }, 'Feed unavailable'],
] as const) {
  test(`Sentry monitoring distinguishes ${label}`, () => {
    const result = evaluate({ ...base, sentry });
    const app = result.signals.find((s) => s.name.startsWith('App errors'));
    assert.ok(app);
    assert.equal(app.label, label);
    assert.equal(app.state, 'unknown');
  });
}
for (const [name, patch, expected] of [
  ['below watch boundary', { realtime_p95_ms_5m: 999 }, 'healthy'],
  ['at watch boundary', { realtime_p95_ms_5m: 1000 }, 'watch'],
  ['at degradation boundary', { realtime_p95_ms_5m: 5000 }, 'watch'],
  ['above degradation boundary', { realtime_p95_ms_5m: 5001 }, 'degraded'],
  [
    'low sample cannot establish degradation by p95',
    { realtime_p95_ms_5m: 5001, realtime_sample_count_5m: 19 },
    'watch',
  ],
  ['low sample cannot establish health', { realtime_sample_count_5m: 19 }, 'unknown'],
  ['no traffic', { realtime_sample_count_5m: 0 }, 'unknown'],
  ['missing count', { realtime_sample_count_5m: null }, 'unknown'],
  ['at critical boundary', { realtime_max_ms_5m: 30000 }, 'watch'],
  [
    'critical even with one sample',
    { realtime_max_ms_5m: 30001, realtime_sample_count_5m: 1 },
    'critical',
  ],
  [
    'caught-up slow incident',
    { realtime_p95_ms_5m: 22656, realtime_max_ms_5m: 103938, realtime_over_5s_5m: 18 },
    'critical',
  ],
  ['backlog', { outbox_overdue: 1 }, 'degraded'],
  ['stale push', { push_stale_shards: 1 }, 'degraded'],
  ['exhausted', { outbox_exhausted: 1 }, 'critical'],
  ['credential failure', { apns_provider_credential_errors: 1 }, 'critical'],
  ['server veto', { healthy: false }, 'degraded'],
  ['missing field', { apns_provider_credential_errors: undefined }, 'unknown'],
  ['stale', { checked_at: new Date(now - 180001).toISOString() }, 'unknown'],
  ['missing timestamp', { checked_at: null }, 'unknown'],
] as const)
  test(name, () =>
    assert.equal(evaluate({ ...base, operational: { ...operational, ...patch } }).state, expected),
  );
test('recent app errors override healthy delivery', () => {
  const status = evaluate({
    ...base,
    sentry: { available: true, configured: true, issues: [{ title: 'Could not load comments' }] },
  });
  assert.equal(status.state, 'degraded');
  assert.equal(status.delivery, 'healthy');
});
test('failed Sentry is not an empty success', () =>
  assert.equal(
    evaluate({ ...base, sentry: { configured: true, available: false, issues: [] } }).state,
    'unknown',
  ));
test('failed outer request invalidates retained healthy values', () =>
  assert.equal(evaluate({ ...base, failed: true }).state, 'unknown'));
test('recovered delivery keeps recent incident visible', () => {
  const status = evaluate({ ...base, history: [{ ...event, realtime_max_ms: 103938 }] });
  assert.equal(status.delivery, 'healthy');
  assert.equal(status.state, 'watch');
  assert.equal(status.incidents, 1);
});
test('empty history cannot claim today was fine', () =>
  assert.equal(evaluate({ ...base, history: [] }).state, 'unknown'));
test('settling history cannot claim complete coverage', () =>
  assert.equal(
    evaluate({ ...base, history: [{ ...event, finalized_at: null }] }).state,
    'unknown',
  ));
test('expired pushes are visible despite legacy healthy boolean', () =>
  assert.equal(eventState({ ...event, push_shards_expired: 1 }), 'critical'));
test('stale history cannot claim complete coverage', () =>
  assert.equal(evaluate({ ...base, historyFailed: true }).state, 'unknown'));
