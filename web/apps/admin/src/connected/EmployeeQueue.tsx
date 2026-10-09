import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { PageHeader, QueuePagination, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import {
  canReadQueue,
  queueDefinitions,
  readEmployeeQueue,
  type EmployeeQueue as QueueArea,
  type QueueCursor,
} from '@doji/portal-data/employee-queues';
import { WorkTable } from './WorkTable';

/** No fixture fallback. Every row must pass the existing employee queue validator. */
export function EmployeeQueue({
  controller,
  area,
}: {
  controller: EmployeeSessionController;
  area: QueueArea;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params, setParams] = useSearchParams();
  const safety = area === 'trust-safety' || area === 'restricted-safety';
  const closed = safety && params.get('closed') === '1';
  const [paging, setPaging] = useState({ closed, cursors: [null] as QueueCursor[] });
  const cursors = paging.closed === closed ? paging.cursors : [null];
  const setCursors = (update: (values: QueueCursor[]) => QueueCursor[]) =>
    setPaging({ closed, cursors: update(cursors) });
  const allowed = !!state.operator && canReadQueue(state.operator, area);
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, area.includes('safety') ? 'safety' : 'work', {
          area,
          closed: String(closed),
          at: cursor?.at ?? '',
          key: cursor?.key ?? '',
        })
      : ['denied'],
    enabled: allowed && !!state.session,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readEmployeeQueue(controller, area, cursor, signal, closed),
  });
  if (!allowed) return <Alert severity="error">You do not have access to this queue.</Alert>;
  const rows = query.isError ? [] : (query.data?.items ?? []);
  const tableState = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : rows.length
        ? 'ready'
        : 'empty';
  return (
    <>
      <PageHeader
        title={queueDefinitions[area].label}
        description={
          area === 'my-work'
            ? 'Open work assigned to you.'
            : (closed ? 'Closed cases' : 'Open work') + ' · oldest first'
        }
        action={
          area === 'community-ideas' && (
            <Button component={Link} to="/community-ideas/archive">
              View idea history
            </Button>
          )
        }
      />
      <TableFrame
        label={queueDefinitions[area].label}
        state={tableState}
        emptyMessage={closed ? 'No closed cases in this view.' : 'No open work in this view.'}
        toolbar={
          <Stack
            direction="row"
            sx={{ gap: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
          >
            {safety ? (
              <TextField
                size="small"
                select
                label="Case status"
                value={closed ? 'closed' : 'open'}
                onChange={(event) => {
                  const nextClosed = event.target.value === 'closed';
                  setPaging({ closed: nextClosed, cursors: [null] });
                  setParams(nextClosed ? { closed: '1' } : {});
                }}
              >
                <MenuItem value="open">Open cases</MenuItem>
                <MenuItem value="closed">Closed cases</MenuItem>
              </TextField>
            ) : (
              <Typography variant="subtitle2">
                {area === 'my-work' ? 'Assigned to you' : 'Awaiting review'}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              Oldest first · 25 per page
            </Typography>
          </Stack>
        }
        errorAction={<Button onClick={() => void query.refetch()}>Retry queue read</Button>}
        footer={
          <QueuePagination
            page={cursors.length}
            count={rows.length}
            rowsPerPage={25}
            state={tableState}
            hasPrevious={cursors.length > 1 && !query.isFetching}
            hasNext={!!query.data?.next_cursor && !query.isFetching && !query.isError}
            previous={() => setCursors((values) => values.slice(0, -1))}
            next={() => {
              if (query.data?.next_cursor)
                setCursors((values) => [...values, query.data!.next_cursor]);
            }}
          />
        }
      >
        <WorkTable
          rows={rows}
          area={area}
          actor={state.operator!}
          label={queueDefinitions[area].label}
          closed={closed}
        />
      </TableFrame>
    </>
  );
}
