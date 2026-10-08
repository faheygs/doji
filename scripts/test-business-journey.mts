import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicationEvidence,
  displayTime,
  journeyState,
} from '../website/business-portal/identity/journey-model.mts';

test('every supported stage has honest status and a concrete next step', () => {
  assert.equal(journeyState(null).step, 2);
  for (const state of ['draft', 'pending', 'changes_requested', 'approved', 'declined']) {
    const result = journeyState({ revision: 1, state });
    assert.ok(result.heading && result.title && result.next && result.description);
    assert.doesNotMatch(result.description + result.next, /email sent|within.*hours/i);
  }
  for (const state of ['', 'unexpected', 'constructor', '__proto__'])
    assert.equal(journeyState({ revision: 1, state }).title, 'Status unavailable');
});
test('receipt never invents a reference or submission time', () => {
  assert.equal(applicationEvidence(null).reference, '');
  assert.equal(applicationEvidence({ revision: 1 }).submitted, '');
  for (const value of [undefined, null, 12, 'garbage', '2026-99-99T00:00:00Z'])
    assert.equal(displayTime(value), '');
  assert.ok(displayTime('2026-10-05T20:00:00Z'));
  assert.equal(
    applicationEvidence(Object.assign({ revision: 1 }, { id: '-'.repeat(36) })).reference,
    '',
  );
});
test('activity is bounded and projects only safe public fields', () => {
  const entry = {
    action: 'submit',
    occurred_at: '2026-10-05T20:00:00Z',
    response: 'x'.repeat(5000),
    internal_note: 'private-secret',
    actor_id: 'private-actor',
  };
  const evidence = applicationEvidence(
    Object.assign({ revision: 1 }, { history: Array(32).fill(entry), history_has_more: true }),
  );
  assert.equal(evidence.history.length, 30);
  assert.equal(evidence.history[0]?.response.length, 4000);
  assert.equal(evidence.more, true);
  assert.doesNotMatch(JSON.stringify(evidence), /private-secret|private-actor/);
  assert.equal(
    applicationEvidence(
      Object.assign({ revision: 1 }, { history: [null, [], 5, {}, { action: 'submit' }] }),
    ).history.length,
    0,
  );
});
