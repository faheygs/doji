import { act, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { Chip } from '@mui/material';
import { createPortalQueryClient } from '@doji/portal-data';
import type { EmployeeSessionController, EmployeeSessionState } from '@doji/portal-data/employee';
import HealthSummaryStatus from './HealthSummaryStatus';

function fixture(initial: unknown = { enabled: false }, enabled = true) {
  const cache = createPortalQueryClient();
  let value = initial;
  let state: EmployeeSessionState = {
    phase: 'ready',
    busy: false,
    message: '',
    cache,
    operator: {
      user_id: 'synthetic',
      display_name: 'Test',
      capabilities: { operations_read: true },
    },
    session: { realm: 'employee', subject: 'synthetic', epoch: '1' },
  };
  const listeners = new Set<() => void>();
  const read = vi.fn<EmployeeSessionController['read']>(async (_cap, path, body, parse, signal) => {
    expect(path).toBe('/portal/admin/platform-health-summary');
    expect(body).toBeUndefined();
    signal.throwIfAborted();
    if (value instanceof Error) throw value;
    return parse(value);
  });
  const controller = {
    healthSnapshotEnabled: enabled,
    getSnapshot: () => state,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    read,
  } as unknown as EmployeeSessionController;
  const open = vi.fn();
  return {
    cache,
    read,
    open,
    set: (next: unknown) => {
      value = next;
    },
    revoke: () => {
      state = { ...state, operator: null, session: null, phase: 'signed-out' };
      cache.clear();
      listeners.forEach((fn) => fn());
    },
    show: () =>
      render(
        <QueryClientProvider client={cache}>
          <HealthSummaryStatus controller={controller} chip={Chip} open={open} />
        </QueryClientProvider>,
      ),
  };
}
const observation = () => ({
  enabled: true,
  available: true,
  observed_at: new Date().toISOString(),
  stale: false,
  operational: { available: true, healthy: true },
  workflows: { available: true, enabled: true },
});
async function flush(ms = 1) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('portal-wide cached summary lifecycle', () => {
  it('does not probe older runtimes unless the public feature gate is explicitly enabled', async () => {
    vi.useFakeTimers();
    const f = fixture(observation(), false);
    const view = f.show();
    await flush(180000);
    expect(f.read).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).toBeNull();
    view.unmount();
    f.cache.clear();
  });
  it('probes once when disabled and never schedules background polling', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const view = f.show();
    await flush();
    await flush(180000);
    expect(f.read).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button')).toBeNull();
    view.unmount();
    f.cache.clear();
  });
  it('recovers from a failed first read without navigation and stops when the server disables it', async () => {
    vi.useFakeTimers();
    const f = fixture(Error('synthetic first-read failure'));
    const view = f.show();
    await flush();
    expect(screen.getByRole('button', { name: 'Health: unavailable' })).toBeVisible();
    f.set(observation());
    await flush(60000);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Health: limited coverage' })).toBeVisible();
    f.set({ enabled: false });
    await flush(60000);
    expect(f.read).toHaveBeenCalledTimes(3);
    await flush(180000);
    expect(f.read).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('button')).toBeNull();
    view.unmount();
    f.cache.clear();
  });
  it('refreshes only cached data at 60 seconds, stops hidden/offline, reconciles on return and preserves expiry', async () => {
    vi.useFakeTimers();
    let visible = 'visible',
      online = true;
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
      () => visible as DocumentVisibilityState,
    );
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    const f = fixture(observation());
    const view = f.show();
    await flush();
    expect(screen.getByRole('button', { name: 'Health: limited coverage' })).toBeVisible();
    await flush(60000);
    expect(f.read).toHaveBeenCalledTimes(2);
    act(() => {
      visible = 'hidden';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush(180001);
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Health: outdated' })).toBeInTheDocument();
    f.set(observation());
    act(() => {
      visible = 'visible';
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(f.read).toHaveBeenCalledTimes(3);
    act(() => {
      online = false;
      window.dispatchEvent(new Event('offline'));
    });
    await flush(60000);
    expect(f.read).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('button', { name: 'Health: offline' })).toBeInTheDocument();
    f.set(Error('synthetic unavailable'));
    act(() => {
      online = true;
      window.dispatchEvent(new Event('online'));
    });
    await flush();
    expect(screen.getByRole('button', { name: 'Health: unavailable' })).toBeInTheDocument();
    f.set(observation());
    await flush(60000);
    fireEvent.click(screen.getByRole('button', { name: 'Health: limited coverage' }));
    expect(f.open).toHaveBeenCalledOnce();
    act(f.revoke);
    await flush(120000);
    const calls = f.read.mock.calls.length;
    expect(screen.queryByRole('button')).toBeNull();
    await flush(60000);
    expect(f.read).toHaveBeenCalledTimes(calls);
    view.unmount();
    f.cache.clear();
  });
});
