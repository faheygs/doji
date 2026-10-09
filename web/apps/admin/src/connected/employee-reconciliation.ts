import type { EmployeeSessionController } from '@doji/portal-data/employee';

/** Event-driven, bounded recovery. No polling, signed-out work, or event-supplied data. */
export function attachEmployeeReconciliation(controller: EmployeeSessionController) {
  let stopped = false;
  let running = false;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const eligible = () =>
    !stopped &&
    document.visibilityState !== 'hidden' &&
    navigator.onLine &&
    controller.getSnapshot().phase === 'ready';
  async function reconcile() {
    timer = undefined;
    if (!eligible()) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      // Re-authorize before refreshing. A role change replaces the entire session cache.
      await controller.restore();
      if (!eligible()) return;
      const { session, cache } = controller.getSnapshot();
      if (session && cache)
        await cache.invalidateQueries(
          {
            queryKey: ['portal', session.realm, session.subject, session.epoch],
            refetchType: 'active',
          },
          { cancelRefetch: false },
        );
    } finally {
      running = false;
      if (pending) {
        pending = false;
        schedule();
      }
    }
  }
  function schedule() {
    if (!eligible() || timer !== undefined) return;
    timer = setTimeout(() => {
      void reconcile();
    }, 250);
  }
  window.addEventListener('focus', schedule);
  window.addEventListener('online', schedule);
  document.addEventListener('visibilitychange', schedule);
  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener('focus', schedule);
    window.removeEventListener('online', schedule);
    document.removeEventListener('visibilitychange', schedule);
  };
}
