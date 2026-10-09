import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from '@doji/portal-data/employee';
import { attachEmployeeReconciliation } from './employee-reconciliation';

const authenticated = {
  signedIn: true,
  assurance: 'aal2',
  csrf: 'c'.repeat(43),
  operator: {
    user_id: '10000000-0000-4000-8000-000000000001',
    capabilities: { moderation_read: true },
  },
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('employee foreground reconciliation', () => {
  it('coalesces focus, visible and online events, refreshes only active authorized reads, and detaches', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn(async () => Response.json(authenticated));
    const controller = createEmployeeSession(
      { independentEmployeeIdentity: true },
      { origin: 'https://admin.dojipro.com', upstream },
    );
    await controller.restore();
    const cache = controller.getSnapshot().cache!;
    const invalidate = vi.spyOn(cache, 'invalidateQueries');
    const detach = attachEmployeeReconciliation(controller);
    try {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(250);
      expect(upstream).toHaveBeenCalledTimes(2);
      expect(invalidate).toHaveBeenCalledTimes(1);
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ refetchType: 'active' }), {
        cancelRefetch: false,
      });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(upstream).toHaveBeenCalledTimes(2);
      detach();
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(250);
      expect(upstream).toHaveBeenCalledTimes(2);
    } finally {
      detach();
    }
  });
  it('ignores hidden tabs and signed-out forms and fences a scheduled refresh after logout', async () => {
    vi.useFakeTimers();
    const upstream = vi.fn(async (url: string) =>
      Response.json(url.endsWith('/auth/logout') ? { signedIn: false } : authenticated),
    );
    const controller = createEmployeeSession(
      { independentEmployeeIdentity: true },
      { origin: 'https://admin.dojipro.com', upstream },
    );
    await controller.restore();
    const detach = attachEmployeeReconciliation(controller);
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(250);
      expect(upstream).toHaveBeenCalledTimes(1);
      visibility.mockReturnValue('visible');
      window.dispatchEvent(new Event('focus'));
      await controller.signOut();
      await vi.advanceTimersByTimeAsync(250);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(250);
      expect(upstream.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        '/api/session',
        '/auth/logout',
      ]);
    } finally {
      detach();
    }
  });
});
