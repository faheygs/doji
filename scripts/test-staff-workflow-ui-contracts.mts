import test from 'node:test';
import assert from 'node:assert/strict';
import type {} from '../website/portal-select.mts';
import { workPage } from '../website/admin-portal/workflow-contracts.mts';
import { subscribeWorkflow } from '../website/admin-portal/workflow-events.mts';
import { workflowReview } from '../website/admin-portal/workflow-review.mts';
import { workflowPageSummary } from '../website/admin-portal/workflow-view.mts';
import { buildAblyMessages } from '../supabase/functions/_shared/domain-event-delivery.ts';
import type { Realtime } from 'ably';
const id = '99000000-0000-4000-8000-000000000003';
const page = () => ({
  scope: 'staff_inbox_v1',
  order: 'oldest_first',
  authorized_queues: ['report'],
  next_cursor: null,
  items: [
    {
      kind: 'report',
      id,
      key: `report:${id}`,
      subject: 'Report',
      at: '2026-10-05T00:00:00Z',
      due_at: null,
      assigned_to: null,
      work_state: 'ready',
      ownership_model: 'existing_report',
    },
  ],
});
test('six-source parser accepts existing ownership without an invented revision', () =>
  assert.equal(workPage(page()).items[0]?.ownership_model, 'existing_report'));

test('unified safety rejects wrong area, history state, source attribution and legacy scope', () => {
  const expected = { queue: 'moderation', closed: false };
  const value = { ...page(), scope: 'staff_safety_v1', ...expected,
    items: page().items.map(row => ({ ...row, origin: 'in_app', status: 'pending' })) };
  assert.equal(workPage(value, expected).items.length, 1);
  for (const patch of [{ queue: 'restricted_safety' }, { closed: true }, { scope: 'staff_inbox_v1' }])
    assert.throws(() => workPage({ ...value, ...patch }, expected));
  for (const patch of [{ origin: 'external' }, { work_state: 'closed' }, { status: null }])
    assert.throws(() => workPage({ ...value, items: [{ ...value.items[0], ...patch }] }, expected));
});

test('page summary counts exact boundary and waiting overdue work, never undated rows', () => {
  const row = workPage(page()).items[0]!;
  const at = Date.parse('2026-10-06T00:00:00Z');
  const result = workflowPageSummary(
    [
      row,
      { ...row, due_at: '2026-10-06T00:00:00Z', work_state: 'waiting', assigned_to: id },
      { ...row, due_at: '2026-10-06T00:00:01Z' },
    ],
    at,
  );
  assert.match(
    result,
    /^On this page: 1 past deadline or internal target · 2 unassigned · 1 waiting\./,
  );
  assert.match(result, /Not queue-wide totals\./);
  assert.match(
    workflowPageSummary([], at),
    /0 past deadline or internal target · 0 unassigned · 0 waiting/,
  );
});
for (const patch of [
  { ownership_model: 'staff_workflow' },
  { work_state: 'approved' },
  { due_at: 'invalid' },
  { assigned_to: 'member' },
  { key: 'report:other' },
]) {
  test(`inbox rejects malformed row ${JSON.stringify(patch)}`, () => {
    const value = page();
    Object.assign(value.items[0]!, patch);
    assert.throws(() => workPage(value));
  });
}
test('inbox rejects unauthorized rows and mismatched cursor', () => {
  assert.throws(() => workPage({ ...page(), authorized_queues: [] }));
  assert.throws(() =>
    workPage({ ...page(), next_cursor: { at: '2026-10-05T00:00:00Z', key: 'report:other' } }),
  );
});
test('staff subscriber consumes the actual relay envelope, rejects malformed IDs and fences stale session', async () => {
  const callbacks: ((message: unknown) => void)[] = [],
    hints: unknown[] = [];
  let active = true;
  const client = {
    channels: {
      get: () => ({
        subscribe: async (callback: (message: unknown) => void) => {
          callbacks.push(callback);
        },
      }),
    },
  } as unknown as Realtime;
  await subscribeWorkflow(
    client,
    ['staff:workflow:moderation'],
    () => active,
    (hint) => hints.push(hint),
  );
  const message = buildAblyMessages([
    {
      id,
      event_type: 'staff.case.changed',
      aggregate_id: id,
      available_at: '2026-10-05T00:00:00Z',
      created_at: '2026-10-05T00:00:00Z',
      payload: { kind: 'report', id },
    },
  ])[0]!;
  callbacks[0]!(message);
  assert.equal(hints.length, 1);
  callbacks[0]!({ ...message, data: { ...message.data, id: 'wrong' } });
  assert.equal(hints.length, 1);
  callbacks[0]!({ name: 'staff.queue.changed', data: { kind: 'appeal', aggregateId: null } });
  assert.equal(hints.length, 2);
  active = false;
  callbacks[0]!(message);
  assert.equal(hints.length, 2);
});
test('staff subscriber denies wildcard, duplicate and member channels', async () => {
  const client = {
    channels: {
      get: () => {
        throw Error('Unexpected subscription');
      },
    },
  } as unknown as Realtime;
  for (const channels of [
    ['*'],
    ['user:member:events'],
    ['staff:workflow:business', 'staff:workflow:business'],
    null,
  ])
    await assert.rejects(
      subscribeWorkflow(
        client,
        channels,
        () => true,
        () => {},
      ),
    );
});
test('review dispatches each private surface exactly once without a command', async () => {
  const calls: string[] = [];
  const open = async (kind: string) => {
    calls.push(kind);
  };
  const review = workflowReview({
    epoch: () => 1,
    active: () => true,
    business: Promise.resolve({ open: () => open('business_application') }),
    privacy: Promise.resolve({ open: () => open('business_privacy') }),
    intake: { open: () => open('external_intake') },
    idea: { open: () => open('suggestion') },
    report: async () => {
      throw Error('Unexpected report');
    },
    appeal: async () => {
      throw Error('Unexpected appeal');
    },
    drawer: () => {
      throw Error('Unexpected drawer');
    },
  });
  for (const kind of [
    'business_application',
    'business_privacy',
    'external_intake',
    'suggestion',
  ] as const)
    await review({ kind, id });
  assert.deepEqual(calls, [
    'business_application',
    'business_privacy',
    'external_intake',
    'suggestion',
  ]);
});
