import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Chip,
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
import type { EmployeeSessionController } from '@doji/portal-data/employee';
import {
  canReadPrivacy,
  privacyKinds,
  privacyStates,
  readPrivacyPage,
  type PrivacyCursor,
  type PrivacyState,
} from '@doji/portal-data/privacy-record';

export function PrivacyQueue({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const raw = params.get('state') ?? '';
  const filter: PrivacyState = Object.hasOwn(privacyStates, raw) ? (raw as PrivacyState) : 'open';
  const [paging, setPaging] = useState<{ filter: PrivacyState; cursors: PrivacyCursor[] }>({
    filter,
    cursors: [null],
  });
  const cursors = paging.filter === filter ? paging.cursors : [null],
    cursor = cursors.at(-1) ?? null;
  const allowed = !!state.session && canReadPrivacy(controller);
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'work', {
          privacy: 'queue',
          filter,
          due: cursor?.due ?? '',
          id: cursor?.id ?? '',
        })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readPrivacyPage(controller, filter, cursor, signal),
  });
  if (!allowed) return <Alert severity="error">Privacy review access is unavailable.</Alert>;
  const rows = query.isError ? [] : (query.data?.items ?? []);
  const status = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : rows.length
        ? 'ready'
        : 'empty';
  return (
    <>
      <PageHeader
        title="Business privacy"
        description="Verified support requests · earliest assessed deadline first"
        action={
          <Button component={Link} to="/business-privacy/new" variant="contained">
            Log verified request
          </Button>
        }
      />
      <TableFrame
        label="business privacy requests"
        state={status}
        emptyMessage="No requests match this status."
        errorAction={<Button onClick={() => void query.refetch()}>Retry privacy queue</Button>}
        toolbar={
          <TextField
            select
            label="Request status"
            value={filter}
            onChange={(event) => {
              setPaging({ filter: event.target.value as PrivacyState, cursors: [null] });
              setParams({ state: event.target.value });
            }}
          >
            {Object.entries(privacyStates).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
        }
        footer={
          <QueuePagination
            page={cursors.length}
            count={rows.length}
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
        <Table stickyHeader aria-label="Business privacy requests" sx={{ minWidth: 700 }}>
          <TableHead>
            <TableRow>
              {['Request', 'Reference', 'Assessed deadline', 'Status'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const path = '/business-privacy/' + row.id + '?state=' + filter;
              return (
                <TableRow
                  key={row.id}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('a,button')) navigate(path);
                  }}
                >
                  <TableCell>
                    <Button component={Link} to={path}>
                      {privacyKinds[row.kind]}
                    </Button>
                  </TableCell>
                  <TableCell>{row.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell>{new Date(row.due).toLocaleString()}</TableCell>
                  <TableCell>
                    <Chip label={privacyStates[row.state]} size="small" variant="outlined" />
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
