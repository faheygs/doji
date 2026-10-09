import { lazy, Suspense, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { PageHeader, QueuePagination, TableFrame } from '@doji/ui';
import { portalKey } from '@doji/portal-data';
import {
  auditCategories,
  readEmployeeAudit,
  type AuditCategory,
  type AuditCursor,
} from '@doji/portal-data/employee-audit';
import type { EmployeeSessionController } from '@doji/portal-data/employee';
const AuditExportButton = lazy(() =>
  import('./AuditExportButton').then((module) => ({ default: module.AuditExportButton })),
);
const AuditDetail = lazy(() =>
  import('./AuditDetail').then((module) => ({ default: module.AuditDetail })),
);
export function AuditRecord({ controller }: { controller: EmployeeSessionController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [category, setCategory] = useState<AuditCategory>('activity');
  const [draft, setDraft] = useState(''),
    [search, setSearch] = useState('');
  const [cursors, setCursors] = useState<AuditCursor[]>([null]);
  const [selected, setSelected] = useState<string | null>(null);
  const cursor = cursors.at(-1) ?? null;
  const allowed = !!state.session && state.operator?.capabilities.operations_read === true;
  const query = useQuery({
    queryKey: state.session
      ? portalKey(state.session, 'audit', {
          category,
          search,
          at: cursor?.occurred_at ?? '',
          id: cursor?.id ?? '',
        })
      : ['denied'],
    enabled: allowed,
    refetchOnMount: 'always',
    queryFn: ({ signal }) => readEmployeeAudit(controller, category, search, cursor, signal),
  });
  if (!allowed) return <Alert severity="error">Audit access is unavailable.</Alert>;
  const items = query.isError ? [] : (query.data?.items ?? []);
  const status = query.isPending
    ? 'loading'
    : query.isError
      ? 'error'
      : items.length
        ? 'ready'
        : 'empty';
  if (selected) {
    const item = items.find((entry) => entry.id === selected);
    if (item)
      return (
        <Suspense fallback={<TableFrame label="audit event" state="loading" footer={null} />}>
          <AuditDetail item={item} actor={state.operator!} back={() => setSelected(null)} />
        </Suspense>
      );
    return (
      <Stack sx={{ gap: 2 }}>
        <Button onClick={() => setSelected(null)}>Back to audit log</Button>
        <Alert severity="warning">
          This event is no longer available in the authorized page. Return to the audit log to
          reconcile.
        </Alert>
      </Stack>
    );
  }
  return (
    <>
      <PageHeader title="Audit log" description="Recorded administrative activity · newest first" />
      <Suspense fallback={<Button disabled>Loading export…</Button>}>
        <AuditExportButton
          key={category + ':' + search}
          controller={controller}
          category={category}
          search={search}
        />
      </Suspense>
      <TableFrame
        label="audit log"
        state={status}
        emptyMessage="No activity matches these filters."
        errorAction={<Button onClick={() => void query.refetch()}>Retry audit read</Button>}
        toolbar={
          <Stack
            component="form"
            direction={{ xs: 'column', sm: 'row' }}
            sx={{ gap: 2 }}
            onSubmit={(event) => {
              event.preventDefault();
              setSearch(draft.trim());
              setCursors([null]);
            }}
          >
            <TextField
              select
              label="Category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value as AuditCategory);
                setCursors([null]);
              }}
            >
              {auditCategories.map((value) => (
                <MenuItem key={value} value={value}>
                  {value === 'activity'
                    ? 'Activity (excluding evidence views)'
                    : value[0]!.toUpperCase() + value.slice(1)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Search audit"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 160 } }}
              sx={{ flex: 1 }}
            />
            <Button type="submit" disabled={query.isFetching}>
              Search
            </Button>
          </Stack>
        }
        footer={
          <QueuePagination
            page={cursors.length}
            count={items.length}
            rowsPerPage={25}
            state={status}
            hasPrevious={cursors.length > 1 && !query.isFetching}
            hasNext={!!query.data?.next && !query.isFetching && !query.isError}
            previous={() => setCursors((values) => values.slice(0, -1))}
            next={() => {
              if (query.data?.next) setCursors((values) => [...values, query.data!.next]);
            }}
          />
        }
      >
        <Table stickyHeader aria-label="Audit log" sx={{ minWidth: 800 }}>
          <TableHead>
            <TableRow>
              {['When', 'Actor', 'Action', 'Record', 'Reason'].map((label) => (
                <TableCell key={label}>{label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                hover
                onClick={() => setSelected(item.id)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{new Date(item.at).toLocaleString()}</TableCell>
                <TableCell>{item.actor}</TableCell>
                <TableCell>
                  <Button
                    onClick={() => setSelected(item.id)}
                    aria-label={'Open audit event ' + item.id}
                  >
                    {item.action}
                  </Button>
                </TableCell>
                <TableCell>
                  <Typography>{item.entityType}</Typography>
                  <Typography variant="caption">{item.entityId}</Typography>
                </TableCell>
                <TableCell sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {item.reason || '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}
