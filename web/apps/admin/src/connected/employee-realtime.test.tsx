import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClientOptions, ConnectionStateChange, Message } from 'ably';
import type { BrowserRealtimeSdk } from '../../../../../website/ably-browser.d.mts';
import { createEmployeeSession } from '@doji/portal-data/employee';
import { attachEmployeeRealtime } from './employee-realtime';

const actor = {
  user_id: '10000000-0000-4000-8000-000000000001',
  capabilities: { moderation_read: true },
};
const authenticated = { signedIn: true, assurance: 'aal2', csrf: 'c'.repeat(43), operator: actor };
const caseId = '20000000-0000-4000-8000-000000000002';
const stops: (() => void)[] = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function fixture(
  channels = ['staff:workflow:moderation'],
  enabled = true,
  operations = false,
  manager = false,
) {
  vi.useFakeTimers();
  let session = {
    ...authenticated,
    operator: {
      ...actor,
      capabilities: {
        ...actor.capabilities,
        operations_read: operations,
        operator_manage: manager,
      },
    },
  };
  const upstream = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/session')) return Response.json(session);
    if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
    const body = JSON.parse(String(init?.body)) as { name: string };
    if (body.name === 'get_admin_staff_event_channels_v1') return Response.json(channels);
    return Response.json({
      keyName: 'synthetic.key',
      nonce: 'synthetic',
      mac: 'synthetic',
      capability: '{}',
      timestamp: Date.now(),
    });
  });
  const controller = createEmployeeSession(
    { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
    { origin: 'https://admin.dojipro.com', upstream },
  );
  await controller.restore();
  let connection!: (change: ConnectionStateChange) => void;
  let options!: ClientOptions;
  const handlers = new Map<string, (message: Message) => void>();
  const close = vi.fn();
  const get = vi.fn((name: string) => ({
    subscribe: async (handler: (message: Message) => void) => {
      const previous = handlers.get(name);
      handlers.set(name, (message) => {
        previous?.(message);
        handler(message);
      });
    },
  }));
  class FakeRealtime {
    constructor(value: ClientOptions) {
      options = value;
    }
    connection = {
      on: (handler: typeof connection) => {
        connection = handler;
      },
    };
    channels = { get };
    connect = vi.fn();
    close = close;
  }
  const load = vi.fn(async () => ({ Realtime: FakeRealtime }) as unknown as BrowserRealtimeSdk);
  const state = vi.fn();
  const invalidate = vi.spyOn(controller.getSnapshot().cache!, 'invalidateQueries');
  const stop = attachEmployeeRealtime(controller, enabled, state, load);
  stops.push(stop);
  await vi.advanceTimersByTimeAsync(0);
  return {
    controller,
    upstream,
    load,
    state,
    close,
    get,
    invalidate,
    stop,
    announcementHint: (eventId: string, valid = true) =>
      handlers.get('moderation:global')?.({
        name: 'moderation.announcement.publish',
        data: { eventId, aggregateId: valid ? caseId : 'invalid' },
      } as Message),
    accessHint: (eventId: string, valid = true) =>
      handlers.get('moderation:global')?.({
        name: 'moderation.employee.access_changed',
        data: { eventId, aggregateId: valid ? actor.user_id : 'invalid' },
      } as Message),
    revoke: () => {
      session = {
        ...authenticated,
        operator: {
          ...actor,
          capabilities: { moderation_read: false, operations_read: false, operator_manage: false },
        },
      };
    },
    connect: () => connection({ current: 'connected' } as ConnectionStateChange),
    authorize: () => {
      const callback = vi.fn();
      options.authCallback!({}, callback);
      return callback;
    },
    hint: (eventId: string, kind = 'report', valid = true) =>
      handlers.get('staff:workflow:moderation')?.({
        name: 'staff.case.changed',
        data: { kind, eventId, aggregateId: caseId, id: valid ? caseId : 'invalid' },
      } as Message),
  };
}
describe('employee socket lifecycle', () => {
  it('reconciles announcement hints only with both permissions, without trusting event data', async () => {
    const denied = await fixture();
    denied.announcementHint('not-authorized');
    await vi.advanceTimersByTimeAsync(300);
    expect(denied.invalidate).not.toHaveBeenCalled();
    denied.stop();
    const f = await fixture(undefined, true, true);
    f.announcementHint('malformed', false);
    await vi.advanceTimersByTimeAsync(300);
    expect(f.invalidate).not.toHaveBeenCalled();
    for (let i = 0; i < 12; i++) f.announcementHint('published-1');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[4])).toEqual([
      'announcements',
      'audit',
    ]);
    f.invalidate.mockClear();
    f.announcementHint('published-1');
    await vi.advanceTimersByTimeAsync(300);
    expect(f.invalidate).not.toHaveBeenCalled();
    f.stop();
    f.announcementHint('late');
    await vi.advanceTimersByTimeAsync(300);
    expect(f.invalidate).not.toHaveBeenCalled();
  });
  it('reconciles access on valid hints and ignores duplicate or malformed hints', async () => {
    const f = await fixture(undefined, true, true, true);
    f.accessHint('bad', false);
    await vi.advanceTimersByTimeAsync(300);
    expect(f.invalidate).not.toHaveBeenCalled();
    for (let i = 0; i < 12; i++) f.accessHint('role-change-1');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[4])).toEqual([
      'team',
      'audit',
      'work',
      'safety',
    ]);
    f.invalidate.mockClear();
    f.accessHint('role-change-1');
    await vi.advanceTimersByTimeAsync(300);
    expect(f.invalidate).not.toHaveBeenCalled();
    f.revoke();
    f.accessHint('role-change-2');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.controller.getSnapshot().operator?.capabilities.operator_manage).toBe(false);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.invalidate).not.toHaveBeenCalled();
  });
  it('reconciles authorized Operations on reconnect but never treats workflow hints as health events', async () => {
    const f = await fixture(undefined, true, true);
    f.connect();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[4])).toEqual([
      'work',
      'safety',
      'operations',
      'audit',
      'announcements',
    ]);
    f.invalidate.mockClear();
    f.hint('report-only');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[4])).toEqual([
      'work',
      'audit',
      'safety',
    ]);
    expect(f.get.mock.calls.map(([name]) => name)).toEqual([
      'moderation:global',
      'moderation:global',
      'staff:workflow:moderation',
    ]);
  });
  it('does not load an SDK or token when disabled or returned channels exceed permissions', async () => {
    const disabled = await fixture(undefined, false);
    expect(disabled.load).not.toHaveBeenCalled();
    const denied = await fixture(['staff:workflow:restricted']);
    expect(denied.load).not.toHaveBeenCalled();
    expect(denied.state).toHaveBeenLastCalledWith('unavailable');
    expect(denied.upstream).toHaveBeenCalledTimes(2);
  });
  it('subscribes only to server-authorized staff channels and obtains tokens through the employee transport', async () => {
    const f = await fixture();
    expect(f.get.mock.calls.map(([name]) => name)).toEqual([
      'moderation:global',
      'staff:workflow:moderation',
    ]);
    const callback = f.authorize();
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ keyName: 'synthetic.key' }),
    );
    expect(f.upstream.mock.calls.at(-1)?.[0]).toBe('https://admin.dojipro.com/api/rpc');
    expect(JSON.parse(String(f.upstream.mock.calls.at(-1)?.[1]?.body)).name).toBe(
      'portal_realtime_token_v1',
    );
  });
  it('coalesces valid hints, ignores duplicates and malformed events, and targets work and safety', async () => {
    const f = await fixture();
    f.hint('invalid', 'report', false);
    f.hint('wrong-kind', 'unknown');
    await vi.advanceTimersByTimeAsync(300);
    expect(f.invalidate).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) f.hint('event-1');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate.mock.calls.map(([filter]) => filter?.queryKey?.[4])).toEqual([
      'work',
      'safety',
    ]);
    f.hint('event-1');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate).toHaveBeenCalledTimes(2);
    expect(f.load).toHaveBeenCalledTimes(1);
  });
  it('retains one trailing refresh for events arriving during a slow read', async () => {
    const f = await fixture();
    let release!: () => void;
    f.invalidate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    f.hint('event-1');
    await vi.advanceTimersByTimeAsync(250);
    f.hint('event-2');
    f.hint('event-3');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate).toHaveBeenCalledTimes(2);
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate).toHaveBeenCalledTimes(4);
  });
  it('reconciles on connection recovery and closes immediately when permissions change', async () => {
    const f = await fixture();
    f.connect();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate).toHaveBeenCalledTimes(2);
    f.connect();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate).toHaveBeenCalledTimes(4);
    f.revoke();
    f.hint('revoked');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.invalidate).toHaveBeenCalledTimes(4);
  });
  it('never refreshes hidden work and ignores late events or authorization after logout', async () => {
    const f = await fixture();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    f.hint('hidden');
    await vi.advanceTimersByTimeAsync(250);
    expect(f.invalidate).not.toHaveBeenCalled();
    await f.controller.signOut();
    expect(f.close).toHaveBeenCalledTimes(1);
    const calls = f.upstream.mock.calls.length;
    f.hint('late');
    const callback = f.authorize();
    await vi.advanceTimersByTimeAsync(250);
    expect(f.upstream).toHaveBeenCalledTimes(calls);
    expect(callback).toHaveBeenCalledWith('Employee session ended.', null);
  });
});
