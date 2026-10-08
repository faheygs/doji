// Offline transport double; real workflow validation and timer behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Realtime } from 'ably';
import type { InvalidationHint } from '../website/admin-portal/live-contracts.d.mts';
import { subscribeWorkflow, workflowInvalidator } from '../website/admin-portal/workflow-events.mts';
const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
type Message = { name?: string; id?: string; data?: unknown };
function transport() {
  const handlers: ((message: Message) => void)[] = [];
  const subscriptions: unknown[] = [];
  // Only this documented channel/subscribe surface is used by the adapter.
  const client = { channels: { get(name: string, options: unknown) {
    subscriptions.push({ name, options });
    return { subscribe: async (callback: (message: Message) => void) => { handlers.push(callback); } };
  } } } as unknown as Realtime;
  return { client, handlers, subscriptions };
}
test('invalid channel grants fail before subscribing', async () => {
  for (const value of [null, {}, ['member:private'], ['staff:workflow:ideas', 'staff:workflow:ideas'],
    Array(6).fill('staff:workflow:ideas')]) {
    const f = transport();
    await assert.rejects(subscribeWorkflow(f.client, value, () => true, () => {}), /unavailable/);
    assert.deepEqual(f.subscriptions, []);
  }
});
test('inactive subscription and empty grants do not access a channel', async () => {
  const f = transport();
  await subscribeWorkflow(f.client, ['staff:workflow:ideas'], () => false, () => {});
  await subscribeWorkflow(f.client, [], () => true, () => {});
  assert.deepEqual(f.subscriptions, []);
});
test('only current valid case/queue hints reach invalidation', async () => {
  const f = transport(), hints: InvalidationHint[] = []; let active = true;
  await subscribeWorkflow(f.client, ['staff:workflow:ideas'], () => active, event => hints.push(event));
  assert.deepEqual(f.subscriptions, [{ name: 'staff:workflow:ideas', options: { params: { rewind: '2m' } } }]);
  const emit = f.handlers[0]!;
  for (const message of [{}, { name: 'other' }, { name: 'staff.case.changed', data: null },
    { name: 'staff.case.changed', data: { kind: 'member' } },
    { name: 'staff.case.changed', data: { kind: 'suggestion', aggregateId: 'invalid' } },
    { name: 'staff.case.changed', data: { kind: 'suggestion', aggregateId: id, id: 'other' } }]) emit(message);
  assert.deepEqual(hints, []);
  emit({ name: 'staff.case.changed', id: 'fallback', data: { kind: 'suggestion', aggregateId: id, id } });
  emit({ name: 'staff.queue.changed', data: { kind: 'suggestion', eventId: 'event' } });
  assert.deepEqual(hints, [
    { type: 'staff.case.changed', eventId: 'fallback', aggregateId: id, workKind: 'suggestion' },
    { type: 'staff.queue.changed', eventId: 'event', aggregateId: undefined, workKind: 'suggestion' },
  ]);
  active = false; emit({ name: 'staff.queue.changed', data: { kind: 'suggestion' } });
  assert.equal(hints.length, 2);
});
test('bounded invalidator coalesces, deduplicates, expires history and clears safely', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let active = true, refreshes = 0;
  const invalidator = workflowInvalidator(() => refreshes++, () => active);
  const hint = (eventId?: string): InvalidationHint => ({ type: 'staff.case.changed', workKind: 'report', eventId });
  invalidator.hint({ type: 'unrelated', workKind: 'report' });
  invalidator.hint({ type: 'staff.queue.changed', workKind: 'invalid' });
  active = false; invalidator.hint(hint('inactive')); active = true;
  context.mock.timers.tick(250); assert.equal(refreshes, 0);
  invalidator.hint(hint('first')); invalidator.hint(hint('first')); invalidator.hint(hint());
  context.mock.timers.tick(249); assert.equal(refreshes, 0);
  context.mock.timers.tick(1); assert.equal(refreshes, 1);
  invalidator.hint(hint('first')); context.mock.timers.tick(250); assert.equal(refreshes, 1);
  for (let n = 0; n < 129; n++) invalidator.hint(hint(`event-${n}`));
  context.mock.timers.tick(250); assert.equal(refreshes, 2);
  invalidator.hint(hint('first')); context.mock.timers.tick(250); assert.equal(refreshes, 3);
  invalidator.hint(hint('late')); active = false;
  context.mock.timers.tick(250); assert.equal(refreshes, 3);
  active = true; invalidator.hint(hint('cancelled')); invalidator.clear();
  context.mock.timers.tick(250); assert.equal(refreshes, 3);
  invalidator.hint(hint('first')); context.mock.timers.tick(250); assert.equal(refreshes, 4);
  invalidator.clear();
});
