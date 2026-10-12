import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button } from '@mui/material';
import { PageHeader, QueuePagination, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import {
  ideaFilters,
  readIdeaArchive,
  type IdeaCursor,
  type IdeaFilter,
} from '@doji/portal-data/idea-archive';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import { QueueStatusFilter } from './QueueStatusFilter';
import { WorkTable } from './WorkTable';

export function IdeaArchive({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params] = useSearchParams();
  const [pageSize, setPageSize] = useState(25);
  const raw = params.get('filter');
  const filter: IdeaFilter = ideaFilters.includes(raw as IdeaFilter) ? (raw as IdeaFilter) : 'all';
  const [paging, setPaging] = useState<{ filter: IdeaFilter; cursors: IdeaCursor[] }>({
    filter,
    cursors: [null],
  });
  const cursors = paging.filter === filter ? paging.cursors : [null],
    cursor = cursors.at(-1) ?? null;
  const allowed = !!state.session && state.operator?.capabilities.operations_read === true;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', {
          archive: 'ideas',
          filter,
          pageSize: String(pageSize),
          at: cursor?.at ?? '',
          id: cursor?.id ?? '',
        })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readIdeaArchive(controller, filter, cursor, signal, pageSize),
  });
  if (!allowed) return <Alert severity="error">Idea history access is unavailable.</Alert>;
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
      <PageHeader title="Community ideas" description="Submitted ideas · newest first" />
      <TableFrame
        label="Community ideas"
        state={status}
        emptyMessage="No ideas match this status."
        errorAction={<Button onClick={() => void query.refetch()}>Retry idea history</Button>}
        toolbar={<QueueStatusFilter area="community-ideas" value={filter} />}
        footer={
          <QueuePagination
            page={cursors.length}
            count={items.length}
            rowsPerPage={pageSize}
            onRowsPerPageChange={(size) => {
              setPageSize(size);
              setPaging({ filter, cursors: [null] });
            }}
            state={status}
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
          area="community-ideas"
          label="Community ideas"
          actor={state.operator!}
          returnFilter={filter}
          rows={items.map((item) => ({
            kind: 'suggestion',
            key: 'suggestion:' + item.id,
            id: item.id,
            subject: item.title || 'Untitled idea',
            at: item.at,
            assigned_to: null,
            assignmentKnown: false,
            work_state: item.status === 'pending' ? 'ready' : 'closed',
            status: item.status,
            due_at: null,
            ownership_model: 'staff_workflow',
          }))}
        />
      </TableFrame>
    </>
  );
}
