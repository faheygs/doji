import { processBroadcastPush } from '../../supabase/functions/_shared/broadcast-push';
import type { DeliveryEvent } from '../../supabase/functions/_shared/domain-event-delivery';
jest.mock('../../supabase/functions/_shared/expo-push', () => ({
  sendExpoPushMessages: (...args: unknown[]) => mockExpo(...args),
}));
const mockExpo = jest.fn();
const rpc = jest.fn();
const db = { rpc, from: jest.fn() };
let event: DeliveryEvent & { lease_id: string };
let recipients: { user_id: string; notification_token: string }[];
function database(name: string, args: Record<string, unknown>) {
  if (name === 'get_doji_push_recipients_page') return { data: recipients, error: null };
  if (name === 'claim_push_delivery_targets_batch_v2')
    return {
      data: (args.p_targets as { userId: string }[]).map((t) => ({ target_user_id: t.userId })),
      error: null,
    };
  return { data: true, error: null };
}
beforeEach(() => {
  jest.useFakeTimers();
  event = {
    id: 'event',
    lease_id: 'lease',
    aggregate_id: null,
    event_type: 'doji.activated',
    created_at: new Date().toISOString(),
    available_at: new Date().toISOString(),
    payload: { dailyEventId: 'daily', broadcastPush: true },
  };
  recipients = [{ user_id: 'user', notification_token: 'synthetic' }];
  rpc.mockReset().mockImplementation(async (name, args) => database(name, args));
  mockExpo.mockReset().mockImplementation(async (messages: unknown[]) => ({
    httpOk: true,
    invalidTokenIndices: [],
    tickets: messages.map(() => ({ status: 'ok', id: 'ticket' })),
  }));
});
afterEach(() => jest.useRealTimers());
async function run() {
  const pending = processBroadcastPush(db, event);
  const captured = pending.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await jest.runAllTimersAsync();
  const result = await captured;
  if ('error' in result) throw result.error;
  return result.value;
}
test.each(['type', 'flag'])('ignores nonbroadcast %s', async (kind) => {
  if (kind === 'type') event.event_type = 'post.updated';
  else event.payload.broadcastPush = false;
  expect(await run()).toEqual({ handled: false, continued: false, sent: 0 });
  expect(rpc).not.toHaveBeenCalled();
});
test('missing event ID prevents recipient reads', async () => {
  delete event.payload.dailyEventId;
  await expect(run()).rejects.toThrow('Broadcast is missing dailyEventId');
});
test.each(['get_doji_push_recipients_page', 'claim_push_delivery_targets_batch_v2'])(
  'failed %s cannot send',
  async (name) => {
    rpc.mockImplementation(async (call, args) =>
      call === name ? { error: { message: 'synthetic' } } : database(call, args),
    );
    await expect(run()).rejects.toThrow('synthetic');
    expect(mockExpo).not.toHaveBeenCalled();
  },
);
test.each([null, []])('empty recipient data is handled without sends %j', async (data) => {
  rpc.mockImplementation(async (name, args) =>
    name === 'get_doji_push_recipients_page' ? { data } : database(name, args),
  );
  expect(await run()).toEqual({ handled: true, continued: false, sent: 0 });
  expect(mockExpo).not.toHaveBeenCalled();
});
test('empty delivery claims cannot resend', async () => {
  rpc.mockImplementation(async (name, args) =>
    name === 'claim_push_delivery_targets_batch_v2' ? { data: null } : database(name, args),
  );
  expect(await run()).toMatchObject({ sent: 0 });
  expect(mockExpo).not.toHaveBeenCalled();
});
test.each([
  undefined,
  1,
  '',
  'You only have 10 minutes!',
  'Custom. You have 10 minutes.',
  'Custom',
])('normalizes urgent copy %s', async (body) => {
  event.payload.body = body;
  expect(await run()).toMatchObject({ sent: 1 });
  const sent = mockExpo.mock.calls[0][0][0];
  expect(sent.title).toBe("It's time to Doji!");
  expect(sent.body).toContain('10 minutes');
  expect(sent.data.daily_event_id).toBe('daily');
  expect(sent.ttl).toBeGreaterThan(0);
});
test('invalid source timestamp has minimum lifetime without scheduling', async () => {
  event.created_at = 'invalid';
  expect(await run()).toMatchObject({ sent: 1 });
  expect(mockExpo.mock.calls[0][0][0].ttl).toBe(1);
});
test('full page batches100 at a time then durably advances exact cursor', async () => {
  recipients = Array.from({ length: 1000 }, (_, i) => ({
    user_id: `user${i}`,
    notification_token: `token${i}`,
  }));
  event.payload.broadcastAfterUserId = 'previous';
  event.aggregate_id = 'aggregate';
  event.payload.occurredAt = event.created_at;
  expect(await run()).toEqual({ handled: true, continued: true, sent: 1000 });
  expect(mockExpo).toHaveBeenCalledTimes(10);
  expect(rpc).toHaveBeenCalledWith('continue_domain_event_broadcast', {
    p_event_id: 'event',
    p_lease_id: 'lease',
    p_after_user_id: 'user999',
  });
  expect(rpc).toHaveBeenCalledWith('get_doji_push_recipients_page', {
    p_daily_event_id: 'daily',
    p_after_user_id: 'previous',
    p_limit: 1000,
  });
});
test.each(['error', 'lost'])('continuation %s rejects', async (mode) => {
  recipients = Array.from({ length: 1000 }, (_, i) => ({
    user_id: `user${i}`,
    notification_token: 'token',
  }));
  rpc.mockImplementation(async (name, args) =>
    name === 'continue_domain_event_broadcast'
      ? mode === 'error'
        ? { error: { message: 'continuation' } }
        : { data: false }
      : name === 'claim_push_delivery_targets_batch_v2'
        ? { data: [] }
        : database(name, args),
  );
  await expect(run()).rejects.toThrow(
    mode === 'error' ? 'continuation' : 'Broadcast event lease was lost',
  );
});
test.each(['invalid', 'rejected', 'missing', 'transport', 'transport-default'])(
  'records %s outcomes without assuming delivery',
  async (kind) => {
    mockExpo.mockResolvedValue({
      httpOk: !kind.startsWith('transport'),
      tickets: kind === 'missing' ? [] : [{ status: 'error', message: 'synthetic' }],
      invalidTokenIndices: kind === 'invalid' ? [0, 99] : [],
      transportError: kind === 'transport' ? 'specific transport' : undefined,
    });
    if (kind.startsWith('transport'))
      await expect(run()).rejects.toThrow(
        kind === 'transport' ? 'specific transport' : 'Push provider transport failed',
      );
    else expect(await run()).toMatchObject({ sent: 1 });
    expect(rpc).toHaveBeenCalledWith('record_push_delivery_results', {
      p_results: [
        expect.objectContaining({
          deliveryKey: 'outbox-push:event:user:expo',
          outcome:
            kind === 'invalid'
              ? 'invalid_token'
              : kind.startsWith('transport')
                ? 'transport_error'
                : 'rejected',
        }),
      ],
    });
    if (kind === 'invalid')
      expect(rpc).toHaveBeenCalledWith('invalidate_expo_push_tokens', { p_tokens: ['synthetic'] });
  },
);
test('invalidation persistence error is not ignored', async () => {
  mockExpo.mockResolvedValue({
    httpOk: true,
    tickets: [{ status: 'error' }],
    invalidTokenIndices: [0],
  });
  rpc.mockImplementation(async (name, args) =>
    name === 'invalidate_expo_push_tokens'
      ? { error: { message: 'invalidation' } }
      : database(name, args),
  );
  await expect(run()).rejects.toThrow('invalidation');
});
