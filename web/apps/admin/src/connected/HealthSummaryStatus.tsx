import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Chip } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { healthSummaryLabel, readHealthSummary } from '@doji/portal-data/employee-health-summary';

const visibility = () => `${document.visibilityState}:${navigator.onLine}`;
const subscribe = (change: () => void) => {
  document.addEventListener('visibilitychange', change);
  window.addEventListener('online', change);
  window.addEventListener('offline', change);
  return () => {
    document.removeEventListener('visibilitychange', change);
    window.removeEventListener('online', change);
    window.removeEventListener('offline', change);
  };
};
export default function HealthSummaryStatus({
  controller,
  chip: StatusChip,
  open,
}: {
  controller: EmployeeSessionController;
  chip: typeof Chip;
  open: () => void;
}) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const browser = useSyncExternalStore(subscribe, visibility);
  const online = browser.endsWith(':true');
  const active = browser === 'visible:true';
  const allowed =
    controller.healthSnapshotEnabled === true &&
    session.phase === 'ready' &&
    session.operator?.capabilities.operations_read === true;
  const summary = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'health-summary', { read: 'summary' })
      : ['denied-health-summary'],
    enabled: allowed && active,
    queryFn: ({ signal }) => readHealthSummary(controller, signal),
    staleTime: 60000,
    retry: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: (query) => (query.state.data?.enabled === false ? false : active && 60000),
    refetchIntervalInBackground: false,
  });
  const wasActive = useRef(active);
  const reconciled = useRef(0);
  useEffect(() => {
    if (
      !allowed ||
      !active ||
      summary.isFetching ||
      !summary.data?.enabled ||
      !session.session ||
      !session.cache ||
      reconciled.current === summary.dataUpdatedAt
    )
      return;
    reconciled.current = summary.dataUpdatedAt;
    // Only mounted Operations reads reconcile; the backend gate selects cached data.
    for (const read of ['snapshot', 'history'])
      void session.cache.invalidateQueries(
        {
          queryKey: portalKey(session.session, 'operations', { read }),
          exact: true,
          refetchType: 'active',
        },
        { cancelRefetch: false },
      );
  }, [
    allowed,
    active,
    summary.isFetching,
    summary.data?.enabled,
    summary.dataUpdatedAt,
    session.cache,
    session.session,
  ]);
  const { refetch } = summary;
  useEffect(() => {
    if (active && !wasActive.current && allowed) void refetch({ cancelRefetch: false });
    wasActive.current = active;
  }, [active, allowed, refetch]);
  const [, expire] = useState(0);
  const observedAt = summary.data?.enabled ? summary.data.observedAt : null;
  useEffect(() => {
    const remaining = Date.parse(observedAt ?? '') + 180001 - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => expire((n) => n + 1), Math.min(remaining, 2147483647));
    return () => clearTimeout(timer);
  }, [observedAt]);
  if (!allowed) return null;
  const label = healthSummaryLabel(summary.data, summary.isError, online, Date.now());
  if (!label) return null;
  return (
    <StatusChip
      size="small"
      label={label}
      onClick={open}
      title={`Delivery and backend checks—not all services. ${observedAt ? `Last checked: ${new Date(observedAt).toLocaleString()}. ` : ''}View platform health.`}
      color={
        label === 'Health: attention needed'
          ? 'error'
          : label === 'Health: outdated' || label === 'Health: unavailable'
            ? 'warning'
            : 'default'
      }
    />
  );
}
