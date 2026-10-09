import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalKey } from '@doji/portal-data';
import { readEmployeeHealth, readEmployeeHealthHistory } from '@doji/portal-data/employee-health';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { evaluate } from '../../../../../website/admin-portal/health-model.mts';

export function useEmployeeHealth(controller: EmployeeSessionController) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const enabled =
    session.phase === 'ready' && session.operator?.capabilities.operations_read === true;
  const snapshot = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'operations', { read: 'snapshot' })
      : ['denied-health'],
    enabled,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readEmployeeHealth(controller, signal),
  });
  const history = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'operations', { read: 'history' })
      : ['denied-history'],
    enabled,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readEmployeeHealthHistory(controller, signal),
  });
  const [clockTick, tick] = useState(0);
  // Local reclassification at the next expiry only: no timer triggers network requests.
  useEffect(() => {
    const current = Date.now();
    const times = [
      snapshot.data?.operational.checked_at,
      snapshot.data?.sentry.observed_at,
      snapshot.data?.generated_at,
    ]
      .filter((x): x is string => !!x)
      .flatMap((x) => [Date.parse(x) - 60000, Date.parse(x) + 180001]);
    for (const item of history.data ?? []) {
      const at = Date.parse(item.observed_through ?? item.closes_at ?? item.fires_at ?? '');
      if (Number.isFinite(at)) times.push(at, at + 86400001);
    }
    const next = Math.min(...times.filter((x) => x > current));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => tick((value) => value + 1),
      Math.min(next - current, 2147483647),
    );
    return () => clearTimeout(timer);
  }, [snapshot.data, history.data, clockTick]);
  const data = snapshot.isError ? undefined : snapshot.data;
  const rows = history.isError ? [] : (history.data ?? []);
  const assessment = evaluate({
    operational: data?.operational ?? {},
    sentry: data?.sentry ?? {},
    history: rows,
    generatedAt: data?.generated_at ?? '',
    failed: snapshot.isError,
    historyFailed: history.isError,
    loaded: !snapshot.isPending,
    historyLoaded: !history.isPending,
    now: Date.now(),
  });
  return { snapshot, history, data, rows, assessment };
}
