import { useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button } from '@mui/material';
import { PageHeader, QueuePagination, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import {
  businessFilters,
  readBusinessPage,
  type BusinessFilter,
  type BusinessCursor,
} from '@doji/portal-data/business-page';
import { QueueStatusFilter } from './QueueStatusFilter';
import { WorkTable } from './WorkTable';

export function BusinessQueue({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const raw = params.get('filter');
  const filter: BusinessFilter = businessFilters.includes(raw as BusinessFilter)
    ? (raw as BusinessFilter)
    : 'pending';
  const [pageSize, setPageSize] = useState(25);
  const [paging, setPaging] = useState({ filter, cursors: [null] as BusinessCursor[] });
  const cursors = paging.filter === filter ? paging.cursors : [null],
    cursor = cursors.at(-1) ?? null;
  const allowed = !!state.session && state.operator?.capabilities.business_read === true;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', {
          area: 'businesses',
          filter,
          pageSize: String(pageSize),
          at: cursor?.at ?? '',
          id: cursor?.id ?? '',
        })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readBusinessPage(controller, filter, cursor, signal, pageSize),
  });
  if (!allowed) return <Alert severity="error">Business access is unavailable.</Alert>;
  const items = query.isError ? [] : (query.data?.items ?? []);
  const status = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : items.length
        ? 'ready'
        : 'empty';
  return (
    <>
      <PageHeader title="Business applications" description="Applications · oldest update first" />
      <TableFrame
        label="Business applications"
        state={status}
        emptyMessage="No applications match this status."
        toolbar={<QueueStatusFilter area="businesses" value={filter} />}
        errorAction={<Button onClick={() => void query.refetch()}>Retry applications</Button>}
        footer={
          <QueuePagination
            page={cursors.length}
            count={items.length}
            rowsPerPage={pageSize}
            state={status}
            onRowsPerPageChange={(size) => {
              setPageSize(size);
              setPaging({ filter, cursors: [null] });
            }}
            hasPrevious={cursors.length > 1 && !query.isFetching}
            hasNext={!!query.data?.next && !query.isFetching && !query.isError}
            previous={() => setPaging({ filter, cursors: cursors.slice(0, -1) })}
            next={() => {
              if (query.data?.next) setPaging({ filter, cursors: [...cursors, query.data.next] });
            }}
          />
        }
      >
        <WorkTable
          area="businesses"
          label="Business applications"
          actor={state.operator!}
          returnFilter={filter}
          dateLabel="Updated"
          rows={items.map((item) => ({
            id: item.id,
            key: 'business_application:' + item.id,
            kind: 'business_application',
            subject: item.name,
            at: item.at,
            assigned_to: null,
            assignmentKnown: false,
            due_at: null,
            status: item.state,
            work_state: ['approved', 'declined'].includes(item.state)
              ? 'closed'
              : item.state === 'changes_requested'
                ? 'waiting'
                : 'ready',
            ownership_model: 'staff_workflow',
          }))}
        />
      </TableFrame>
    </>
  );
}
