import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { PageHeader, QueuePagination, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import {
  ideaFilters,
  readIdeaArchive,
  type IdeaCursor,
  type IdeaFilter,
} from '@doji/portal-data/idea-archive';
import type { EmployeeSessionController } from '@doji/portal-data/employee';

export function IdeaArchive({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
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
          at: cursor?.at ?? '',
          id: cursor?.id ?? '',
        })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readIdeaArchive(controller, filter, cursor, signal),
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
      <Button component={Link} to="/community-ideas">
        Back to pending ideas
      </Button>
      <PageHeader title="Idea history" description="Submitted ideas · newest first" />
      <TableFrame
        label="idea history"
        state={status}
        emptyMessage="No ideas match this status."
        errorAction={<Button onClick={() => void query.refetch()}>Retry idea history</Button>}
        toolbar={
          <TextField
            select
            label="Idea status"
            value={filter}
            onChange={(event) => {
              setPaging({ filter: event.target.value as IdeaFilter, cursors: [null] });
              setParams({ filter: event.target.value });
            }}
          >
            {ideaFilters.map((value) => (
              <MenuItem key={value} value={value}>
                {
                  {
                    all: 'All ideas',
                    pending: 'Pending review',
                    approved: 'Accepted',
                    rejected: 'Declined',
                  }[value]
                }
              </MenuItem>
            ))}
          </TextField>
        }
        footer={
          <QueuePagination
            page={cursors.length}
            count={items.length}
            rowsPerPage={25}
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
        <Table stickyHeader aria-label="Idea history" sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow>
              {['Idea', 'Submitted by', 'Submitted', 'Status'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const path = '/community-ideas/' + item.id + '?archive=' + filter;
              return (
                <TableRow
                  key={item.id}
                  hover
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('a,button')) navigate(path);
                  }}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Button component={Link} to={path}>
                      {item.title || 'Untitled idea'}
                    </Button>
                  </TableCell>
                  <TableCell>{item.author}</TableCell>
                  <TableCell>{new Date(item.at).toLocaleString()}</TableCell>
                  <TableCell>
                    {
                      { pending: 'Pending review', approved: 'Accepted', rejected: 'Declined' }[
                        item.status
                      ]
                    }
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}
