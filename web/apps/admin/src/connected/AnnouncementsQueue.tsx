import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  MenuItem,
  Chip,
  Link as MuiLink,
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
  announcementFilters,
  announcementLabels,
  readAnnouncements,
  type AnnouncementFilter,
  type AnnouncementCursor,
} from '@doji/portal-data/announcements';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
export function AnnouncementsQueue({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AnnouncementFilter>('all');
  const [cursors, setCursors] = useState<AnnouncementCursor[]>([null]);
  const cursor = cursors.at(-1) ?? null;
  const allowed = !!state.session && state.operator?.capabilities.operations_read === true;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'announcements', {
          filter,
          at: cursor?.at ?? '',
          id: cursor?.id ?? '',
        })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readAnnouncements(controller, filter, cursor, signal),
  });
  if (!allowed) return <Alert severity="error">Announcement access is unavailable.</Alert>;
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
      <PageHeader
        title="Announcements"
        description="Member messages · newest first"
        action={
          controller.announcementWritesEnabled &&
          query.data?.canWrite &&
          state.operator?.capabilities.operator_manage && (
            <Button component={Link} to="/announcements/new" variant="contained">
              New announcement
            </Button>
          )
        }
      />
      {!controller.announcementWritesEnabled && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Read-only in this candidate. Creating and publishing messages still uses the existing
          production portal.
        </Alert>
      )}
      <TableFrame
        label="announcements"
        state={status}
        emptyMessage="No announcements match this status."
        errorAction={<Button onClick={() => void query.refetch()}>Retry announcements</Button>}
        toolbar={
          <TextField
            select
            label="Announcement status"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value as AnnouncementFilter);
              setCursors([null]);
            }}
          >
            {announcementFilters.map((value) => (
              <MenuItem key={value} value={value}>
                {
                  {
                    all: 'All announcements',
                    draft: 'Drafts',
                    published: 'Published',
                    cancelled: 'Cancelled',
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
            previous={() => setCursors(cursors.slice(0, -1))}
            next={() => {
              if (query.data?.next) setCursors([...cursors, query.data.next]);
            }}
          />
        }
      >
        <Table stickyHeader aria-label="Announcements" sx={{ minWidth: 760, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              {['Message', 'Display window', 'Status', 'Created'].map((label, index) => (
                <TableCell
                  key={label}
                  sx={{ width: index === 0 ? '32%' : index === 1 ? '30%' : '19%' }}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => {
              const path = '/announcements/' + item.id;
              return (
                <TableRow
                  key={item.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('a,button')) navigate(path);
                  }}
                >
                  <TableCell>
                    <MuiLink
                      component={Link}
                      to={path}
                      underline="hover"
                      sx={{ color: 'text.primary', fontWeight: 600, overflowWrap: 'anywhere' }}
                    >
                      {item.title}
                    </MuiLink>
                  </TableCell>
                  <TableCell>
                    {new Date(item.starts).toLocaleString()} –{' '}
                    {new Date(item.ends).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" label={announcementLabels[item.status]} />
                  </TableCell>
                  <TableCell>{new Date(item.at).toLocaleString()}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}
