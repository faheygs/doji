import { createNotificationHistoryQueue, type NotificationHistory, type NotificationHistoryAction } from '../../lib/notificationHistoryQueue';

const at = (n: number) => `2026-09-26T18:${String(n).padStart(2, '0')}:00Z`;
const dismiss = (key: string, minute = 20): NotificationHistoryAction => ({ kind: 'dismiss', key, at: at(minute) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  let current = true;
  let state: NotificationHistory = { clearedAt: null, lastOpenedAt: null, dismissed: new Map() };
  const execute = jest.fn<Promise<string>, [NotificationHistoryAction]>(async action => action.at);
  const persist = jest.fn(async (_state: NotificationHistory) => {});
  const publish = jest.fn((next: NotificationHistory, _clearing: boolean) => { state = next; });
  const queue = createNotificationHistoryQueue({ initial: state, isCurrent: () => current, execute, persist, publish });
  return { queue, execute, persist, publish, state: () => state, changeAccount: () => { current = false; } };
}

test('two rapid dismissals stay hidden and persist in command order', async () => {
  const t = setup(), first = deferred<string>();
  t.execute.mockImplementationOnce(() => first.promise);
  const a = t.queue.enqueue(dismiss('a'));
  const b = t.queue.enqueue(dismiss('b', 21));
  expect([...t.state().dismissed.keys()]).toEqual(['a', 'b']);
  await Promise.resolve();
  expect(t.execute).toHaveBeenCalledTimes(1);
  first.resolve(at(20));
  await a; await b;
  expect([...t.state().dismissed.keys()]).toEqual(['a', 'b']);
  expect(t.persist.mock.calls.map(([state]) => [...state.dismissed.keys()])).toEqual([['a'], ['a', 'b']]);
});

test('a failed dismissal rolls back only itself, preserving later intent', async () => {
  const t = setup(), first = deferred<string>();
  t.execute.mockImplementationOnce(() => first.promise);
  const a = t.queue.enqueue(dismiss('a'));
  const failed = expect(a).rejects.toThrow('offline');
  const b = t.queue.enqueue(dismiss('b'));
  await Promise.resolve();
  first.reject(new Error('offline'));
  await failed; await b;
  expect([...t.state().dismissed.keys()]).toEqual(['b']);
});

test.each([true, false])('clear interleaved between dismissals rebases correctly (success=%s)', async success => {
  const t = setup(), clear = deferred<string>();
  await t.queue.enqueue(dismiss('a'));
  t.execute.mockImplementationOnce(() => clear.promise);
  const clearing = t.queue.enqueue({ kind: 'clear', at: at(21) });
  const checked = success ? clearing : expect(clearing).rejects.toThrow('failed');
  const b = t.queue.enqueue(dismiss('b', 22));
  expect([...t.state().dismissed.keys()]).toEqual(['b']);
  expect(t.publish).toHaveBeenLastCalledWith(expect.anything(), true);
  await Promise.resolve();
  if (success) clear.resolve(at(21)); else clear.reject(new Error('failed'));
  await checked; await b;
  expect([...t.state().dismissed.keys()]).toEqual(success ? ['b'] : ['a', 'b']);
  expect(t.state().clearedAt).toBe(success ? at(21) : null);
  expect(t.publish).toHaveBeenLastCalledWith(expect.anything(), false);
});

test.each(['account', 'unmount'])('late response does not publish/persist or dispatch queued work after %s', async reason => {
  const t = setup(), first = deferred<string>();
  t.execute.mockImplementationOnce(() => first.promise);
  const a = t.queue.enqueue(dismiss('a'));
  const b = t.queue.enqueue(dismiss('b'));
  await Promise.resolve();
  if (reason === 'account') t.changeAccount(); else t.queue.stop();
  t.publish.mockClear();
  first.resolve(at(20));
  await a; await b;
  expect(t.execute).toHaveBeenCalledTimes(1);
  expect(t.publish).not.toHaveBeenCalled();
  expect(t.persist).not.toHaveBeenCalled();
});

test('late failure after account change does not roll back another account or surface an obsolete error', async () => {
  const t = setup(), first = deferred<string>();
  t.execute.mockImplementationOnce(() => first.promise);
  const a = t.queue.enqueue(dismiss('a'));
  await Promise.resolve(); t.changeAccount(); t.publish.mockClear();
  first.reject(new Error('old-account-error'));
  await expect(a).resolves.toBeUndefined();
  expect(t.publish).not.toHaveBeenCalled();
});

test('storage failure cannot undo a committed dismissal or stop the next action', async () => {
  const t = setup();
  t.persist.mockRejectedValueOnce(new Error('disk'));
  await t.queue.enqueue(dismiss('a'));
  await t.queue.enqueue(dismiss('b'));
  expect([...t.state().dismissed.keys()]).toEqual(['a', 'b']);
});

test('a failed open cannot overwrite a newer open; successful receipts are monotonic', async () => {
  const t = setup(), first = deferred<string>();
  t.execute.mockImplementationOnce(() => first.promise);
  const a = t.queue.enqueue({ kind: 'open', at: at(20) });
  const failed = expect(a).rejects.toThrow('failed');
  const b = t.queue.enqueue({ kind: 'open', at: at(21) });
  await Promise.resolve(); first.reject(new Error('failed'));
  await failed; await b;
  expect(t.state().lastOpenedAt).toBe(at(21));
  await t.queue.enqueue({ kind: 'open', at: at(19) });
  expect(t.state().lastOpenedAt).toBe(at(21));
});

test('bootstrap rebases early intents over restored receipts', async () => {
  const t = setup();
  const opened = t.queue.enqueue({ kind: 'open', at: at(21) });
  t.queue.hydrate({ clearedAt: at(19), lastOpenedAt: at(20), dismissed: new Map([['a', at(20)]]) });
  expect(t.state().lastOpenedAt).toBe(at(21));
  await opened;
  expect(t.state().dismissed.get('a')).toBe(at(20));
  expect(t.state().clearedAt).toBe(at(19));
});

test.each<NotificationHistoryAction>([dismiss('a'), { kind: 'clear', at: at(20) }])(
  'repeated taps share a pending command: %j', async action => {
    const t = setup();
    const a = t.queue.enqueue(action), b = t.queue.enqueue({ ...action });
    expect(a).toBe(b);
    await a;
    expect(t.execute).toHaveBeenCalledTimes(1);
  },
);

test('duplicate detection never skips an intent across an intervening Clear', async () => {
  const t = setup();
  await Promise.all([
    t.queue.enqueue(dismiss('request')),
    t.queue.enqueue({ kind: 'clear', at: at(21) }),
    t.queue.enqueue(dismiss('request', 22)),
  ]);
  expect(t.execute).toHaveBeenCalledTimes(3);
  expect(t.state().dismissed.get('request')).toBe(at(22));
});
