import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { portalKey } from '@doji/portal-data';
import { canReadQueue, readEmployeeOverview } from '@doji/portal-data/employee-queues';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import type { WorkspaceDestination } from '@doji/ui';
import { OverviewPanel } from '../OverviewPanel';
import { readHomeEvent } from '../../../../packages/portal-data/src/employee-home';
export function WorkspaceOverview({
  controller,
  destinations,
}: {
  controller: EmployeeSessionController;
  destinations: readonly WorkspaceDestination[];
}) {
  const session = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const allowed = !!session.operator && canReadQueue(session.operator, 'my-work');
  const query = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'work', { area: 'overview' })
      : ['denied'],
    enabled: allowed && !!session.session,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readEmployeeOverview(controller, signal),
  });
  const canReadDoji = !!session.session && session.operator?.capabilities.operations_read === true;
  const doji = useQuery({
    queryKey: session.session
      ? portalKey(session.session, 'operations', { view: 'home-doji' })
      : ['denied-doji'],
    enabled: canReadDoji,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readHomeEvent(controller, signal),
  });
  if (!session.operator) return null;
  const rows = allowed && !query.isError ? (query.data?.items ?? []) : [];
  return (
    <OverviewPanel
      actor={session.operator}
      destinations={destinations}
      rows={rows}
      state={!allowed ? 'denied' : query.isPending ? 'loading' : query.isError ? 'error' : 'ready'}
      more={!!query.data?.next_cursor}
      retry={() => void query.refetch()}
      doji={
        canReadDoji
          ? {
              data: doji.isError ? undefined : doji.data,
              state: doji.isPending ? 'loading' : doji.isError ? 'error' : 'ready',
              retry: () => void doji.refetch(),
            }
          : undefined
      }
    />
  );
}
