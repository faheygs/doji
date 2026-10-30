import { useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { TableFrame } from '@doji/ui';
import {
  workflowNames,
  phaseNames,
  cleanupNames,
} from '../../../../packages/portal-data/src/workflow-health';
import type { WorkflowHealth } from '../../../../packages/portal-data/src/workflow-health';

export function OperationsWorkflows({
  data,
  loading,
  failed,
  retry,
}: {
  data: WorkflowHealth | undefined;
  loading: boolean;
  failed: boolean;
  retry: () => void;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  if (loading)
    return <TableFrame label="backend workflow readings" state="loading" footer={null} />;
  const fresh =
    data &&
    Date.parse(data.observed_at) <= Date.now() + 60000 &&
    Date.now() - Date.parse(data.observed_at) <= 180000;
  if (failed || !data || !fresh)
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" onClick={retry}>
            Retry
          </Button>
        }
      >
        Backend workflow readings are {data && !failed ? 'outdated' : 'unavailable'}. Cleanup and
        Doji processing cannot be verified from this read.
      </Alert>
    );
  const receipts = [...data.receipts].sort(
    (a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at),
  );
  const currentPage = Math.min(page, Math.max(0, Math.ceil(receipts.length / pageSize) - 1));
  return (
    <Stack sx={{ gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography variant="h5" component="h2">
          Backend processing &amp; cleanup
        </Typography>
        <Typography sx={{ my: 1 }}>
          Current hour and previous 23 hours. Counts are recorded attempts, including retries and
          no-op checks—not people, completed Dojis or app success rates.
        </Typography>
        <Chip
          label={data.enabled ? 'Observation enabled' : 'Observation disabled'}
          color={data.enabled ? 'default' : 'warning'}
          variant="outlined"
        />
        <Typography variant="caption" sx={{ display: 'block' }}>
          Read at {new Date(data.observed_at).toLocaleString()}. Best-effort logging can miss
          attempts.
        </Typography>
      </Paper>
      {!data.hours.length ? (
        <Alert severity="info">
          No backend attempts were recorded in this window. This does not establish healthy
          processing.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table aria-label="Backend attempts">
            <TableHead>
              <TableRow>
                <TableCell>Workflow</TableCell>
                <TableCell align="right">Succeeded</TableCell>
                <TableCell align="right">Failed</TableCell>
                <TableCell align="right">Deferred</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(workflowNames).map(([name, label]) => {
                const items = data.hours.filter((row) => row.workflow === name);
                return (
                  <TableRow key={name}>
                    <TableCell>{label}</TableCell>
                    {(['succeeded', 'failed', 'deferred'] as const).map((outcome) => (
                      <TableCell align="right" key={outcome}>
                        {items.length
                          ? items
                              .filter((row) => row.outcome === outcome)
                              .reduce((sum, row) => sum + row.attempts, 0)
                              .toLocaleString()
                          : 'Not observed'}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Typography component="h3" variant="h6">
        Latest result of each kind
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Historical receipts may be older than this window. A failed result is not proof of rollback;
        confirmed cleanup counts can include partial progress. Deferred work still needs a later
        check.
      </Typography>
      <TableFrame
        label="workflow receipts"
        state={receipts.length ? 'ready' : 'empty'}
        footer={
          <TablePagination
            component="div"
            count={receipts.length}
            page={currentPage}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[5, 10, 15]}
            onPageChange={(_, next) => setPage(next)}
            onRowsPerPageChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
          />
        }
      >
        <Table aria-label="Workflow receipts">
          <TableHead>
            <TableRow>
              <TableCell>Workflow / result</TableCell>
              <TableCell>Recorded</TableCell>
              <TableCell>Phase</TableCell>
              <TableCell>Confirmed cleanup</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {receipts.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row) => (
              <TableRow key={`${row.workflow}:${row.outcome}`}>
                <TableCell>
                  {workflowNames[row.workflow]} ·{' '}
                  {row.outcome === 'succeeded'
                    ? 'Succeeded'
                    : row.outcome === 'failed'
                      ? 'Failed'
                      : 'Deferred'}
                </TableCell>
                <TableCell>{new Date(row.observed_at).toLocaleString()}</TableCell>
                <TableCell>{phaseNames[row.phase]}</TableCell>
                <TableCell>
                  {Object.entries(row.counts)
                    .map(
                      ([key, count]) =>
                        `${cleanupNames[key as keyof typeof cleanupNames]}: ${count}`,
                    )
                    .join('; ') || 'No cleanup counts recorded'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography component="h3" variant="h6">
          Scheduler history retention
        </Typography>
        <Typography>
          {data.retention_enabled
            ? 'Enabled: completed successful runs older than 30 days and failed runs older than 90 days are eligible, except evidence holds.'
            : 'Disabled. This screen does not enable deletion.'}
        </Typography>
        <Typography variant="body2">
          {data.scheduler
            ? `Last batch: ${new Date(data.scheduler.observed_at).toLocaleString()}. ${data.scheduler.scanned} records inspected; ${data.scheduler.succeeded_deleted} successful and ${data.scheduler.failed_deleted} failed records removed. ${data.scheduler.has_more ? 'More records remain to inspect.' : 'That scan reached its end.'}`
            : 'No scheduler cleanup receipt is available.'}
        </Typography>
      </Paper>
    </Stack>
  );
}
